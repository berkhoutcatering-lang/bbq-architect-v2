// Pure cost-calc helper, server-safe (geen 'use client').
// Voorheen geëxporteerd uit src/lib/aiUsage.ts maar die heeft 'use client' aan
// (vanwege React-hooks daar) waardoor server-routes /api/chat, /api/parse-document,
// /api/materieel/scan crashen bij elke call. Logs vervuilden + cost-tracking
// stopte. Hier is de pure implementatie geïsoleerd.

/**
 * Bereken AI-call kosten in euro-cent op basis van token-gebruik.
 *   - Input: $3 / M tokens
 *   - Output: $15 / M tokens
 *   - Cache read: $0.30 / M tokens (10x goedkoper)
 *   - Cache write: $3.75 / M tokens (25% duurder dan input)
 */
export function estimateAiCostCents(params: {
    model?: string;
    tokens_input?: number;
    tokens_output?: number;
    tokens_cache_read?: number;
    tokens_cache_creation?: number;
}): number {
    const USD_TO_EUR = 0.93;

    /* Prijzen per miljoen tokens, in dollars. Cache-lezen is ongeveer een tiende
       van de invoerprijs, cache-schrijven ongeveer een kwart duurder.

       Opus stond hier op $15/$75 en dat is drie keer te hoog — de werkelijke
       prijs is $5/$25. Daardoor sloeg het kostenplafond te vroeg dicht en leek
       Opus onbetaalbaar terwijl dat niet zo is. Sonnet 5 toegevoegd: die is
       nieuwer én een derde goedkoper dan de 4.6 die we op de meeste plekken
       nog draaien. */
    const PRICING: Record<string, { input: number; output: number; cache_read: number; cache_write: number }> = {
        'claude-opus-5': { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
        'claude-sonnet-5': { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 },
        'claude-sonnet-4-6': { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
        'claude-sonnet-4-7': { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
        'claude-opus-4-7': { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
        'claude-haiku-4-5': { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 },
    };

    // Match exact eerst, anders prefix-match (Anthropic returnt model-IDs
    // met datum-suffix zoals 'claude-haiku-4-5-20251001'; PRICING-keys
    // gebruiken het korte alias).
    const m = params.model || 'claude-sonnet-4-6';
    const prices = PRICING[m]
        || Object.entries(PRICING).find(function ([k]) { return m.startsWith(k); })?.[1]
        || PRICING['claude-sonnet-4-6'];

    const usd =
        ((params.tokens_input || 0) * prices.input +
            (params.tokens_output || 0) * prices.output +
            (params.tokens_cache_read || 0) * prices.cache_read +
            (params.tokens_cache_creation || 0) * prices.cache_write) / 1_000_000;

    return Math.round(usd * USD_TO_EUR * 100); // eur cents
}
