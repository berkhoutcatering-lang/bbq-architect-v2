/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

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

        const body = await req.json();
        const { question, snapshot } = body as { question: string; snapshot: string };

        if (!question || typeof question !== 'string') {
            return NextResponse.json({ error: 'Vraag verplicht' }, { status: 400 });
        }

        const userMessage = `Voorraad-snapshot:
${snapshot || '(geen snapshot beschikbaar)'}

Vraag: ${question}`;

        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 600,
            system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: userMessage }],
        });

        const textBlock = response.content.find(b => b.type === 'text');
        const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';

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
