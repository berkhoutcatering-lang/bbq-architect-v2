/* /api/ai/discover-combinations — PR8 Inspiratie Bibliotheek
   POST: AI scant tenant's components-bibliotheek + bestaande gerechten,
   vindt 3-5 ongebruikte (of weinig gebruikte) combinaties die een nieuw
   gerecht zouden vormen. Read-only output — Sam beslist.

   Pillar 1 (AI als Creative Chef): proactief inspireren, niet alleen reageren. */

import { NextRequest, NextResponse } from 'next/server';
import type AnthropicType from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `Je bent de creatieve sous-chef van een Nederlandse BBQ-catering. Je krijgt de volledige componenten-bibliotheek + bestaande gerechten van de chef. Je taak: vind 3 ONGEBRUIKTE combinaties die nog geen gerecht zijn maar die wél een goed gerecht zouden maken.

REGELS:
- Antwoord ALLEEN met geldige JSON. Geen markdown fences, geen uitleg eromheen.
- Combineer 2-5 components per voorstel. Liefst components die elkaars smaakprofielen versterken (zoet-rokerig, romig-pikant, krokant-zacht, etc.).
- Vermijd dubbel-werk: als een gerecht in de "bestaande_gerechten"-lijst al die exacte combo heeft, sla over.
- Realistische BBQ-context (sliders, amuses, bowls, hapjes, side-dishes voor catering 20-100 gasten).
- Suggesties moeten OPERATIONEEL haalbaar zijn — geen exotische combos waar niemand op zit te wachten.
- Per component: noem de id (BIGINT) zoals die in de bibliotheek staat. quantity in realistische portie-grootte.

SCHEMA:
{
  "suggestions": [
    {
      "name": "Korte gerecht-naam (max 60 chars)",
      "description": "1 zin smaak-pitch (max 140 chars)",
      "components": [
        { "component_id": integer, "name": "Verifying name", "quantity": number, "unit": "g|ml|stuk|portie" }
      ],
      "why_this_combo": "Korte uitleg (1-2 zinnen) waarom deze combo werkt en welk gat in de bibliotheek het vult"
    }
  ]
}`;

interface ComponentLite {
    id: number;
    name: string;
    type: string;
    base_quantity: number;
    base_unit: string;
    base_cost_cents: number;
    flavor_tags: string[] | null;
}

export async function POST(_req: NextRequest) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: membership } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });
    const orgId = membership.organization_id as string;

    // Haal alle components op (RLS doet org-filter)
    const { data: components, error: compErr } = await supabase
        .from('components')
        .select('id, name, type, base_quantity, base_unit, base_cost_cents, flavor_tags')
        .order('created_at', { ascending: false })
        .limit(150);

    if (compErr) return NextResponse.json({ error: compErr.message }, { status: 500 });
    if (!components || components.length < 3) {
        return NextResponse.json({
            error: 'Te weinig components in je bibliotheek (min 3) — voeg er eerst meer toe via AI Genereer of Importeer',
        }, { status: 400 });
    }

    // Bestaande gerechten + welke components ze gebruiken (voor "vermijd dubbel-werk")
    const { data: gerechten } = await supabase
        .from('gerechten')
        .select('id, naam, gerecht_components(component_id)')
        .limit(100);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI niet beschikbaar' }, { status: 503 });
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic: AnthropicType = new Anthropic({ apiKey });

    const componentsBlock = (components as ComponentLite[]).map(c => {
        const tags = (c.flavor_tags ?? []).join(', ') || '(geen tags)';
        return `[#${c.id}] ${c.name} (${c.type}) — ${c.base_quantity}${c.base_unit} = €${(c.base_cost_cents / 100).toFixed(2)} — smaak: ${tags}`;
    }).join('\n');

    const gerechtenBlock = (gerechten ?? []).map((g: any) => {
        const compIds = (g.gerecht_components ?? []).map((gc: any) => gc.component_id).join(',');
        return `- ${g.naam}: components [${compIds || 'geen'}]`;
    }).join('\n');

    const userMessage = `<components_bibliotheek count="${components.length}">
${componentsBlock}
</components_bibliotheek>

<bestaande_gerechten count="${gerechten?.length ?? 0}">
${gerechtenBlock || '(nog geen gerechten)'}
</bestaande_gerechten>

Vind 3 ongebruikte combo's en geef ze als JSON volgens het schema.`;

    try {
        const response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 3000,
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
                metadata: { feature: 'discover-combinations', component_count: components.length },
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

        // Map component-id's naar volledige rijen voor de UI (cost-berekening + verify dat AI bestaande ids gebruikte)
        const componentMap = new Map<number, ComponentLite>();
        for (const c of components as ComponentLite[]) componentMap.set(c.id, c);

        const out = parsed as { suggestions?: Array<Record<string, any>> };
        const enriched = (out.suggestions ?? []).map(s => {
            const validComponents = ((s.components as Array<Record<string, any>>) ?? [])
                .filter(c => typeof c.component_id === 'number' && componentMap.has(c.component_id))
                .map(c => {
                    const comp = componentMap.get(c.component_id as number)!;
                    const quantity = typeof c.quantity === 'number' && c.quantity > 0 ? c.quantity : comp.base_quantity;
                    const unit = typeof c.unit === 'string' ? c.unit : comp.base_unit;
                    const costCents = comp.base_quantity > 0
                        ? Math.round((quantity / comp.base_quantity) * comp.base_cost_cents)
                        : 0;
                    return { component_id: comp.id, name: comp.name, quantity, unit, cost_cents: costCents };
                });
            const totalCost = validComponents.reduce((sum, c) => sum + c.cost_cents, 0);
            return {
                name: typeof s.name === 'string' ? s.name : 'Onbekend gerecht',
                description: typeof s.description === 'string' ? s.description : '',
                why_this_combo: typeof s.why_this_combo === 'string' ? s.why_this_combo : '',
                components: validComponents,
                total_cost_cents: totalCost,
            };
        }).filter(s => s.components.length >= 2);

        return NextResponse.json({ suggestions: enriched });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown';
        return NextResponse.json({ error: `AI-call mislukt: ${msg}` }, { status: 500 });
    }
}
