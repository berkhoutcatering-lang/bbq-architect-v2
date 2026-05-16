/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import type AnthropicType from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/*
 * Voorraad AI-assistent endpoint
 * ──────────────────────────────
 * Korte, gefocuste Q&A op basis van de voorraad-snapshot.
 * Gebruikt Haiku voor snelheid (en lage kosten — typisch <€0,01 per vraag).
 */
const SYSTEM = `Je bent de voorraad-assistent voor een Nederlandse BBQ-catering.
Antwoord ULTRA-KORT en concreet:
- Maximaal 3 zinnen of 4 bullets
- Noem CONCRETE productnamen, geen abstracte adviezen
- Geen emoji
- Praat in het Nederlands
- Geen marketing-taal, gewoon feiten + actie

Als de vraag niet over voorraad gaat, zeg dat eerlijk in 1 zin.`;

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return NextResponse.json({ error: 'Geen API key' }, { status: 500 });

        const supabase = await createServerSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

        const { data: memberData } = await supabase
            .from('organization_members').select('organization_id')
            .eq('user_id', user.id).eq('status', 'active').limit(1);
        const orgId = memberData?.[0]?.organization_id;

        const body = await req.json();
        const { question, snapshot } = body as { question: string; snapshot: string };

        if (!question || typeof question !== 'string') {
            return NextResponse.json({ error: 'Vraag verplicht' }, { status: 400 });
        }

        const userMessage = `Voorraad-snapshot:
${snapshot || '(geen snapshot beschikbaar)'}

Vraag: ${question}`;

        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client: AnthropicType = new Anthropic({ apiKey });
        const response = await client.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 600,
            system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: userMessage }],
        });

        const textBlock = response.content.find(b => b.type === 'text');
        const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';

        if (orgId) {
            void logAiUsageServer({
                organization_id: orgId,
                user_id: user.id,
                action_type: 'chat',
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
                metadata: { source: 'voorraad_ai_chat', question_length: question.length },
            });
        }

        return NextResponse.json({
            success: true,
            text,
            tokens: response.usage,
        });
    } catch (e: any) {
        console.error('[voorraad-ai]', e);
        return NextResponse.json({ error: e?.message || 'Onbekende fout' }, { status: 500 });
    }
}
