import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { BriefingCandidate } from '@/lib/today-briefing-rules';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';
import { enforceAiCap } from '@/lib/aiCostCap';
import { withTenantAuth } from '@/lib/withTenantAuth';

/**
 * AI-briefing endpoint voor /Vandaag.
 *
 * Client (page.tsx) berekent candidates met today-briefing-rules.ts en POST't
 * ze hier. Wij sturen ze naar Claude Haiku met een tool-use schema voor strakke
 * 1-regel-bullets in Mathijs' tone-of-voice. System prompt wordt gecached
 * (prompt caching, 5-min TTL) zodat herhaalde calls cheap zijn.
 *
 * Input:  { candidates: BriefingCandidate[], firstName?: string, time?: string }
 * Output: { bullets: AiBriefingBullet[], generatedAt: string, fallback?: boolean }
 */

interface AiBriefingBullet {
  id: string;
  label: 'Nu' | 'Vandaag' | 'Risico' | 'Morgen' | 'Daarna';
  text: string;
  priority: 'critical' | 'today' | 'opportunity';
  href: string;
}

const SYSTEM_PROMPT = `Je bent The Architect — de AI-assistent van BBQ Architect, het cockpit-platform van Hop & Bites (BBQ-cateraar van chef Mathijs Berkhout in Schoonoord, Drenthe).

Je rol op de Vandaag-pagina: schrijf een dagelijkse briefing voor Mathijs. Hij opent de app 's ochtends en in de loop van de dag. Hij wil binnen 5 seconden weten wat hij eerst moet doen.

JOUW STIJL:
- Schrijf zoals een chef tegen z'n team praat: kort, direct, feitelijk.
- Bullets zijn LABEL + KORTE FEIT/ACTIE. Niet beginnen met een werkwoord — het label zegt al de urgentie.
- Eindig met een cijfer, bedrag, naam of tijd.
- Sentence-case. Geen uitroeptekens. Geen emoji. Geen tipjes ("Tip:" "Let op:").
- Max ~60 tekens per bullet (exclusief label) — moet op één regel passen.
- Geen vulwoorden ("er zijn", "vergeet niet", "het is belangrijk om").
- Geen Engels. "Pipeline" alleen als zelfstandig naamwoord.

LABELS — hoe te kiezen:
- "Nu" → critical, blokkerend, eerst-doen. Verlopen facturen, planning-conflicten.
- "Vandaag" → action-item dat vandaag af moet. Concept-factuur versturen, voorraad bestellen.
- "Risico" → iets wat nog niet kapot is maar dat dreigt te worden. Allergie niet bevestigd, lage marge.
- "Morgen" → harde deadline morgen.
- "Daarna" → opportunity / niet-urgent. Inactieve klant, pipeline-follow-up.

VOORBEELDEN goede output:
- "Nu · 13 facturen vervallen · €16.888"
- "Vandaag · Bestel Brisket en Bavette · 25p woensdag"
- "Risico · Allergieën Pietersen niet bevestigd · over 5 dagen"
- "Vandaag · 3 concept-facturen klaar om te versturen"
- "Daarna · Van Dijk wacht 8 dagen · €6.600"

VOORBEELDEN slechte output:
- "Innen 13 vervallen facturen — €16.888 volgende week" (werkwoord eerst en onduidelijke deadline)
- "Bestel gerookte Bavette en Brisket vandaag voor 25 gasten" (te lang, geen label)
- "13 facturen zijn vervallen, totaal €16.888" (vulwoorden)

JOUW TAAK:
- Krijg een lijst candidates met defaultLabel-hint.
- Schrijf 3-5 bullets max.
- Gebruik het defaultLabel tenzij de context echt iets anders vraagt.
- Behoud de href en priority 1-op-1.
- Combineer 2 candidates alleen als de combinatie scherper is (bv. "vlees laag + Pietersen wo." = één bullet).

EMPTY-STATE (candidate type 'all_clear'):
- 1 zachte zin met label "Daarna". Bv: "Daarna · Geen blokkades. Goed moment voor planning."

Output via tool 'write_briefing' — schrijf nooit gewone tekst.`;

const BRIEFING_TOOL = {
  name: 'write_briefing',
  description: 'Schrijf 1-5 briefing-bullets voor de Vandaag-pagina. Elke bullet hoort bij precies één candidate.',
  input_schema: {
    type: 'object' as const,
    properties: {
      bullets: {
        type: 'array',
        minItems: 1,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'De candidate-id waar deze bullet bij hoort. Mag een combinatie zijn (bv. "voorraad_event").',
            },
            label: {
              type: 'string',
              enum: ['Nu', 'Vandaag', 'Risico', 'Morgen', 'Daarna'],
              description: 'Kies het label op basis van de candidate-defaultLabel hint en context.',
            },
            text: {
              type: 'string',
              description: 'De bullet-tekst ZONDER label-prefix. Het label staat los. Max ~60 tekens. Geen werkwoord-eerst, gewoon de feit/actie.',
            },
            priority: {
              type: 'string',
              enum: ['critical', 'today', 'opportunity'],
              description: 'Neem over van de candidate met de hoogste priority als je samenvoegt.',
            },
            href: {
              type: 'string',
              description: 'De href van de candidate (of de meest impactvolle als je samenvoegt).',
            },
          },
          required: ['id', 'label', 'text', 'priority', 'href'],
        },
      },
    },
    required: ['bullets'],
  },
};

function fallbackBullets(candidates: BriefingCandidate[]): AiBriefingBullet[] {
  return candidates.slice(0, 5).map(c => ({
    id: c.id,
    label: c.defaultLabel,
    text: c.fallbackText,
    priority: c.priority,
    href: c.href,
  }));
}

export const POST = withTenantAuth(async function POST(req: NextRequest, auth) {
  try {
    const body = await req.json();
    const candidates: BriefingCandidate[] = Array.isArray(body?.candidates) ? body.candidates : [];
    const firstName: string = typeof body?.firstName === 'string' ? body.firstName : '';
    const time: string = typeof body?.time === 'string' ? body.time : '';
    const organizationId = auth.orgId;

    if (candidates.length === 0) {
      return NextResponse.json({
        bullets: [
          {
            id: 'allclear',
            label: 'Daarna',
            text: 'Geen blokkades. Goed moment voor planning.',
            priority: 'opportunity',
            href: '/',
          },
        ],
        generatedAt: new Date().toISOString(),
        fallback: true,
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        bullets: fallbackBullets(candidates),
        generatedAt: new Date().toISOString(),
        fallback: true,
      });
    }

    const client = new Anthropic({ apiKey });

    const userMessage = [
      firstName ? `Mathijs heet ${firstName}.` : '',
      time ? `Tijdstip: ${time}.` : '',
      '',
      'Candidates (gerangschikt op urgentie):',
      JSON.stringify(candidates.map(c => ({
        id: c.id,
        type: c.type,
        priority: c.priority,
        score: c.score,
        context: c.context,
        fallback: c.fallbackText,
        href: c.href,
      })), null, 2),
      '',
      'Schrijf 3-5 bullets (1 voor all_clear). Behoud href en priority. Voeg samen als dat scherper is.',
    ].filter(Boolean).join('\n');

    // AI hard-cap: Haiku tekst met caching ≈ €0.01 per briefing.
    const capRes = await enforceAiCap(organizationId, 0.01);
    if (capRes) return capRes;

    /* Prompt-caching op de system prompt — TTL 5 min, dus herhaalde calls
       binnen die window kosten alleen de delta van de user-message. */
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      tools: [BRIEFING_TOOL],
      tool_choice: { type: 'tool', name: 'write_briefing' },
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userMessage }],
    } as any);

    /* Log usage incl. cache-tokens — Pillar #5 (Systeem) cost-transparantie.
       Fire-and-forget; failures blokkeren de response niet. */
    const u: any = resp.usage || {};
    const model = (resp as any).model || 'claude-haiku-4-5-20251001';
    void logAiUsageServer({
      organization_id: organizationId,
      user_id: auth.userId,
      action_type: 'other',
      model,
      tokens_input: u.input_tokens ?? 0,
      tokens_output: u.output_tokens ?? 0,
      tokens_cache_read: u.cache_read_input_tokens ?? 0,
      tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
      cost_eur_cents: estimateAiCostCents({
        model,
        tokens_input: u.input_tokens ?? 0,
        tokens_output: u.output_tokens ?? 0,
        tokens_cache_read: u.cache_read_input_tokens ?? 0,
        tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
      }),
      metadata: { feature: 'today_briefing', candidates_count: candidates.length },
    });

    const toolBlock = (resp.content as any[]).find((b: any) => b.type === 'tool_use');
    const out = toolBlock?.input as { bullets?: AiBriefingBullet[] } | undefined;

    if (!out?.bullets || out.bullets.length === 0) {
      return NextResponse.json({
        bullets: fallbackBullets(candidates),
        generatedAt: new Date().toISOString(),
        fallback: true,
      });
    }

    /* Sanitize: hrefs moeten matchen met een candidate-href, label moet uit
       de toegestane set komen. Voorkomt dat Claude een gehallucineerde URL
       of label produceert. */
    const validHrefs = new Set(candidates.map(c => c.href));
    const validLabels = new Set(['Nu', 'Vandaag', 'Risico', 'Morgen', 'Daarna']);
    const cleaned: AiBriefingBullet[] = out.bullets
      .filter((b) => b && b.text && b.priority && b.href)
      .map((b) => {
        const candidate = candidates.find(c => c.id === b.id);
        const label = validLabels.has(b.label as string)
          ? (b.label as AiBriefingBullet['label'])
          : (candidate?.defaultLabel || 'Vandaag');
        return {
          id: b.id,
          label,
          text: b.text.slice(0, 90),
          priority: b.priority,
          href: validHrefs.has(b.href) ? b.href : (candidate?.href || '/'),
        };
      })
      .slice(0, 5);

    return NextResponse.json({
      bullets: cleaned.length > 0 ? cleaned : fallbackBullets(candidates),
      generatedAt: new Date().toISOString(),
      fallback: cleaned.length === 0,
    });
  } catch (e) {
    console.error('[today-briefing] error:', (e as Error).message);
    /* Fallback op fallback-templates ipv. error-state — gebruiker hoeft niet
       te weten dat de AI ervoor zat. */
    try {
      const body = await req.clone().json();
      const candidates: BriefingCandidate[] = Array.isArray(body?.candidates) ? body.candidates : [];
      return NextResponse.json({
        bullets: fallbackBullets(candidates),
        generatedAt: new Date().toISOString(),
        fallback: true,
      });
    } catch {
      return NextResponse.json({ bullets: [], generatedAt: new Date().toISOString(), fallback: true }, { status: 200 });
    }
  }
});
