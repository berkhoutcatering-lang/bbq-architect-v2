/* /api/ai/cost-engineering — PR7 Inspiratie Bibliotheek
   POST: Geef gerecht-id, AI analyseert components+verkoopprijs+marge en stelt
   3-5 acties voor om marge te verhogen.

   Read-only advies — geen mutaties. Mens beslist.
   Haiku 4.5 voor lage kosten + snelheid (real-time feel). */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';
import { enforceAiCap } from '@/lib/aiCostCap';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `Je bent margeconsultant voor een Nederlandse BBQ-catering. Je krijgt één gerecht met al zijn componenten + verkoopprijs en huidige marge. Je stelt 3-5 concrete acties voor om marge te verhogen.

REGELS:
- Antwoord ALLEEN met geldige JSON. Geen markdown fences, geen uitleg eromheen.
- Wees specifiek: noem het component bij naam, noem het bedrag.
- Realistische adviezen voor BBQ-catering (geen exotische ingrediënten).
- Marge-doelen voor catering: >60% = Star, 35-60% = OK, <35% = Dog (overweeg uitfaseren).
- Action-types:
  - "increase_price": verhoog verkoopprijs met X cents (geef new_price_cents)
  - "swap_component": vervang component X door goedkopere variant (geef target_component_name + suggestion)
  - "reduce_quantity": gebruik minder van component X (geef target_component_name + new_qty)
  - "remove_from_wizard": haal gerecht uit offerte-wizard (alleen als marge <20%)
  - "promote_alternative": stel een ander gerecht uit bibliotheek voor (alleen als input dat suggereert)

SCHEMA:
{
  "current_margin_pct": number (de huidige marge),
  "verdict": "Star" | "Plowhorse" | "Puzzle" | "Dog",
  "suggestions": [
    {
      "action": "increase_price" | "swap_component" | "reduce_quantity" | "remove_from_wizard" | "promote_alternative",
      "title": "Korte actie-titel (max 8 woorden)",
      "description": "Concrete uitleg (1-2 zinnen, Nederlands)",
      "estimated_impact_cents": number | null (verandering van kostprijs OF nieuwe verkoopprijs cents),
      "target_component_name": string | null,
      "estimated_new_margin_pct": number | null (verwachte nieuwe marge na actie)
    }
  ]
}`;

interface CostEngInput {
    gerecht_id: string;
}

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });
    const orgId = membership.organization_id as string;

    const body = await req.json().catch(() => null) as CostEngInput | null;
    if (!body || typeof body.gerecht_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.gerecht_id)) {
        return NextResponse.json({ error: 'gerecht_id (UUID) verplicht' }, { status: 400 });
    }

    // Fetch gerecht + components
    const [gerechtRes, componentsRes] = await Promise.all([
        supabase
            .from('gerechten')
            .select('id, naam, beschrijving, verkoopprijs, total_cost_cents, is_in_wizard')
            .eq('id', body.gerecht_id)
            .eq('organization_id', orgId)
            .maybeSingle(),
        supabase
            .from('gerecht_components')
            .select('quantity_used, unit, cost_at_use_cents, components(id, name, type, base_quantity, base_unit, base_cost_cents)')
            .eq('gerecht_id', body.gerecht_id),
    ]);

    if (!gerechtRes.data) return NextResponse.json({ error: 'Gerecht niet gevonden' }, { status: 404 });

    const gerecht = gerechtRes.data as Record<string, any>;
    const components = (componentsRes.data ?? []) as Array<Record<string, any>>;
    const verkoopCents = gerecht.verkoopprijs != null ? Math.round((gerecht.verkoopprijs as number) * 100) : 0;
    const totalCostCents = (gerecht.total_cost_cents as number) ?? 0;
    const margePct = verkoopCents > 0 ? ((verkoopCents - totalCostCents) / verkoopCents) * 100 : 0;

    if (components.length === 0) {
        return NextResponse.json({ error: 'Gerecht heeft nog geen components — koppel eerst, dan kan AI helpen' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI niet beschikbaar' }, { status: 503 });
    const anthropic = new Anthropic({ apiKey });

    const userMessage = `<gerecht>
Naam: ${gerecht.naam}
Beschrijving: ${gerecht.beschrijving ?? '(geen)'}
Verkoopprijs: €${(verkoopCents / 100).toFixed(2)} (${verkoopCents} cents)
Totaal kostprijs (uit components): €${(totalCostCents / 100).toFixed(2)} (${totalCostCents} cents)
Huidige marge: ${margePct.toFixed(1)}%
In offerte-wizard: ${gerecht.is_in_wizard ? 'ja' : 'nee'}
</gerecht>

<components>
${components.map(c => {
    const comp = c.components as Record<string, any>;
    return `- ${comp?.name ?? 'onbekend'}: ${c.quantity_used} ${c.unit} → €${((c.cost_at_use_cents as number) / 100).toFixed(2)} (basis ${comp?.base_quantity}${comp?.base_unit} = €${((comp?.base_cost_cents as number) / 100).toFixed(2)})`;
}).join('\n')}
</components>

Geef JSON met 3-5 marge-suggesties.`;

    /* P0.40 — cost-engineering Sonnet ≈ €0.03/call. */
    const capRes = await enforceAiCap(orgId, 0.03);
    if (capRes) return capRes;

    try {
        const response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 1500,
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: userMessage }],
        });

        // Track usage
        try {
            const u = response.usage;
            const cost = estimateAiCostCents({
                model: MODEL,
                tokens_input: u.input_tokens,
                tokens_output: u.output_tokens,
                tokens_cache_read: u.cache_read_input_tokens ?? 0,
                tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
            });
            logAiUsageServer({
                organization_id: orgId,
                user_id: user.id,
                action_type: 'menu_suggestion',
                model: MODEL,
                tokens_input: u.input_tokens,
                tokens_output: u.output_tokens,
                tokens_cache_read: u.cache_read_input_tokens ?? 0,
                tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
                cost_eur_cents: cost,
                metadata: { feature: 'cost-engineering', gerecht_id: body.gerecht_id },
            });
        } catch {}

        const textBlock = response.content.find(b => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
            return NextResponse.json({ error: 'Geen tekst-output van AI' }, { status: 502 });
        }

        let parsed: unknown;
        try {
            const cleaned = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
            parsed = JSON.parse(cleaned);
        } catch {
            return NextResponse.json({ error: 'AI-output is geen geldige JSON', raw: textBlock.text }, { status: 502 });
        }

        return NextResponse.json({
            analysis: parsed,
            context: {
                gerecht_name: gerecht.naam,
                current_margin_pct: margePct,
                verkoopprijs_cents: verkoopCents,
                total_cost_cents: totalCostCents,
                component_count: components.length,
            },
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: `AI-call mislukt: ${msg}` }, { status: 500 });
    }
}
