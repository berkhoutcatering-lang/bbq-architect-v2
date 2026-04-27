/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiUsage';

export const runtime = 'nodejs';
export const maxDuration = 30;

/*
 * Service feedback rewrite endpoint
 * ─────────────────────────────────
 * Pitmaster gooit losse zinnen / steekwoorden over de service in
 * (bv. "tempo gang 2 te traag, brisket goed, klant blij, mac & cheese over")
 * en de AI maakt er een nette gestructureerde samenvatting van.
 *
 * Output:
 *  - polishedNarrative: vlotte alinea voor in het rapport
 *  - keyPoints: 3-6 bullets voor in de PDF-table
 *  - sentiment: 'positive' | 'mixed' | 'negative'
 *  - actionables: 2-4 leerpunten voor volgende service
 */

const SYSTEM = `Je bent een hulp-pitmaster die ruwe service-notities omzet in nette evaluatie-tekst voor een service-rapport (PDF dat naar de ondernemer/klant gaat).

Toon: zakelijk, eerlijk, kort. Geen marketing-fluff. Geen emoji. Spreek in 3e persoon ("De service liep…", "Het team merkte…").

Krijg ruwe pitmaster-notities + event-context. Geef ALLEEN geldige JSON terug:

{
  "polishedNarrative": "vlotte alinea van 4-7 zinnen die de notities samenvat",
  "keyPoints": [
    "korte bullet (max 12 woorden)",
    ...3-6 bullets
  ],
  "sentiment": "positive" | "mixed" | "negative",
  "actionables": [
    "concrete actie voor volgende service (max 14 woorden)",
    ...2-4 actionables
  ],
  "tags": ["tempo", "kwaliteit", "team", "klant", "logistiek", "waste"]   // welke thema's komen voor
}

Als notities leeg of onleesbaar: return { error: "te kort om uit te schrijven" }.`;

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
        const orgId = memberData?.[0]?.organization_id || null;

        const body = await req.json();
        const { rawNotes, eventContext } = body as {
            rawNotes: string;
            eventContext?: { title?: string; date?: string; guests?: number; menu?: string };
        };

        if (!rawNotes || rawNotes.trim().length < 10) {
            return NextResponse.json({ error: 'Schrijf minimaal een paar zinnen — anders heeft AI niet veel om mee te werken.' }, { status: 400 });
        }

        const userMessage = `EVENT-CONTEXT:
${eventContext?.title ? `- Event: ${eventContext.title}` : ''}
${eventContext?.date ? `- Datum: ${eventContext.date}` : ''}
${eventContext?.guests ? `- Gasten: ${eventContext.guests}` : ''}
${eventContext?.menu ? `- Menu: ${eventContext.menu}` : ''}

RUWE NOTITIES VAN DE PITMASTER:
${rawNotes}

Geef de nette samenvatting als JSON.`;

        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 1500,
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
                metadata: { source: 'service_feedback_rewrite' },
            });
        }

        const textBlock = response.content.find(b => b.type === 'text');
        const text = textBlock && textBlock.type === 'text' ? textBlock.text : '{}';

        let parsed: any = null;
        try { parsed = JSON.parse(text); } catch {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) try { parsed = JSON.parse(m[0]); } catch { /* */ }
        }
        if (!parsed) return NextResponse.json({ error: 'AI gaf geen geldige JSON terug', raw: text.slice(0, 300) }, { status: 502 });

        return NextResponse.json({ success: true, ...parsed });
    } catch (e: any) {
        console.error('[service-feedback-rewrite]', e);
        return NextResponse.json({ error: e?.message || 'Onbekende fout' }, { status: 500 });
    }
}
