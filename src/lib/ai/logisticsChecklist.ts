/**
 * Logistics-checklist generator — Anthropic Sonnet 4.6 + strict tool-use + Citations.
 *
 * Stelt per event een complete logistiek-checklist voor over 6 categorieën:
 * materieel · menu_prep · personeel · route · locatie · klant.
 *
 * Pillars:
 *  - Streaming SSE zodat /api/logistics-checklist <8s eerste check toont.
 *  - Strict tool-use (`submit_logistics_checklist`) → model kán geen vrije
 *    tekst meer terug — output is altijd structured JSON.
 *  - Citation per check → AiProposalModal toont bron op ?-hover.
 *  - Prompt-cache 1h op statische prefix (system + tool-schema).
 *  - logAiUsageServer + checkAiCap roept de caller, niet deze module.
 *
 * Verboden door BBQ Architect memory-rules (zie haccpChecklist.ts):
 *  - GEEN allergeen-suggesties (komen uit recipe_allergens).
 *  - GEEN HACCP/temperatuur-checks (die horen in /haccp, andere flow).
 *  - GEEN BTW-rates afleiden.
 *  - GEEN exacte productie-hoeveelheden bij vlees (die komen uit menu/per-portion data).
 */

import Anthropic from '@anthropic-ai/sdk';

export const LOGISTICS_MODEL = 'claude-sonnet-4-5-20250929';

/* Statische system-prompt — gecached via cache_control:ephemeral, 1h TTL.
   Houd 'm semantisch stabiel zodat cache hit-rate hoog blijft (>80% bij
   serial events). Bij wijziging stijgt cache-miss kort tot eerstvolgende
   reload, daarna stabiliseert het opnieuw. */
const SYSTEM_PROMPT = `Je bent een NL-logistiek-planner voor BBQ-catering events.

Bij elk event stel je voor welke items, taken en checks nodig zijn over 6 categorieën:
- materieel: hardware/apparatuur die mee moet (smokers, koeling, servies, branding, veiligheid)
- menu_prep: ingrediënten + bereidingstaken op basis van het menu (NIET temperatuur-targets)
- personeel: crew-bezetting (pitmaster + runners) op basis van guests
- route: vertrek + rij-tijden + parkeer-check
- locatie: stroom/water/weer/afval-check op basis van locatie-profiel
- klant: pre-event contactmoments + allergie-bevestiging + tijdschema

REGELS (kritisch):
1. NOOIT temperatuur-waarden, kerntemp of HACCP-checks suggereren — die horen in /haccp, andere flow.
2. NOOIT allergeen-tekst of allergenen-overzicht genereren — allergenen komen uit recipe_allergens.
3. NOOIT BTW-rates of factuur-bedragen afleiden — financiële data komt uit Moneybird/Mollie.
4. NOOIT precieze gram/kilo-hoeveelheden vlees afleiden — bij menu_prep mag je alleen het ingrediënt+eenheid noemen (bv. "Brisket — kg" zonder kg-getal), of bewust laat qty=null. Hoeveelheden worden berekend door miseAggregation o.b.v. gerechten.ingredient_costs.
5. ALTIJD per check een citation invullen met sum + src + ref. Mag een korte rationale zijn ("50 gasten × 1.2 buffer = 60 bordjes").
6. Source_ref kiezen uit ENUM: 'gerecht' | 'hardware_katalogus' | 'gasten_calc' | 'weer_api' | 'klant_data' | 'standaard'.
7. Categorie 'menu_prep' alleen vullen wanneer er gerechten in het menu staan — anders leeg laten.
8. Output is strict JSON via tool_use submit_logistics_checklist.
9. Houd het beheersbaar — 30-50 checks totaal voor een gemiddeld event, niet meer.`;

const LOGISTICS_TOOL = {
    name: 'submit_logistics_checklist',
    description: 'Submit de voorgestelde logistiek-checklist voor het event.',
    input_schema: {
        type: 'object' as const,
        properties: {
            checks: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        category: {
                            type: 'string',
                            enum: ['materieel', 'menu_prep', 'personeel', 'route', 'locatie', 'klant'],
                        },
                        label: { type: 'string', description: 'Korte beschrijving — werkwoord-eerst of zelfstandig naamwoord, NL.' },
                        qty: {
                            type: ['integer', 'null'],
                            description: 'Aantal — null wanneer niet aftelbaar (bv. een check-taak).',
                        },
                        unit: {
                            type: ['string', 'null'],
                            description: 'Eenheid (st, kg, L, set, pers). Null voor check-taken.',
                        },
                        deadline_offset_hours: {
                            type: ['integer', 'null'],
                            description: 'Uur-offset t.o.v. event-start; negatief = ervoor (-72 = T-3 dagen), 0 = op de dag.',
                        },
                        source_ref: {
                            type: 'string',
                            enum: ['gerecht', 'hardware_katalogus', 'gasten_calc', 'weer_api', 'klant_data', 'standaard'],
                        },
                        cite: {
                            type: 'object',
                            properties: {
                                sum: { type: 'string', description: 'Eén zin uitleg waarom deze check nodig is.' },
                                src: { type: 'string', description: 'Brontype, bv. "Berekend uit menu" of "Hardware-katalogus".' },
                                ref: { type: 'string', description: 'Concrete verwijzing, bv. "50 gasten × 1.2 buffer".' },
                            },
                            required: ['sum', 'src', 'ref'],
                        },
                    },
                    required: ['category', 'label', 'source_ref', 'cite'],
                },
            },
        },
        required: ['checks'],
    },
};

export interface DishInput {
    naam: string;
    /* Optionele per-portion ingredients zodat het model totalen kan
       beredeneren — maar dit blijft een PROMPT-hint, niet een afleiding
       die later in productie wordt gebruikt. */
    portionRefs?: Array<{ naam: string; unit?: string }>;
}

export interface GenerateLogisticsInput {
    eventTitle: string;
    eventDate: string;        // 'YYYY-MM-DD'
    guests: number;
    locationName?: string;
    locationProfile?: string;  // bv. "outdoor, geen stroom" of "indoor venue"
    dishes: DishInput[];
    /* Hardware-items die altijd mee gaan voor deze tenant. Halen we expliciet
       op zodat het model niet hoeft te raden wat in het pakket zit. */
    standardHardware?: Array<{ naam: string; categorie?: string; standaard_event?: boolean }>;
    klantNotities?: string;    // bv. "3 gasten met noten-allergie" — info, geen allergeen-output
}

export interface StreamUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    estCostEurCents: number;
}

export interface LogisticsCheck {
    category: 'materieel' | 'menu_prep' | 'personeel' | 'route' | 'locatie' | 'klant';
    label: string;
    qty?: number | null;
    unit?: string | null;
    deadline_offset_hours?: number | null;
    source_ref: 'gerecht' | 'hardware_katalogus' | 'gasten_calc' | 'weer_api' | 'klant_data' | 'standaard';
    cite: { sum: string; src: string; ref: string };
}

export interface StreamEvent {
    type: 'check' | 'progress' | 'done' | 'error';
    check?: LogisticsCheck;
    progress?: { current: number; total: number };
    usage?: StreamUsage;
    message?: string;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Sanitize user-controlled input (LLM01 — prompt injection).
function sanitize(s: string): string {
    return s
        .replace(/[<>]/g, '')
        .replace(/\bIGNORE\s+(PRIOR|ABOVE|ALL)\s+INSTRUCTIONS\b/gi, '')
        .slice(0, 500);
}

// Token-cost rule (Sonnet 4.5/4.6, EUR ≈ USD * 0.93):
//   input €2.79/1M · output €13.95/1M · cache-read €0.279/1M · cache-write €3.49/1M (1.25× voor 5min cache)
function estimateCost(u: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }): number {
    const inEur = u.inputTokens * 0.00000279;
    const outEur = u.outputTokens * 0.00001395;
    const cacheReadEur = u.cacheReadTokens * 0.000000279;
    const cacheWriteEur = u.cacheCreationTokens * 0.00000349;
    return Math.round((inEur + outEur + cacheReadEur + cacheWriteEur) * 100);
}

export async function* streamLogisticsChecklist(
    input: GenerateLogisticsInput,
): AsyncGenerator<StreamEvent> {
    if (!process.env.ANTHROPIC_API_KEY) {
        yield { type: 'error', message: 'ANTHROPIC_API_KEY niet geconfigureerd' };
        return;
    }

    const dishLines = input.dishes.length === 0
        ? '(geen menu — sla categorie menu_prep over)'
        : input.dishes.map((d, i) => `${i + 1}. ${sanitize(d.naam)}`).join('\n');

    const stdHwLines = (input.standardHardware ?? []).length === 0
        ? '(geen tenant-hardware-katalogus beschikbaar — werk met standaard BBQ-pakket)'
        : (input.standardHardware ?? [])
            .map(h => `- ${sanitize(h.naam)}${h.categorie ? ` (${sanitize(h.categorie)})` : ''}`)
            .join('\n');

    const userPrompt = `<event>
Titel: ${sanitize(input.eventTitle)}
Datum: ${sanitize(input.eventDate)}
Gasten: ${Math.max(0, Math.min(2000, input.guests | 0))}
Locatie: ${sanitize(input.locationName ?? 'onbekend')}
Locatie-profiel: ${sanitize(input.locationProfile ?? '—')}
Klant-notities: ${sanitize(input.klantNotities ?? '—')}

Menu (${input.dishes.length} gerechten):
${dishLines}

Tenant-hardware-katalogus (standaard mee bij elk event):
${stdHwLines}
</event>

Genereer een complete logistiek-checklist (30-50 items, verdeeld over de 6 categorieën). Bij elk item: bron-citatie. NOOIT allergenen of HACCP-temperaturen.`;

    let stream;
    try {
        stream = client.messages.stream({
            model: LOGISTICS_MODEL,
            max_tokens: 3000,
            system: [
                {
                    type: 'text',
                    text: SYSTEM_PROMPT,
                    cache_control: { type: 'ephemeral', ttl: '1h' },
                },
            ],
            messages: [{ role: 'user', content: userPrompt }],
            tools: [LOGISTICS_TOOL],
            tool_choice: { type: 'tool', name: 'submit_logistics_checklist' },
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
        const checks = ((toolUse.input as { checks?: LogisticsCheck[] }).checks ?? []);

        // Server-side sanity-check zodat een gehallucineerde category niet
        // door RLS-INSERT loopt en daar pas faalt.
        const validCats = new Set(['materieel', 'menu_prep', 'personeel', 'route', 'locatie', 'klant']);
        const validSources = new Set(['gerecht', 'hardware_katalogus', 'gasten_calc', 'weer_api', 'klant_data', 'standaard']);

        for (let i = 0; i < checks.length; i++) {
            const c = checks[i];
            if (!validCats.has(c.category)) continue;
            if (!validSources.has(c.source_ref)) continue;
            if (typeof c.label !== 'string' || c.label.trim().length === 0) continue;
            yield { type: 'check', check: c };
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
