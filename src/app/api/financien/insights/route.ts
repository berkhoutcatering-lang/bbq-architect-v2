/**
 * POST /api/financien/insights
 *
 * Scant de afgelopen 90 dagen aan offertes/facturen/bonnen en laat Claude
 * Sonnet 4.6 4-6 inzichten formuleren — patterns, gaten, kansen. Geen
 * uitvoer is BTW-bedrag / belasting-aangifte / fiscaal advies (out of scope).
 *
 * Output-vorm:
 *   { insights: Array<{ titel, observatie, suggestie, severity, link? }> }
 *
 * Hard rules:
 *  - Re-auth via supabase.auth.getUser()
 *  - RLS doet tenant-filtering op alle queries
 *  - Disclaimer: AI suggereert pattern, boekhouder + ondernemer beslissen
 *  - Geen BTW-calculaties AI-derived — alleen aggregaten uit DB
 */

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { logAiUsage } from '@/lib/aiUsage';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-4-6';
const PROMPT_VERSION = 'v1-2026-05-21';

interface Insight {
    titel: string;
    observatie: string;
    suggestie: string;
    severity: 'info' | 'kans' | 'risico';
    link?: string;
}

const SYSTEM_PROMPT = `Je bent een operationele financien-coach voor een Nederlands catering-bedrijf — geen accountant, geen fiscalist. Je leest aggregaten uit de bedrijfsadministratie en formuleert 4-6 inzichten over de afgelopen 90 dagen.

OUTPUT (strikt JSON):
{
  "insights": [
    {
      "titel": "kort (max 60 chars), werkwoord-eerst",
      "observatie": "wat zie je in de data — 1-2 zinnen, concrete cijfers",
      "suggestie": "wat zou de ondernemer kunnen overwegen — 1 zin, geen fiscaal advies",
      "severity": "info" | "kans" | "risico",
      "link": "/financien?tab=... of /voorraad/inkoop-checker etc — alleen relevante BBQ Architect paths"
    }
  ]
}

REGELS:
- Maximaal 6 inzichten. Liever 4 goede dan 6 zwakke.
- Stel **vragen of ideeën**, geen advies. "Mogelijk zou je..." / "Heb je overwogen om..." — nooit "Je moet...".
- Concrete getallen uit de data, geen vage cijfers ("€420 minder bonnen-spend in mei vs april", niet "minder spend deze maand").
- Geen BTW-berekeningen, geen aangifte-tips, geen KIA/investeringsaftrek-berekeningen (out of scope).
- Geen marketing-taal. Werkwoord-eerst, kort, direct.
- Links alleen naar paden binnen deze app waar de tenant context kan zien. Geen externe URLs.

VERMIJD:
- "Dit is geweldig nieuws!" / "Goed gedaan!" (geen complimenten — dit is data-analyse)
- Generieke tips zonder cijfer ("zorg dat je facturen op tijd verstuurt")
- Fiscaal advies of belastingaangifte-tips (laat dit aan de boekhouder)`;

export async function POST() {
    const t0 = Date.now();

    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: mem } = await sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!mem) return NextResponse.json({ error: 'Geen actieve organisatie' }, { status: 403 });

    /* Aggregaat-window: laatste 90 dagen, vergeleken met de 90 dagen daarvoor. */
    const now = new Date();
    const D90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const D180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();

    const [offertesRes, facturenRes, bonnenRes, eventsRes, leveranciersRes] = await Promise.all([
        sb.from('offertes').select('id, datum, status, ppp, aantal_personen, totaal').gte('datum', D180),
        sb.from('facturen').select('id, datum, totaal, betaald, status, vervaldatum').gte('datum', D180),
        sb.from('bonnen').select('id, datum, totaal_bedrag, winkel, categorie').gte('datum', D180),
        sb.from('events').select('id, date, status, guests, ppp').gte('date', D180.slice(0, 10)),
        sb.from('leveranciers').select('id, naam, type'),
    ]);

    const offertes = (offertesRes.data ?? []) as Array<{ datum?: string; status?: string; ppp?: number; aantal_personen?: number; totaal?: number }>;
    const facturen = (facturenRes.data ?? []) as Array<{ datum?: string; totaal?: number; betaald?: number; status?: string; vervaldatum?: string }>;
    const bonnen = (bonnenRes.data ?? []) as Array<{ datum?: string; totaal_bedrag?: number; winkel?: string; categorie?: string }>;
    const events = (eventsRes.data ?? []) as Array<{ date?: string; status?: string; guests?: number; ppp?: number }>;

    /* Aggregaten per window. */
    function sumIn(window: 'recent' | 'prev', getDate: (x: { datum?: string; date?: string }) => string | undefined, getValue: (x: unknown) => number, rows: unknown[]): number {
        return rows.reduce<number>((sum, r) => {
            const d = getDate(r as { datum?: string; date?: string });
            if (!d) return sum;
            const dt = new Date(d).getTime();
            const recent = dt >= now.getTime() - 90 * 24 * 60 * 60 * 1000;
            if (window === 'recent' ? recent : !recent) return sum + getValue(r);
            return sum;
        }, 0);
    }

    const facturenTotaalRecent = sumIn('recent', r => r.datum, r => Number((r as { totaal?: number }).totaal ?? 0), facturen);
    const facturenTotaalPrev = sumIn('prev', r => r.datum, r => Number((r as { totaal?: number }).totaal ?? 0), facturen);
    const bonnenTotaalRecent = sumIn('recent', r => r.datum, r => Number((r as { totaal_bedrag?: number }).totaal_bedrag ?? 0), bonnen);
    const bonnenTotaalPrev = sumIn('prev', r => r.datum, r => Number((r as { totaal_bedrag?: number }).totaal_bedrag ?? 0), bonnen);
    const offerteCountRecent = offertes.filter(o => o.datum && new Date(o.datum).getTime() >= now.getTime() - 90 * 24 * 60 * 60 * 1000).length;
    const offerteCountPrev = offertes.filter(o => o.datum && new Date(o.datum).getTime() < now.getTime() - 90 * 24 * 60 * 60 * 1000).length;

    /* Niet-betaalde facturen — open + overdue */
    const openFacturen = facturen.filter(f => (Number(f.totaal ?? 0) - Number(f.betaald ?? 0)) > 0.01);
    const openTotaal = openFacturen.reduce((s, f) => s + (Number(f.totaal ?? 0) - Number(f.betaald ?? 0)), 0);
    const overdueCount = openFacturen.filter(f => f.vervaldatum && new Date(f.vervaldatum).getTime() < now.getTime()).length;

    /* Leverancier-spend per leverancier in recent window. */
    const spendByLeverancier = new Map<string, number>();
    for (const b of bonnen) {
        if (!b.datum) continue;
        if (new Date(b.datum).getTime() < now.getTime() - 90 * 24 * 60 * 60 * 1000) continue;
        const naam = b.winkel ?? 'Onbekend';
        spendByLeverancier.set(naam, (spendByLeverancier.get(naam) ?? 0) + Number(b.totaal_bedrag ?? 0));
    }
    const topLeveranciers = Array.from(spendByLeverancier.entries())
        .sort((a, b) => b[1] - a[1]).slice(0, 5);

    /* Events: gemiddelde PPP recent vs prev. */
    const eventsRecent = events.filter(e => e.date && new Date(e.date).getTime() >= now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const eventsPrev = events.filter(e => e.date && new Date(e.date).getTime() < now.getTime() - 90 * 24 * 60 * 60 * 1000);
    function avgPpp(arr: typeof events): number {
        const valid = arr.filter(e => typeof e.ppp === 'number' && e.ppp! > 0);
        return valid.length === 0 ? 0 : valid.reduce((s, e) => s + (e.ppp ?? 0), 0) / valid.length;
    }
    const pppRecent = avgPpp(eventsRecent);
    const pppPrev = avgPpp(eventsPrev);

    const aggregaat = {
        window: 'laatste 90 dagen',
        omzet: { recent_eur: Math.round(facturenTotaalRecent), prev_eur: Math.round(facturenTotaalPrev) },
        bonnen_spend: { recent_eur: Math.round(bonnenTotaalRecent), prev_eur: Math.round(bonnenTotaalPrev) },
        offertes: { count_recent: offerteCountRecent, count_prev: offerteCountPrev },
        open_facturen: { count: openFacturen.length, totaal_eur: Math.round(openTotaal), overdue_count: overdueCount },
        top_leveranciers: topLeveranciers.map(([naam, eur]) => ({ naam, spend_eur: Math.round(eur) })),
        events: {
            count_recent: eventsRecent.length,
            count_prev: eventsPrev.length,
            avg_ppp_recent_eur: Math.round(pppRecent),
            avg_ppp_prev_eur: Math.round(pppPrev),
        },
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI niet geconfigureerd' }, { status: 503 });
    const anthropic = new Anthropic({ apiKey });

    let insights: Insight[];
    let tokensInput = 0, tokensOutput = 0;
    try {
        const msg = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 2000,
            temperature: 0.3,
            system: SYSTEM_PROMPT,
            messages: [{
                role: 'user',
                content: `Aggregaat uit de tenant-administratie (90d window):\n\n${JSON.stringify(aggregaat, null, 2)}\n\nGenereer 4-6 inzichten. Output alleen JSON, geen andere tekst.`,
            }],
        });
        tokensInput = msg.usage?.input_tokens ?? 0;
        tokensOutput = msg.usage?.output_tokens ?? 0;
        const textBlock = msg.content.find(b => b.type === 'text');
        const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return NextResponse.json({ error: 'AI gaf geen geldige JSON terug' }, { status: 502 });
        const parsed = JSON.parse(jsonMatch[0]) as { insights?: Array<Partial<Insight>> };
        insights = (parsed.insights ?? [])
            .filter(it => it && typeof it.titel === 'string' && typeof it.observatie === 'string')
            .slice(0, 6)
            .map(it => ({
                titel: String(it.titel).slice(0, 80),
                observatie: String(it.observatie ?? '').slice(0, 500),
                suggestie: String(it.suggestie ?? '').slice(0, 300),
                severity: (['info', 'kans', 'risico'].includes(it.severity as string) ? it.severity : 'info') as Insight['severity'],
                link: typeof it.link === 'string' && it.link.startsWith('/') ? it.link.slice(0, 200) : undefined,
            }));
    } catch (e) {
        return NextResponse.json({ error: 'AI-scan mislukt: ' + (e as Error).message }, { status: 502 });
    }

    const costEurCents = Math.round(
        ((tokensInput / 1_000_000) * 3 + (tokensOutput / 1_000_000) * 15) * 0.92 * 100,
    );

    void logAiUsage({
        organization_id: mem.organization_id,
        user_id: user.id,
        action_type: 'other',
        model: MODEL,
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        cost_eur_cents: costEurCents,
        metadata: { kind: 'financien_insights', prompt_version: PROMPT_VERSION },
    });

    return NextResponse.json({
        insights,
        aggregaat,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        ms: Date.now() - t0,
    });
}
