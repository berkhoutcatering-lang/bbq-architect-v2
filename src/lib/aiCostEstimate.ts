/* Pure server-safe versie van de cost-estimator (geen 'use client' marker
   zodat API routes hem direct kunnen aanroepen zonder de RSC-boundary
   te schenden). Wordt geïmporteerd door zowel client (aiUsage.ts re-export)
   als server (api/* routes). */

export function estimateAiCostCentsPure(params: {
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
        'claude-opus-4-7':   { input: 15, output: 75, cache_read: 1.5, cache_write: 18.75 },
        'claude-haiku-4-5':  { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 },
    };
    const prices = PRICING[params.model || 'claude-sonnet-4-6'] || PRICING['claude-sonnet-4-6'];
    const usd =
        ((params.tokens_input || 0) * prices.input +
            (params.tokens_output || 0) * prices.output +
            (params.tokens_cache_read || 0) * prices.cache_read +
            (params.tokens_cache_creation || 0) * prices.cache_write) / 1_000_000;
    return Math.round(usd * USD_TO_EUR * 100);
}
