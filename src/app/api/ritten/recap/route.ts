// Kwartaal-recap voor de boekhouder. Haiku 4.5.
// Pillar #4: bedragen + totalen blijven server-side. AI noemt geen tarief.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';
import { kwartaalRange, bedragAftrekbaar } from '@/lib/ritten-tarieven';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RECAP_SYSTEM = `Je bent een no-nonsense administratie-assistent voor een Nederlandse cateraar. Je krijgt een lijst zakelijke ritten van één kwartaal en geeft een korte recap voor de boekhouder.

Output ALLEEN JSON:

{
  "samenvatting": "string (1-2 zinnen totaal beeld)",
  "opmerkelijkheden": [
    { "type": "ontbrekend_doel" | "lange_rit" | "ontbrekend_event_link" | "duplicaat_verdacht" | "anders",
      "rit_id": number, "uitleg": "string (1 zin)" }
  ],
  "advies_boekhouder": "string (1 zin: wat moet de boekhouder controleren of accepteren)"
}

Regels:
- "lange_rit" = >300 km in één rit. Niet automatisch fout, wel vermeld voor controle.
- "ontbrekend_doel" = lege of kortere-dan-3-tekens doel-veld.
- "duplicaat_verdacht" = zelfde voertuig + zelfde adres-paar + zelfde dag = mogelijk dubbel ingevoerd.
- Maximaal 5 opmerkelijkheden — focus op de meest relevante.
- NOOIT bedragen, tarieven, of "€"-symbolen in de output.
- NOOIT inhoudelijk fiscaal advies geven; je bent een controleur, geen accountant.
- Geen HTML, geen <script>-tags, geen markdown fences. Alleen JSON.`;

interface Body {
  jaar?: number;
  kwartaal?: 1 | 2 | 3 | 4;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'API key ontbreekt' }, { status: 500 });

  const body: Body = await req.json().catch(() => ({}));
  if (!body.jaar || !body.kwartaal) {
    return NextResponse.json({ error: 'jaar + kwartaal verplicht' }, { status: 400 });
  }

  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { data: mem } = await sb
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!mem) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

  const { start, eind } = kwartaalRange(body.jaar, body.kwartaal);
  const { data: ritten } = await sb
    .from('ritten')
    .select('id, datum, vertrek_adres, aankomst_adres, kilometers, zakelijk, doel, voertuig_id, event_id, prive_omleiding_km')
    .gte('datum', start)
    .lte('datum', eind)
    .eq('zakelijk', true)
    .order('datum');

  if (!ritten || ritten.length === 0) {
    return NextResponse.json({
      recap: {
        samenvatting: `Geen zakelijke ritten in Q${body.kwartaal} ${body.jaar}.`,
        opmerkelijkheden: [],
        advies_boekhouder: 'Geen actie nodig.',
      },
      totalen_server: { totaal_km: 0, totaal_aftrek: 0 },
    });
  }

  // Server-side totalen — NOOIT door AI
  const totaalKm = ritten.reduce((s, r) => s + r.kilometers, 0);
  const totaalAftrek = ritten.reduce(
    (s, r) =>
      s +
      bedragAftrekbaar({
        kilometers: r.kilometers,
        zakelijk: r.zakelijk,
        priveOmleidingKm: r.prive_omleiding_km,
        datum: r.datum,
      }),
    0,
  );

  // Compacte rit-data voor de prompt (geen interne kolommen, geen org_id)
  const rittenForPrompt = ritten.map((r) => ({
    rit_id: r.id,
    datum: r.datum,
    van: r.vertrek_adres,
    naar: r.aankomst_adres,
    km: r.kilometers,
    doel: r.doel ?? '',
    heeft_event: r.event_id !== null,
  }));

  const client = new Anthropic({ apiKey });
  const model = 'claude-haiku-4-5';

  const stream = client.messages.stream({
    model,
    max_tokens: 800,
    system: [
      {
        type: 'text',
        text: RECAP_SYSTEM,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `<kwartaal>Q${body.kwartaal} ${body.jaar}</kwartaal>
<aantal_ritten>${ritten.length}</aantal_ritten>
<rit_data>${JSON.stringify(rittenForPrompt)}</rit_data>
JSON.`,
      },
    ],
    thinking: { type: 'disabled' as const },
  } as any);
  const response = await stream.finalMessage();

  if (response.usage) {
    const u = response.usage;
    logAiUsageServer({
      organization_id: mem.organization_id,
      user_id: user.id,
      action_type: 'other',
      model,
      tokens_input: u.input_tokens,
      tokens_output: u.output_tokens,
      tokens_cache_read: u.cache_read_input_tokens ?? 0,
      tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
      cost_eur_cents: estimateAiCostCents({
        model,
        tokens_input: u.input_tokens,
        tokens_output: u.output_tokens,
        tokens_cache_read: u.cache_read_input_tokens ?? 0,
        tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
      }),
      metadata: { action: 'ritten-recap', kwartaal: `Q${body.kwartaal}-${body.jaar}` },
    }).catch(() => {
      /* non-blocking */
    });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  const raw = textBlock?.type === 'text' ? textBlock.text.trim() : '';
  const cleaned = raw
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
  let recap: any;
  try {
    recap = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: 'AI gaf geen JSON' }, { status: 422 });
  }

  // Anti-hallucinatie: filter rit_ids
  const validIds = new Set(ritten.map((r) => r.id));
  if (Array.isArray(recap.opmerkelijkheden)) {
    recap.opmerkelijkheden = recap.opmerkelijkheden
      .filter((o: any) => o && typeof o.rit_id === 'number' && validIds.has(o.rit_id))
      .slice(0, 5);
  } else {
    recap.opmerkelijkheden = [];
  }

  return NextResponse.json({
    recap,
    totalen_server: { totaal_km: totaalKm, totaal_aftrek: Number(totaalAftrek.toFixed(2)) },
  });
}
