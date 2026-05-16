// Maandelijkse cron: detecteer bevestigde events zonder gekoppelde rit.
// Stuurt notificatie per Pro/Enterprise-tenant.
// Beveiliging: CRON_SECRET via Authorization header (Vercel cron-pattern).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';

export const runtime = 'nodejs';
export const maxDuration = 300;

const VERGETEN_SYSTEM = `Je krijgt een lijst bevestigde events van een cateraar zonder gekoppelde rit. Bepaal welke events waarschijnlijk een rit hadden gehad (op basis van locatie + datum) en formuleer 1 vriendelijke notificatie-zin.

Output ALLEEN JSON:

{
  "te_pakken": [{"event_id": number, "reden": "string (1 zin)"}],
  "notificatie": "string (1-2 zinnen Nederlands, vriendelijk, geen pushy taal)"
}

Regels:
- Negeer events met locatie = "Online", "Telefoon", of leeg.
- Negeer events ouder dan 90 dagen.
- Maximaal 10 events in te_pakken.
- Geen markdown, alleen JSON.`;

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'API key' }, { status: 500 });

  const sb = createServiceSupabase();

  const { data: orgs } = await sb
    .from('organizations')
    .select('id, plan')
    .in('plan', ['professional', 'enterprise']);
  if (!orgs?.length) return NextResponse.json({ ok: true, processed: 0 });

  const client = new Anthropic({ apiKey });
  const model = 'claude-haiku-4-5';
  let processed = 0;

  const sinds = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);

  for (const org of orgs) {
    const { data: events } = await sb
      .from('events')
      .select('id, date, location, name')
      .eq('organization_id', org.id)
      .eq('status', 'confirmed')
      .gte('date', sinds);
    if (!events?.length) continue;

    const { data: ritten } = await sb
      .from('ritten')
      .select('event_id')
      .eq('organization_id', org.id)
      .gte('datum', sinds)
      .not('event_id', 'is', null);
    const gekoppeld = new Set((ritten ?? []).map((r) => r.event_id));

    const zonderRit = events.filter((e) => !gekoppeld.has(e.id));
    if (zonderRit.length === 0) continue;

    let response;
    try {
      const stream = client.messages.stream({
        model,
        max_tokens: 500,
        system: [
          {
            type: 'text',
            text: VERGETEN_SYSTEM,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: `<events>${JSON.stringify(zonderRit)}</events>\nJSON.`,
          },
        ],
        thinking: { type: 'disabled' as const },
      } as any);
      response = await stream.finalMessage();
    } catch (err) {
      console.warn(`[cron/ritten-vergeten] Anthropic error voor org ${org.id}:`, (err as Error).message);
      continue;
    }

    if (response.usage) {
      const u = response.usage;
      logAiUsageServer({
        organization_id: org.id,
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
        metadata: { action: 'ritten-vergeten-cron' },
      }).catch(() => {});
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    const raw = textBlock?.type === 'text' ? textBlock.text.trim() : '';
    const cleaned = raw
      .replace(/^```(?:json)?\s*/, '')
      .replace(/\s*```$/, '')
      .trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      continue;
    }

    const validIds = new Set(zonderRit.map((e) => e.id));
    const tePakken = (parsed.te_pakken ?? [])
      .filter((x: any) => x && validIds.has(x.event_id))
      .slice(0, 10);
    if (!tePakken.length) continue;

    // Insert notificatie — fail silently als notifications-tabel niet bestaat
    await sb
      .from('notifications')
      .insert({
        organization_id: org.id,
        type: 'ritten_vergeten',
        titel: 'Vergeten ritten',
        body: parsed.notificatie ?? `${tePakken.length} events zonder gekoppelde rit.`,
        metadata: { event_ids: tePakken.map((x: any) => x.event_id) },
      })
      .then(() => {
        processed++;
      })
      .then(undefined, (e: unknown) => {
        console.warn(`[cron/ritten-vergeten] insert failed voor org ${org.id}:`, (e as Error).message);
      });
  }

  return NextResponse.json({ ok: true, processed });
}
