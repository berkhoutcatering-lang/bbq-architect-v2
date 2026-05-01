/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { BriefingCandidate } from '@/lib/today-briefing-rules';

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
  text: string;
  priority: 'critical' | 'today' | 'opportunity';
  href: string;
}

const SYSTEM_PROMPT = `Je bent The Architect — de AI-assistent van BBQ Architect, het cockpit-platform van Hop & Bites (BBQ-cateraar van chef Mathijs Berkhout in Schoonoord, Drenthe).

Je rol op de Vandaag-pagina: schrijf een dagelijkse briefing voor Mathijs. Hij opent de app 's ochtends en in de loop van de dag. Hij wil binnen 5 seconden weten wat hij eerst moet doen.

JOUW STIJL:
- Schrijf zoals een chef tegen z'n team praat: kort, direct, actie-gericht.
- Werkwoord eerst (Stuur, Bel, Plan, Bestel, Check, Bevestig, Vul aan).
- Eindig met een tijd, bedrag, of naam.
- Sentence-case. Geen uitroeptekens. Geen emoji. Geen tipjes ("Tip:" "Let op:").
- Max 1 regel per bullet — desktop-breedte (~75 tekens).
- Geen vulwoorden ("er zijn", "vergeet niet", "het is belangrijk om").
- Nederlands. Geen Engels (gebruik "pipeline" alleen als zelfstandig naamwoord, niet als werkwoord).

JOUW TAAK:
- Krijg een lijst candidates (gerangschikt op urgentie + impact).
- Schrijf 3-5 bullets max — kies de zwaarste candidates.
- Behoud de href en priority van elke candidate (1-op-1 mapping).
- Combineer 2 candidates ALLEEN als de combinatie scherper is (bv. "vlees laag + Pietersen wo." = één bullet).
- Geen marketing-copy. Geen "Welkom!" Geen samenvatting van de samenvatting.

EMPTY-STATE (candidate type 'all_clear'):
- 1 zachte zin. Bv: "Geen blokkades. Goed moment voor planning."
- Bullet count = 1.

Output via het tool 'write_briefing' — schrijf nooit gewone tekst.`;

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
              description: 'De candidate-id waar deze bullet bij hoort. Mag een combinatie zijn als je twee candidates samenvoegt (bv. "voorraad_event").',
            },
            text: {
              type: 'string',
              description: 'De bullet-tekst. 1 regel, max ~80 tekens. Werkwoord eerst. Sentence-case.',
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
          required: ['id', 'text', 'priority', 'href'],
        },
      },
    },
    required: ['bullets'],
  },
};

function fallbackBullets(candidates: BriefingCandidate[]): AiBriefingBullet[] {
  return candidates.slice(0, 5).map(c => ({
    id: c.id,
    text: c.fallbackText,
    priority: c.priority,
    href: c.href,
  }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const candidates: BriefingCandidate[] = Array.isArray(body?.candidates) ? body.candidates : [];
    const firstName: string = typeof body?.firstName === 'string' ? body.firstName : '';
    const time: string = typeof body?.time === 'string' ? body.time : '';

    if (candidates.length === 0) {
      return NextResponse.json({
        bullets: [
          {
            id: 'allclear',
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

    const toolBlock = (resp.content as any[]).find((b: any) => b.type === 'tool_use');
    const out = toolBlock?.input as { bullets?: AiBriefingBullet[] } | undefined;

    if (!out?.bullets || out.bullets.length === 0) {
      return NextResponse.json({
        bullets: fallbackBullets(candidates),
        generatedAt: new Date().toISOString(),
        fallback: true,
      });
    }

    /* Sanitize: hrefs moeten matchen met een candidate-href (of een variant).
       Voorkomt dat Claude een gehallucineerde URL produceert. */
    const validHrefs = new Set(candidates.map(c => c.href));
    const cleaned: AiBriefingBullet[] = out.bullets
      .filter((b) => b && b.text && b.priority && b.href)
      .map((b) => ({
        id: b.id,
        text: b.text.slice(0, 110),
        priority: b.priority,
        href: validHrefs.has(b.href) ? b.href : (candidates.find(c => c.id === b.id)?.href || '/'),
      }))
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
}
