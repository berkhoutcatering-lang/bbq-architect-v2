/**
 * Haiku 4.5 alias-suggester — verzin 3-5 overkoepelende synoniemen per
 * vlees-product voor toekomstige naam-matching.
 *
 * Voorbeeld: "Varkensnek met been" → ["spiering", "procureur", "boston butt",
 * "pork shoulder", "pulled pork cut"]
 *
 * Gebruikt door pricelistProcessor + chunked aggregator NA insert van mutations.
 * Output wordt opgeslagen in org_price_mutations.suggested_aliases (jsonb).
 * Bij user-approve gaan toggled aliassen naar org_product_aliases.
 *
 * Cost: Haiku 4.5 is goedkoper dan Sonnet (~80% korting); 100 producten ≈ €0.01.
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const MODEL_HAIKU = 'claude-haiku-4-5-20251001';
const HAIKU_INPUT_PER_MTOK_USD = 1;       // Haiku 4.5 ≈ $1/M input
const HAIKU_OUTPUT_PER_MTOK_USD = 5;      // Haiku 4.5 ≈ $5/M output
const HAIKU_CACHE_READ_MULT = 0.1;
const HAIKU_CACHE_WRITE_5M_MULT = 1.25;
const USD_TO_EUR_CENTS = 92;

const MAX_PRODUCTS_PER_CALL = 100;
const MAX_ALIASES_PER_PRODUCT = 5;

const ALIAS_SYSTEM_PROMPT = `Je bent een alias-generator voor een Nederlands BBQ catering-systeem (BBQ Architect).
Je krijgt een lijst vlees/food-producten met hun naam en optioneel hun soort+cut.

VOOR ELK PRODUCT geef je 3-5 OVERKOEPELENDE NAMEN die slagers, leveranciers en koks
voor exact dat zelfde cut gebruiken. Doel: een volgende leverancier-PDF met een
variant-naam wordt nu automatisch herkend als hetzelfde product.

STRIKTE REGELS:
1. ALLEEN gangbare synoniemen voor PRECIES DEZELFDE cut. Geen verzinsels, geen "ongeveer".
2. Mix NL + EN waar relevant: "kippendij" + "chicken thigh" + "dij" + "kippenbil".
3. Geen merknamen, geen leverancier-specifieke termen, geen formaten ("1kg"), geen prijzen.
4. Geen allergenen, geen BTW, geen bereidingen ("gegrild", "gerookt").
5. Lowercase, ontdaan van leestekens. Bv. "boston butt", niet "Boston Butt!".
6. Als je geen extra namen weet (cut is al overduidelijk en uniek), geef gewoon 0-1 synoniemen — NIET opvullen.
7. Output FORMAT: enkele JSON-array. Elk item: {"id": <input id>, "aliases": [string,...]}.
   Geen markdown, geen uitleg, geen extra velden.

VOORBEELD-INPUT:
[{"id":1,"naam":"Varkensnek met been","soort":"varken","cut":"spiering"},
 {"id":2,"naam":"Kippendijfilet zonder vel","soort":"kip","cut":"kippendij"}]

VOORBEELD-OUTPUT:
[{"id":1,"aliases":["spiering","procureur","boston butt","pork shoulder","pulled pork cut"]},
 {"id":2,"aliases":["kippendij","kippenbil","chicken thigh","dij"]}]`;

export interface AliasSuggestInput {
    id: number;            // index om response naar input te mappen
    naam: string;          // parsed_naam
    soort?: string | null; // detected_soort van extractie
    cut?: string | null;   // detected_cut van extractie
}

export interface AliasSuggestResult {
    suggestions: Map<number, string[]>;
    costCents: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
}

const aliasItemSchema = z.object({
    id: z.number().int(),
    aliases: z.array(z.string().min(1).max(80)).max(MAX_ALIASES_PER_PRODUCT),
});
const aliasArraySchema = z.array(aliasItemSchema).max(MAX_PRODUCTS_PER_CALL);

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (e: unknown) {
            lastErr = e;
            const status = (e as { status?: number; statusCode?: number })?.status
                ?? (e as { status?: number; statusCode?: number })?.statusCode;
            const isRetryable = status === 429 || status === 529 || (status != null && status >= 500 && status < 600);
            if (!isRetryable || attempt >= maxAttempts - 1) throw e;
            const wait = Math.min(1000 * 2 ** attempt + Math.random() * 500, 10_000);
            await new Promise(r => setTimeout(r, wait));
        }
    }
    throw lastErr;
}

/**
 * Roep Haiku 4.5 aan voor max 100 producten per keer. Geeft per input id
 * een lijst van 0-5 aliassen. Bij parse/schema-fail: returnt lege map (caller
 * behandelt afwezigheid als "geen suggesties"; geen hard error).
 */
export async function suggestAliasesForProducts(
    inputs: AliasSuggestInput[],
    apiKey?: string,
): Promise<AliasSuggestResult> {
    const empty: AliasSuggestResult = {
        suggestions: new Map(),
        costCents: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
    };
    if (inputs.length === 0) return empty;
    if (inputs.length > MAX_PRODUCTS_PER_CALL) {
        /* Split in chunks van 100, merge resultaten */
        const result: AliasSuggestResult = { ...empty, suggestions: new Map() };
        for (let i = 0; i < inputs.length; i += MAX_PRODUCTS_PER_CALL) {
            const chunk = inputs.slice(i, i + MAX_PRODUCTS_PER_CALL);
            const r = await suggestAliasesForProducts(chunk, apiKey);
            r.suggestions.forEach((v, k) => result.suggestions.set(k, v));
            result.costCents += r.costCents;
            result.inputTokens += r.inputTokens;
            result.outputTokens += r.outputTokens;
            result.cacheReadTokens += r.cacheReadTokens;
            result.cacheCreationTokens += r.cacheCreationTokens;
        }
        return result;
    }

    /* P0: disable SDK retries — withRetry doet z'n eigen mechanism */
    const client = new Anthropic({
        apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
        maxRetries: 0,
    });

    /* Compacte JSON-input voor de model — bespaart tokens */
    const compactInput = inputs.map(i => ({
        id: i.id,
        naam: i.naam,
        ...(i.soort ? { soort: i.soort } : {}),
        ...(i.cut ? { cut: i.cut } : {}),
    }));

    const userText = `Geef voor elk product 0-5 overkoepelende namen. Output JSON-array.\n\nINPUT:\n${JSON.stringify(compactInput)}`;

    let response: Anthropic.Messages.Message;
    try {
        response = await withRetry(() => client.messages.create({
            model: MODEL_HAIKU,
            max_tokens: 4000,
            system: [
                {
                    type: 'text',
                    text: ALIAS_SYSTEM_PROMPT,
                    cache_control: { type: 'ephemeral' },
                },
            ],
            messages: [
                { role: 'user', content: userText },
            ],
        }));
    } catch (e) {
        /* Geen aliases-suggesties = geen drama; PDF-flow zelf gaat door */
        console.warn(`[aliasSuggester] Haiku call fail: ${(e as Error).message.slice(0, 200)}`);
        return empty;
    }

    const u = response.usage;
    const inTok = u.input_tokens ?? 0;
    const outTok = u.output_tokens ?? 0;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const cacheWrite = u.cache_creation_input_tokens ?? 0;

    const costUsd =
        (inTok * HAIKU_INPUT_PER_MTOK_USD
            + outTok * HAIKU_OUTPUT_PER_MTOK_USD
            + cacheRead * HAIKU_INPUT_PER_MTOK_USD * HAIKU_CACHE_READ_MULT
            + cacheWrite * HAIKU_INPUT_PER_MTOK_USD * HAIKU_CACHE_WRITE_5M_MULT)
        / 1_000_000;
    const costCents = Math.round(costUsd * USD_TO_EUR_CENTS);

    const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text).join('');

    /* Parse + valideer */
    const map = new Map<number, string[]>();
    try {
        const clean = text
            .replace(/^[\s\S]*?(\[)/, '[')
            .replace(/](?![\s\S]*])/, ']')
            .trim();
        const parsed = JSON.parse(clean);
        const r = aliasArraySchema.safeParse(parsed);
        if (r.success) {
            for (const item of r.data) {
                /* Dedup + lowercase + trim */
                const cleanAliases = Array.from(new Set(
                    item.aliases
                        .map(a => a.trim().toLowerCase())
                        .filter(a => a.length >= 2 && a.length <= 80),
                ));
                if (cleanAliases.length > 0) map.set(item.id, cleanAliases);
            }
        } else {
            console.warn(`[aliasSuggester] schema-fail: ${r.error.message.slice(0, 200)}`);
        }
    } catch (e) {
        console.warn(`[aliasSuggester] parse-fail: ${(e as Error).message.slice(0, 200)}`);
    }

    return {
        suggestions: map,
        costCents,
        inputTokens: inTok,
        outputTokens: outTok,
        cacheReadTokens: cacheRead,
        cacheCreationTokens: cacheWrite,
    };
}

export const ALIAS_MODEL = MODEL_HAIKU;
