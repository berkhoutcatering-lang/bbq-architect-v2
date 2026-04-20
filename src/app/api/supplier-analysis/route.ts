/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'GROQ_API_KEY ontbreekt' }, { status: 500 });
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

        // Find cheaper alternatives per product
        const cheaperElsewhere: { product: string; selfPrice: number; bestLev: string; bestPrice: number; savingsPct: number }[] = [];
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
                });
            }
        }
        cheaperElsewhere.sort((a, b) => b.savingsPct - a.savingsPct);

        const sharePct = context.totalSpend > 0 ? (context.self.spend / context.totalSpend) * 100 : 0;

        const systemPrompt = `Je bent een BBQ/catering inkoopadviseur. Analyseer een leverancier en geef praktisch advies.
Antwoord in STRIKT JSON:
{
  "headline": "1 zin over deze leverancier",
  "verdict": "green | gold | red (kleur-tone)",
  "body": "2-3 zinnen onderbouwing (welke rol speelt deze leverancier)",
  "savings_tips": [
    { "product": "string", "action": "string (concrete actie)", "impact": "string (bv '+€42/maand')" }
  ],
  "categories_strong": ["categorie waarvoor deze leverancier sterk is"],
  "categories_weak": ["categorie waarvoor je beter elders koopt"],
  "next_action": "string (1 concrete volgende stap)"
}
Geen markdown fences, geen extra tekst.`;

        const userPrompt = `Leverancier: ${leverancier}
Uitgaven: €${context.self.spend.toFixed(2)} (${sharePct.toFixed(1)}% van totaal €${context.totalSpend.toFixed(2)})
Aantal facturen: ${context.self.count}
Producten (top 10): ${(context.self.products || []).slice(0, 10).join(', ')}

${cheaperElsewhere.length > 0 ? `Goedkoper elders gevonden (top 5):
${cheaperElsewhere.slice(0, 5).map(c => `- ${c.product}: ${leverancier} €${c.selfPrice.toFixed(2)} vs ${c.bestLev} €${c.bestPrice.toFixed(2)} (${c.savingsPct.toFixed(1)}% besparing)`).join('\n')}` : 'Geen goedkopere alternatieven gevonden in huidige data.'}

Andere leveranciers in systeem: ${context.others.map(o => o.leverancier).join(', ') || 'geen'}

Geef praktisch advies voor een horeca-eigenaar.`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);

        try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature: 0.3,
                    max_tokens: 1200,
                    response_format: { type: 'json_object' },
                }),
                signal: controller.signal,
            });

            if (!res.ok) {
                const err = await res.text();
                return NextResponse.json({ error: 'AI niet bereikbaar', detail: err.slice(0, 300) }, { status: 502 });
            }

            const data = await res.json();
            const content = data?.choices?.[0]?.message?.content;
            if (!content) return NextResponse.json({ error: 'AI gaf leeg antwoord' }, { status: 502 });

            let parsed: any;
            try { parsed = JSON.parse(content); }
            catch {
                const match = content.match(/\{[\s\S]*\}/);
                if (match) { try { parsed = JSON.parse(match[0]); } catch { /* noop */ } }
            }
            if (!parsed) return NextResponse.json({ error: 'AI antwoord niet JSON', raw: content }, { status: 502 });

            return NextResponse.json({
                success: true,
                analysis: parsed,
                rawData: { cheaperElsewhere: cheaperElsewhere.slice(0, 10), sharePct },
            });
        } finally {
            clearTimeout(timer);
        }
    } catch (e: any) {
        console.error('[supplier-analysis]', e);
        return NextResponse.json({ error: e?.message || 'Onbekend' }, { status: 500 });
    }
}
