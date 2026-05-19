/* eslint-disable @typescript-eslint/no-explicit-any */
// Genereer een verse foto-prompt voor een bestaand gerecht. Gebruikt
// dezelfde realistische craft-style template als develop_dishes — zodat oude
// "fine-dining-perfect" prompts kunnen worden vervangen door de nieuwe
// "echte foto met menselijke handtouch" stijl.
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';
import { enforceAiCap } from '@/lib/aiCostCap';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY ontbreekt' }, { status: 500 });

        const body = await req.json();
        const gerechtId = body?.id;
        if (!gerechtId) return NextResponse.json({ error: 'id is verplicht' }, { status: 400 });

        const sb = await createServerSupabase();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

        const { data: gerecht, error: gErr } = await sb.from('gerechten')
            .select('id,naam,gang_slug,beschrijving,ingredienten,bereidingswijze,allergenen,kostprijs_pp,verkoopprijs')
            .eq('id', gerechtId)
            .single();
        if (gErr || !gerecht) return NextResponse.json({ error: 'Gerecht niet gevonden' }, { status: 404 });

        // Org voor usage logging
        let orgId: string | null = null;
        const mem = await sb.from('organization_members').select('organization_id').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
        orgId = mem.data?.organization_id ?? null;

        const client = new Anthropic({ apiKey });

        const tool = {
            name: 'generate_realistic_foto_prompt',
            description: 'Genereer een craft-style realistische foto-prompt — geen AI-perfect fine-dining, wel echte handgemaakte uitstraling.',
            input_schema: {
                type: 'object' as const,
                properties: {
                    foto_prompt: {
                        type: 'string',
                        description: [
                            'Engelse GPT Image 2 prompt — REALISTISCHE craft-style food fotografie, GEEN AI-perfect fine-dining.',
                            'Voelt aan als echte foto door mensen-handen gemaakt: slight imperfections, organic variations, handmade character.',
                            'Format (5-7 zinnen, geen tekst-overlays):',
                            '"Authentic craft food photography of [GERECHT-NAAM in EN], shot in real restaurant kitchen ambiance.',
                            'Hero ingredient: [ingrediënt + EXACT formaat — bv "30/40 count tiger shrimp, lightly charred edges with NATURAL VARIATION in browning, slightly uneven cuts showing handmade prep"].',
                            'Supporting elements: [2-3 extra ingrediënten met visuele details + menselijk touch — bv "hand-diced ripe Ataulfo mango cubes ~5mm with slight size variation, fresh micro cilantro sprigs"].',
                            'Plating: [serveerwijze + bord/glas type, geen rigide perfectie — bv "served casually in clear shot glass on weathered slate, edible flower placed off-center"].',
                            'Lighting & camera: natural daylight, no studio softboxes, 50mm at f/4, shallow but not extreme DOF, slightly tilted angle as if shot by chef during service.',
                            'Style: rustic wooden surface or weathered slate or natural linen — Hop & Bites foodtruck/bistro quality.',
                            'IMPORTANT: avoid plastic-perfect AI symmetry, embrace minor human imperfections, documentary craft-style realism NOT advertisement. No text, no watermark, no people."',
                            '',
                            'BELANGRIJK: gebruik woorden zoals "hand-diced", "slight variation", "natural", "uneven", "casual", "organic" om de AI-perfect-look te doorbreken.',
                        ].join('\n'),
                    },
                },
                required: ['foto_prompt'],
            },
        };

        const userPrompt = [
            'Schrijf een nieuwe craft-style foto-prompt voor dit gerecht:',
            '',
            'Naam: ' + (gerecht.naam || ''),
            'Gang: ' + (gerecht.gang_slug || ''),
            'Beschrijving: ' + (gerecht.beschrijving || ''),
            'Ingrediënten: ' + (Array.isArray(gerecht.ingredienten) ? gerecht.ingredienten.join(', ') : ''),
            '',
            'Gebruik de tool generate_realistic_foto_prompt — gebruik specifieke ingrediënt-formaten + menselijke imperfectie-woorden.',
        ].join('\n');

        /* P0.40 — Sonnet tool-call ≈ €0.04/call. */
        if (orgId) {
            const capRes = await enforceAiCap(orgId, 0.04);
            if (capRes) return capRes;
        }

        const response = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 2000,
            tools: [tool],
            tool_choice: { type: 'tool', name: 'generate_realistic_foto_prompt' },
            messages: [{ role: 'user', content: userPrompt }],
        } as any);

        const toolBlock = response.content.find((b: any) => b.type === 'tool_use') as any;
        const newPrompt = toolBlock?.input?.foto_prompt as string | undefined;
        if (!newPrompt) return NextResponse.json({ error: 'AI gaf geen prompt terug' }, { status: 502 });

        const { error: upErr } = await sb.from('gerechten').update({ foto_prompt: newPrompt }).eq('id', gerechtId);
        if (upErr) return NextResponse.json({ error: 'Opslaan in DB faalde: ' + upErr.message }, { status: 500 });

        // Usage logging (fire-and-forget)
        if (orgId && response.usage) {
            const u = response.usage;
            logAiUsageServer({
                organization_id: orgId,
                user_id: user.id,
                action_type: 'other',
                model: 'claude-sonnet-4-6',
                tokens_input: u.input_tokens,
                tokens_output: u.output_tokens,
                tokens_cache_read: u.cache_read_input_tokens ?? 0,
                tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
                cost_eur_cents: estimateAiCostCents({
                    model: 'claude-sonnet-4-6',
                    tokens_input: u.input_tokens,
                    tokens_output: u.output_tokens,
                    tokens_cache_read: u.cache_read_input_tokens ?? 0,
                    tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
                }),
                metadata: { action: 'regenerate-foto-prompt' },
            }).catch(function () { /* non-blocking */ });
        }

        return NextResponse.json({ foto_prompt: newPrompt });
    } catch (err: any) {
        console.error('[regenerate-prompt] error:', err);
        return NextResponse.json({ error: err.message || 'Onbekende fout' }, { status: 500 });
    }
}
