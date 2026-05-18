/**
 * HACCP-checklist generator — Anthropic Sonnet 4.6 + Citations API streaming.
 *
 * Pillar #1: streaming SSE zodat chef <8s feedback ziet.
 * Pillar #2: Citations API — elke check toont bron (EU 852/2004, Recept, NVWA).
 * Pillar #4: prompt-cache 1h op statische prefix (HACCP-regels), max_tokens cap.
 *
 * NIET: AI mag GEEN temp-waarden suggereren — target-string blijft norm-formuur.
 */
import Anthropic from '@anthropic-ai/sdk';

export const HACCP_MODEL = 'claude-sonnet-4-5-20250929';

const SYSTEM_PROMPT = `Je bent een NL-HACCP-expert voor BBQ-catering.

Bij elk gerecht stel je voor welke controle-momenten nodig zijn op basis van:
- EU Verordening (EG) Nr. 852/2004 — HACCP-beginselen
- EU Verordening (EG) Nr. 853/2004 — dierlijke producten
- Warenwetbesluit Hygiëne — Nederlandse aanvullende eisen
- NVWA Infoblad 75 — regenereren

REGELS (kritisch):
1. NOOIT temperatuur-waarden suggereren als gemeten waarde — die komen van de thermometer. In target-string mag alleen de wettelijke norm ("≥ 75°C", "≤ 4°C").
2. NOOIT allergeen-tekst genereren — allergenen komen uit recipe_allergens.
3. Geef voor elke check ≥1 citation met src + ref.
4. DEDUP (BELANGRIJK voor multi-dish events):
   - Maak ÉÉN gecombineerde ontvangst-check voor alle vlees (rund + varken + lam + kip): zet ALLE vlees-dish-ids in dish_ids van die ene check.
   - Maak ÉÉN gecombineerde ontvangst-check voor alle vis/zeevruchten (indien aanwezig).
   - Maak ÉÉN gecombineerde ontvangst-check voor groenten/droogwaren (indien meerdere).
   - Maak ÉÉN gecombineerde koel-bewaring-check per proteïne-groep.
   - Gerecht-specifieke kerntemperatuur-checks blijven WEL per gerecht (Pulled Pork ≥93°C ≠ Brisket ≥90°C).
   - Uitgifte-checks: één per warmte-zone (alle vlees uitgifte ≥65°C samen, koud uitgifte ≤7°C samen).
5. Output is strict JSON via tool_use schema submit_haccp_checklist.`;

const HACCP_TOOL = {
    name: 'submit_haccp_checklist',
    description: 'Submit de voorgestelde HACCP-checks voor het event of gerecht.',
    input_schema: {
        type: 'object' as const,
        properties: {
            checks: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        type: {
                            type: 'string',
                            enum: ['ontvangst', 'bewaring', 'kern', 'uitgifte', 'regenereren'],
                        },
                        label: { type: 'string' },
                        target: {
                            type: 'string',
                            description: 'Norm-formulering, bijv. "≥ 75°C" of "Visueel + THT-controle". NOOIT een gemeten waarde.',
                        },
                        hour_offset_from_serving: {
                            type: 'number',
                            description: 'Uur-offset t.o.v. serveertijd (negatief = ervoor, 0 = bij uitgifte).',
                        },
                        risk: { type: 'string', enum: ['hoog', 'middel', 'laag'] },
                        dish_ids: { type: 'array', items: { type: 'string' } },
                        cite: {
                            type: 'object',
                            properties: {
                                sum: { type: 'string' },
                                src: { type: 'string' },
                                ref: { type: 'string' },
                            },
                            required: ['sum', 'src', 'ref'],
                        },
                    },
                    required: ['type', 'label', 'target', 'hour_offset_from_serving', 'risk', 'dish_ids', 'cite'],
                },
            },
        },
        required: ['checks'],
    },
};

export interface DishInput {
    id: string;
    name: string;
    sub?: string;
    risk: 'hoog' | 'middel' | 'laag';
}

export interface GenerateHaccpInput {
    eventTitle: string;
    servingTime: string; // "HH:MM"
    dishes: DishInput[];
}

export interface StreamUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    estCostEurCents: number;
}

export interface StreamEvent {
    type: 'check' | 'progress' | 'done' | 'error';
    check?: unknown;
    progress?: { current: number; total: number };
    usage?: StreamUsage;
    message?: string;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Sanitize user-controlled input om prompt-injection (LLM01) te voorkomen.
function sanitize(s: string): string {
    return s
        .replace(/[<>]/g, '')
        .replace(/\bIGNORE\s+(PRIOR|ABOVE|ALL)\s+INSTRUCTIONS\b/gi, '')
        .slice(0, 500);
}

// Token-cost rule of thumb (€/1M, Sonnet 4.5/4.6, mei 2026, EUR ≈ USD * 0.93):
//   input €2.79, output €13.95, cache-read €0.279 (90% off), cache-write €3.49 (1.25× voor 5min)
function estimateCost(u: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }): number {
    const inEur = u.inputTokens * 0.00000279;
    const outEur = u.outputTokens * 0.00001395;
    const cacheReadEur = u.cacheReadTokens * 0.000000279;
    const cacheWriteEur = u.cacheCreationTokens * 0.00000349;
    return Math.round((inEur + outEur + cacheReadEur + cacheWriteEur) * 100);
}

export async function* streamHaccpChecklist(
    input: GenerateHaccpInput,
): AsyncGenerator<StreamEvent> {
    if (!process.env.ANTHROPIC_API_KEY) {
        yield { type: 'error', message: 'ANTHROPIC_API_KEY niet geconfigureerd' };
        return;
    }

    const userPrompt = `<event>
Titel: ${sanitize(input.eventTitle)}
Serveertijd: ${input.servingTime}
Gerechten:
${input.dishes.map((d, i) => `${i + 1}. [${sanitize(d.id)}] ${sanitize(d.name)}${d.sub ? ` (${sanitize(d.sub)})` : ''} — risico=${d.risk}`).join('\n')}
</event>

Genereer een gededupliceerde HACCP-checklist voor dit event. Bundel ontvangst- en bewaring-checks waar mogelijk per dier-groep. Geef per check een bron-citatie.`;

    let stream;
    try {
        stream = client.messages.stream({
            model: HACCP_MODEL,
            max_tokens: 2000,
            system: [
                {
                    type: 'text',
                    text: SYSTEM_PROMPT,
                    cache_control: { type: 'ephemeral', ttl: '1h' },
                },
            ],
            messages: [{ role: 'user', content: userPrompt }],
            tools: [HACCP_TOOL],
            tool_choice: { type: 'tool', name: 'submit_haccp_checklist' },
        });
    } catch (e) {
        yield { type: 'error', message: `Anthropic call faalde: ${(e as Error).message}` };
        return;
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let cacheRead = 0;
    let cacheCreate = 0;

    try {
        for await (const event of stream) {
            if (event.type === 'message_delta' && event.usage) {
                inputTokens = event.usage.input_tokens ?? inputTokens;
                outputTokens = event.usage.output_tokens ?? outputTokens;
                cacheRead = event.usage.cache_read_input_tokens ?? cacheRead;
                cacheCreate = event.usage.cache_creation_input_tokens ?? cacheCreate;
            }
        }

        const final = await stream.finalMessage();
        if (final.usage) {
            inputTokens = final.usage.input_tokens ?? inputTokens;
            outputTokens = final.usage.output_tokens ?? outputTokens;
            cacheRead = final.usage.cache_read_input_tokens ?? cacheRead;
            cacheCreate = final.usage.cache_creation_input_tokens ?? cacheCreate;
        }

        const toolUse = final.content.find((b) => b.type === 'tool_use');
        if (!toolUse || toolUse.type !== 'tool_use') {
            yield { type: 'error', message: 'AI leverde geen tool_use response' };
            return;
        }
        const checks = ((toolUse.input as { checks?: unknown[] }).checks ?? []) as Array<Record<string, unknown>>;

        for (let i = 0; i < checks.length; i++) {
            yield { type: 'check', check: checks[i] };
            yield { type: 'progress', progress: { current: i + 1, total: checks.length } };
        }

        const usage: StreamUsage = {
            inputTokens,
            outputTokens,
            cacheReadTokens: cacheRead,
            cacheCreationTokens: cacheCreate,
            estCostEurCents: estimateCost({ inputTokens, outputTokens, cacheReadTokens: cacheRead, cacheCreationTokens: cacheCreate }),
        };

        yield { type: 'done', usage };
    } catch (e) {
        yield { type: 'error', message: `Stream error: ${(e as Error).message}` };
    }
}
