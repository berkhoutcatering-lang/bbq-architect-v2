/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiUsage';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SYSTEM_PROMPT = `Je bent een BBQ/catering inkoopadviseur. Analyseer een leverancier en geef praktisch advies voor een kleine horeca-ondernemer.

Antwoord in STRIKT JSON, geen markdown fences, geen extra tekst:
{
  "headline": "string (1 zin — directe conclusie over deze leverancier)",
  "verdict": "green | gold | red (kleur-tone)",
  "body": "string (2-3 zinnen — welke rol speelt deze leverancier in totale inkoop)",
  "savings_tips": [
    { "product": "string", "action": "string (concrete actie)", "impact": "string (bv '+€42/maand')" }
  ],
  "categories_strong": ["categorie waarvoor deze leverancier sterk is"],
  "categories_weak": ["categorie waarvoor je beter elders koopt"],
  "next_action": "string (1 concrete volgende stap)"
}`;

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'ANTHROPIC_API_KEY ontbreekt — voeg toe aan .env.local' }, { status: 500 });
        }

        const body = await req.json();
        const { leverancier, context } = body as {
            leverancier: string;
            context: {
                self: { count: number; spend: number; products: string[]; lines: Array<{ product: string; prijs: number; eenheid: string }> };
                others: Array<{ leverancier: string; spend: number; count: number; lines: Array<{ product: string; prijs: number; eenheid: string }> }>;
                totalSpend: number;
            };
        };

        if (!leverancier) {
            return NextResponse.json({ error: 'leverancier verplicht' }, { status: 400 });
        }

        // Find cheaper alternatives per product (hard data — before the LLM call)
        const cheaperElsewhere: { product: string; selfPrice: number; bestLev: string; bestPrice: number; savingsPct: number; eenheid?: string }[] = [];
        for (const line of context.self.lines || []) {
            let best = { lev: '', price: Infinity };
            for (const other of context.others) {
                for (const l of other.lines || []) {
                    if (l.product.toLowerCase() === line.product.toLowerCase() && l.prijs < best.price) {
                        best = { lev: other.leverancier, price: l.prijs };
                    }
                }
            }
            if (best.price < line.prijs && best.price !== Infinity) {
                cheaperElsewhere.push({
                    product: line.product,
                    selfPrice: line.prijs,
                    bestLev: best.lev,
                    bestPrice: best.price,
                    savingsPct: ((line.prijs - best.price) / line.prijs) * 100,
                    eenheid: line.eenheid,
                });
            }
        }
        cheaperElsewhere.sort((a, b) => b.savingsPct - a.savingsPct);

        const sharePct = context.totalSpend > 0 ? (context.self.spend / context.totalSpend) * 100 : 0;

        const userPrompt = `Leverancier: ${leverancier}
Uitgaven: €${context.self.spend.toFixed(2)} (${sharePct.toFixed(1)}% van totaal €${context.totalSpend.toFixed(2)})
Aantal facturen: ${context.self.count}
Producten (top 10): ${(context.self.products || []).slice(0, 10).join(', ')}

${cheaperElsewhere.length > 0 ? `Goedkoper elders gevonden (top 5):
${cheaperElsewhere.slice(0, 5).map(c => `- ${c.product}: ${leverancier} €${c.selfPrice.toFixed(2)} vs ${c.bestLev} €${c.bestPrice.toFixed(2)} (${c.savingsPct.toFixed(1)}% besparing per ${c.eenheid || 'eenheid'})`).join('\n')}` : 'Geen goedkopere alternatieven gevonden in huidige data.'}

Andere leveranciers in systeem: ${context.others.map(o => o.leverancier).join(', ') || 'geen'}

Geef praktisch advies voor een kleine horeca-ondernemer. Verwerk de goedkoper-elders data in savings_tips.`;

        const client = new Anthropic({ apiKey });

        // Resolve org for usage logging
        let orgId: string | null = null;
        let userId: string | null = null;
        try {
            const sb = await createServerSupabase();
            const { data: { user } } = await sb.auth.getUser();
            if (user) {
                userId = user.id;
                const mem = await sb.from('organization_members')
                    .select('organization_id')
                    .eq('user_id', user.id)
                    .eq('status', 'active')
                    .limit(1)
                    .maybeSingle();
                orgId = mem.data?.organization_id ?? null;
            }
        } catch { /* logging optional */ }

        /* Sonnet 4.6 is ruim voldoende voor leveranciers-vergelijking met
           gestructureerde input — Opus was overkill. ~5x goedkoper. */
        const model = 'claude-sonnet-4-6';
        const response = await client.messages.create({
            model,
            max_tokens: 2000,
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: userPrompt }],
        });

        // Log AI-usage (fire-and-forget)
        if (orgId && response.usage) {
            const u = response.usage;
            logAiUsageServer({
                organization_id: orgId,
                user_id: userId,
                action_type: 'other',
                model,
                tokens_input: u.input_tokens,
                tokens_output: u.output_tokens,
                tokens_cache_read: u.cache_read_input_tokens ?? 0,
                tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
                cost_eur_cents: estimateAiCostCents({
                    model,
                    tokens_input: u.input_tokens,
                    tokens_output: u.output_tokens,
                    tokens_cache_read: u.cache_read_input_tokens ?? 0,
                    tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
                }),
                metadata: { action: 'supplier-analysis', leverancier },
            }).catch(function () { /* non-blocking */ });
        }

        const textBlock = response.content.find(b => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
            return NextResponse.json({ error: 'Claude gaf geen tekst antwoord' }, { status: 502 });
        }
        const content = textBlock.text;

        let parsed: any;
        try { parsed = JSON.parse(content); }
        catch {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) { try { parsed = JSON.parse(match[0]); } catch { /* noop */ } }
        }
        if (!parsed) {
            return NextResponse.json({ error: 'AI antwoord niet JSON', raw: content.slice(0, 500) }, { status: 502 });
        }

        return NextResponse.json({
            success: true,
            analysis: parsed,
            rawData: { cheaperElsewhere: cheaperElsewhere.slice(0, 10), sharePct },
            model: response.model,
            usage: response.usage,
        });
    } catch (e: any) {
        console.error('[supplier-analysis]', e);
        if (e instanceof Anthropic.AuthenticationError) {
            return NextResponse.json({ error: 'Ongeldige ANTHROPIC_API_KEY' }, { status: 401 });
        }
        if (e instanceof Anthropic.RateLimitError) {
            return NextResponse.json({ error: 'Rate limit — wacht even' }, { status: 429 });
        }
        if (e instanceof Anthropic.APIError) {
            return NextResponse.json({ error: 'Claude API fout', detail: e.message }, { status: 502 });
        }
        return NextResponse.json({ error: e?.message || 'Onbekend' }, { status: 500 });
    }
}
