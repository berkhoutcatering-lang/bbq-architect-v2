/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCentsPure as estimateAiCostCents } from '@/lib/aiCostEstimate';

export const runtime = 'nodejs';
export const maxDuration = 15;

/*
 * AI allergeen-detectie
 * ─────────────────────
 * Input: lijst ingredient-namen (uit gerecht.ingredient_costs of .ingredienten).
 * Output: array NL-codes uit de gesloten set [G,L,N,V,VE,E,S,F,M].
 *
 * Wordt aangeroepen vanuit gerechten-page bij save zodat user nooit zelf
 * hoeft te ticken — als ingredient "Mosterd" zegt → 'M' wordt automatisch
 * toegevoegd aan gerecht.allergenen[].
 *
 * Returns ook de severity van de match (high als het een kerningrediënt is,
 * normal bij sporen) zodat downstream KDS-cross-referencing correct kan
 * prioriteren.
 *
 * Haiku-only — kleine input, deterministisch antwoord met cache_control.
 */

const ALLERGEN_CODES = [
    { code: 'G',  label: 'Gluten',          examples: 'tarwe, gerst, brood, bloem, pasta, panko, soja saus' },
    { code: 'L',  label: 'Lactose/zuivel',  examples: 'melk, kaas, boter, room, yoghurt, mozzarella' },
    { code: 'N',  label: 'Noten',           examples: 'amandel, walnoot, cashew, pecan, hazelnoot, pinda (apart)' },
    { code: 'V',  label: 'Vegetarisch',     examples: 'NIET vlees of vis; ei en zuivel mag' },
    { code: 'VE', label: 'Vegan',           examples: 'NIET dierlijk: geen vlees, vis, ei, zuivel, honing' },
    { code: 'E',  label: 'Ei',              examples: 'eidooier, eiwit, mayo, custard, brioche' },
    { code: 'S',  label: 'Soja',            examples: 'soja saus, edamame, miso, tofu, tempeh' },
    { code: 'F',  label: 'Vis/schaaldieren', examples: 'zalm, tonijn, ansjovis, garnaal, kreeft, mossel, oester' },
    { code: 'M',  label: 'Mosterd',          examples: 'mosterd, mosterdpoeder, dijon' },
];

const SYSTEM = `Je bent een professionele HACCP-allergeen detector voor een catering-bedrijf.

INPUT: een lijst ingredient-namen (Nederlands).
OUTPUT: STRICT JSON met allergeen-codes die in deze gerecht-receptuur aanwezig zijn.

CODES:
${ALLERGEN_CODES.map(c => `- ${c.code} (${c.label}): ${c.examples}`).join('\n')}

REGELS:
- ALLEEN codes uit bovenstaande set teruggeven
- Markeer V (vegetarisch) als er GEEN vlees of vis in zit
- Markeer VE (vegan) als er bovendien GEEN ei of zuivel in zit
- Bij twijfel: code WEL toevoegen (veiligheid > false negatives)
- Pinda valt onder N (noten) - behandel als noten
- Soja saus = S én G (gluten)
- Brioche/brood = G én vaak E

OUTPUT-FORMAT (alleen dit, geen extra tekst):
{
  "allergens": ["G", "E"],
  "reasoning": "1 zin waarom"
}`;

interface DetectRequest {
    ingredients: string[];
    dish_name?: string;
    /* Pillar #2 (Allergeen-cascade): als component_id meegegeven wordt, schrijven we
       de AI-detectie naar component_allergens (hard-rule 2 compliant ground-truth).
       AI mag voorstellen met ai_suggested=true, mens bevestigt in UI.
       Zonder component_id: legacy gedrag (return JSON only, schrijf NIETS). */
    component_id?: number;
}

interface DetectResponse {
    success: boolean;
    allergens?: string[];
    reasoning?: string;
    error?: string;
    /* Pillar #2: wanneer component_id gegeven was en we hebben naar
       component_allergens geschreven, meldt dit hoeveel rijen zijn toegevoegd
       (alleen nieuwe, dankzij ON CONFLICT DO NOTHING). */
    persisted_count?: number;
}

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return NextResponse.json({ success: false, error: 'Geen API key' }, { status: 500 });

        const supabase = await createServerSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ success: false, error: 'Niet ingelogd' }, { status: 401 });

        const { data: memberData } = await supabase
            .from('organization_members').select('organization_id')
            .eq('user_id', user.id).eq('status', 'active').limit(1);
        const orgId = memberData?.[0]?.organization_id || null;

        const body = await req.json() as DetectRequest;
        const ingredients = (body.ingredients || []).filter(Boolean);
        if (ingredients.length === 0) {
            return NextResponse.json({ success: true, allergens: [], reasoning: 'Geen ingrediënten' });
        }

        const userMessage = `Gerecht: "${body.dish_name || 'onbekend'}"
Ingrediënten:
${ingredients.map(i => '- ' + i).join('\n')}

Welke allergeen-codes zijn aanwezig?`;

        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 200,
            system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: userMessage }],
        });

        if (orgId) {
            void logAiUsageServer({
                organization_id: orgId,
                user_id: user.id,
                action_type: 'other',
                model: 'claude-haiku-4-5',
                tokens_input: response.usage.input_tokens || 0,
                tokens_output: response.usage.output_tokens || 0,
                tokens_cache_read: response.usage.cache_read_input_tokens || 0,
                tokens_cache_creation: response.usage.cache_creation_input_tokens || 0,
                cost_eur_cents: estimateAiCostCents({
                    model: 'claude-haiku-4-5',
                    tokens_input: response.usage.input_tokens || 0,
                    tokens_output: response.usage.output_tokens || 0,
                    tokens_cache_read: response.usage.cache_read_input_tokens || 0,
                    tokens_cache_creation: response.usage.cache_creation_input_tokens || 0,
                }),
                metadata: { source: 'detect_allergens', dish: body.dish_name },
            });
        }

        const textBlock = response.content.find(b => b.type === 'text');
        const text = textBlock && textBlock.type === 'text' ? textBlock.text : '{}';

        let parsed: { allergens?: string[]; reasoning?: string } = {};
        try {
            parsed = JSON.parse(text);
        } catch {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) try { parsed = JSON.parse(m[0]); } catch { /* */ }
        }

        const validCodes = new Set(ALLERGEN_CODES.map(c => c.code));
        const allergens = (parsed.allergens || [])
            .filter((c: any) => typeof c === 'string')
            .map((c: string) => c.toUpperCase().trim())
            .filter((c: string) => validCodes.has(c));

        /* Pillar #2: wanneer client een component_id meegeeft, schrijven we de
           AI-detectie als ai_suggested=true naar component_allergens. Dit is het
           hard-rule 2 compliant pad — mens bevestigt later via een Server Action.
           Geen component_id = legacy flow (return only). */
        let persistedCount = 0;
        if (orgId && body.component_id && allergens.length > 0) {
            const rows = allergens.map(code => ({
                component_id: body.component_id!,
                allergen_code: code,
                organization_id: orgId,
                ai_suggested: true,
                confirmed_at: null as string | null,
                confirmed_by: null as string | null,
            }));
            // ON CONFLICT DO NOTHING: idempotent, behoudt eerder bevestigde rijen
            const { error: insertErr, count } = await supabase
                .from('component_allergens')
                .upsert(rows, { onConflict: 'component_id,allergen_code', ignoreDuplicates: true, count: 'exact' });
            if (insertErr) {
                console.warn('[detect-allergens] persist failed:', insertErr.message);
            } else {
                persistedCount = count ?? 0;
            }
        }

        const result: DetectResponse = {
            success: true,
            allergens,
            reasoning: parsed.reasoning || '',
            ...(body.component_id ? { persisted_count: persistedCount } : {}),
        };
        return NextResponse.json(result);
    } catch (e: any) {
        console.error('[detect-allergens]', e);
        return NextResponse.json({
            success: false,
            error: e?.message || 'Onbekende fout',
        } satisfies DetectResponse, { status: 500 });
    }
}
