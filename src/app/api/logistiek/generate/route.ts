/**
 * POST /api/logistiek/generate
 *
 * Input:  { event_id: number }
 * Output: { items: ChecklistItem[], model: string }
 *
 * Genereert een logistiek-checklist voor een event op basis van:
 *  - event-data (gasten, datum, locatie, type)
 *  - offerte-data (menu_selectie)
 *  - tenant materieel-catalog
 *
 * Retourneert PREVIEW — niet opgeslagen. UI laat user aanpassen + accepteren
 * via aparte save-action.
 *
 * Hard rules:
 *  - Zod-validatie op input
 *  - Re-auth via supabase.auth.getUser()
 *  - RLS filtert events/offertes/materieel automatisch op organization_id
 *  - AI mag suggereren, geen productie-quantities AI-derived voor HACCP/voedsel
 *    (het is een prep-checklist, niet een productie-yield-spec)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { logAiUsage } from '@/lib/aiUsage';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-4-6';
const PROMPT_VERSION = 'v1-2026-05-21';

const InputSchema = z.object({
    event_id: z.coerce.number().int().positive(),
});

const CATEGORIES = ['materieel', 'mensen', 'voorbereiding', 'transport'] as const;
type Categorie = (typeof CATEGORIES)[number];

interface ChecklistItem {
    categorie: Categorie;
    tekst: string;
    hoeveelheid?: string;
    eenheid?: string;
    done: boolean;
    ai_suggested: boolean;
}

const SYSTEM_PROMPT = `Je bent een logistiek-planner voor een Nederlands catering-bedrijf. Een gebruiker stuurt een event-spec (gasten, datum, locatie, menu) en een lijst van het materieel dat de cateraar in huis heeft. Jouw taak: genereer een praktische checklist voor wat er voor dit event nodig is, opgedeeld in 4 categorieën.

CATEGORIEËN (in deze volgorde):
1. materieel — welke apparatuur/servies/koeling moet mee. Verwijs naar items uit de tenant-catalog als ze er zijn; voeg ontbrekend toe.
2. mensen — hoeveel chefs/runners/bedienend personeel + welke functies.
3. voorbereiding — wat moet wanneer geprepped, in werk-back-volgorde (T-72u, T-24u, T-day-of).
4. transport — welk voertuig, vertrektijd, route-overweging.

Output ALTIJD geldige JSON met deze shape:
{
  "items": [
    { "categorie": "materieel"|"mensen"|"voorbereiding"|"transport", "tekst": "korte heldere taak", "hoeveelheid": "optioneel", "eenheid": "optioneel" }
  ]
}

REGELS:
- Maximaal 25 items totaal — kwaliteit boven volume.
- Tekst werkwoord-eerst, max 80 chars per regel ("Yoder smoker laden + bus", niet "Het is belangrijk om de Yoder smoker...").
- Hoeveelheid + eenheid alleen waar concreet ("2 chefs", "60 borden") — laat weg als niet specifiek.
- Geen yields voor productie (HACCP-vrij gebied) — alleen ja/nee taken.
- Werk-back-tijden gebruiken (T-72u, T-48u, T-24u, T-4u, day-of) in de voorbereiding-categorie.
- Geen marketing-taal, geen filler. Korte, scherpe regels.`;

export async function POST(req: NextRequest) {
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

    const body = await req.json().catch(() => null);
    const parsed = InputSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validatie-fout', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    /* Verzamel event-context. RLS doet de tenant-isolatie. */
    const [eventRes, offerteRes, materieelRes] = await Promise.all([
        sb.from('events').select('id, name, date, guests, location, type, ppp, start_time').eq('id', parsed.data.event_id).maybeSingle(),
        sb.from('offertes').select('menu_selectie').eq('event_id', parsed.data.event_id).limit(1).maybeSingle(),
        sb.from('materieel').select('naam, type, status, locatie').eq('status', 'ok').limit(100),
    ]);

    if (eventRes.error || !eventRes.data) {
        return NextResponse.json({ error: 'Event niet gevonden' }, { status: 404 });
    }
    const event = eventRes.data;
    const offerte = offerteRes.data;
    const materieel = (materieelRes.data ?? []) as Array<{ naam: string; type: string; locatie?: string }>;

    /* Compact menu samenvatting voor de AI (niet de hele JSON-blob). */
    let menuSummary = '';
    if (offerte?.menu_selectie) {
        let sel = offerte.menu_selectie as unknown;
        if (typeof sel === 'string') {
            try { sel = JSON.parse(sel); } catch { sel = null; }
        }
        if (sel && typeof sel === 'object') {
            const lines: string[] = [];
            for (const [gangNaam, gerechten] of Object.entries(sel as Record<string, unknown>)) {
                const arr = Array.isArray(gerechten) ? gerechten as string[] : [];
                if (arr.length > 0) lines.push(`${gangNaam}: ${arr.join(', ')}`);
            }
            menuSummary = lines.join('\n');
        }
    }

    /* Compact materieel-catalog, gegroepeerd per type. */
    const materieelByType = new Map<string, string[]>();
    for (const m of materieel) {
        const arr = materieelByType.get(m.type) ?? [];
        arr.push(m.naam);
        materieelByType.set(m.type, arr);
    }
    const materieelSummary = Array.from(materieelByType.entries())
        .map(([type, items]) => `${type}: ${items.join(', ')}`)
        .join('\n');

    const userPrompt =
        `EVENT:\n` +
        `- Naam: ${event.name ?? '—'}\n` +
        `- Datum: ${event.date ?? '—'}${event.start_time ? ` ${event.start_time}` : ''}\n` +
        `- Gasten: ${event.guests ?? '—'}\n` +
        `- Type: ${event.type ?? '—'}\n` +
        `- Locatie: ${event.location ?? '—'}\n\n` +
        `MENU:\n${menuSummary || '— geen menu-data —'}\n\n` +
        `BESCHIKBAAR MATERIEEL:\n${materieelSummary || '— geen materieel in catalog —'}\n\n` +
        `Genereer de checklist. Output alleen JSON, geen andere tekst.`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI niet geconfigureerd' }, { status: 503 });
    const anthropic = new Anthropic({ apiKey });

    let items: ChecklistItem[];
    let tokensInput = 0, tokensOutput = 0;
    try {
        const msg = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 2500,
            temperature: 0.3,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
        });
        tokensInput = msg.usage?.input_tokens ?? 0;
        tokensOutput = msg.usage?.output_tokens ?? 0;
        const textBlock = msg.content.find(b => b.type === 'text');
        const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return NextResponse.json({ error: 'AI gaf geen geldige JSON terug' }, { status: 502 });
        }
        const parsedAi = JSON.parse(jsonMatch[0]) as { items?: Array<Partial<ChecklistItem>> };
        const rawItems = Array.isArray(parsedAi.items) ? parsedAi.items : [];
        items = rawItems
            .filter(it => it && typeof it.tekst === 'string' && it.tekst.length > 0 && CATEGORIES.includes(it.categorie as Categorie))
            .slice(0, 25)
            .map(it => ({
                categorie: it.categorie as Categorie,
                tekst: String(it.tekst).slice(0, 200),
                hoeveelheid: it.hoeveelheid ? String(it.hoeveelheid).slice(0, 50) : undefined,
                eenheid: it.eenheid ? String(it.eenheid).slice(0, 30) : undefined,
                done: false,
                ai_suggested: true,
            }));
    } catch (e) {
        return NextResponse.json({ error: 'AI-generatie mislukt: ' + (e as Error).message }, { status: 502 });
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
        metadata: { kind: 'logistiek_generate', event_id: parsed.data.event_id, prompt_version: PROMPT_VERSION },
    });

    return NextResponse.json({
        items,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        ms: Date.now() - t0,
    });
}
