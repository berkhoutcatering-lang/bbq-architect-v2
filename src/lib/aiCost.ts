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

    const PRICING: Record<string, { input: number; output: number; cache_read: number; cache_write: number }> = {
        'claude-sonnet-4-6': { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
        'claude-sonnet-4-7': { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
        'claude-opus-4-7': { input: 15, output: 75, cache_read: 1.5, cache_write: 18.75 },
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
