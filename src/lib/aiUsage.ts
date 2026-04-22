'use client';

/**
 * AI-usage tracking helpers voor tier-cap enforcement.
 *
 * Flow:
 *   1. Elke AI-action (offerte-wizard, chat, prep-suggestion) logt naar `ai_usage` tabel
 *   2. AiUsageMeter component gebruikt useAiUsageThisMonth() voor live-cap-weergave
 *   3. Bij >100% cap: soft-throttle in /api/ai-execute + /api/chat (server-side)
 *
 * Server-side logging: zie `src/lib/aiUsageServer.ts` (TODO — nog niet gebouwd).
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';

export type AiActionType = 'offerte_wizard' | 'chat' | 'prep_suggestion' | 'menu_suggestion' | 'other';

export interface AiUsageLogEntry {
  organization_id: string;
  user_id?: string | null;
  action_type: AiActionType;
  model?: string;
  tokens_input?: number;
  tokens_output?: number;
  tokens_cache_read?: number;
  tokens_cache_creation?: number;
  cost_eur_cents?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Log een AI-actie naar de `ai_usage` tabel (client-side).
 * Fails silently — nooit een AI-flow blokkeren vanwege logging-fout.
 *
 * Voorkeur: roep dit aan vanuit de server-route (bv. /api/chat) met service-role key,
 * zodat logging niet gemist wordt bij client-side fouten.
 */
export async function logAiUsage(entry: AiUsageLogEntry): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('ai_usage').insert({
      organization_id: entry.organization_id,
      user_id: entry.user_id ?? null,
      action_type: entry.action_type,
      model: entry.model ?? null,
      tokens_input: entry.tokens_input ?? 0,
      tokens_output: entry.tokens_output ?? 0,
      tokens_cache_read: entry.tokens_cache_read ?? 0,
      tokens_cache_creation: entry.tokens_cache_creation ?? 0,
      cost_eur_cents: entry.cost_eur_cents ?? 0,
      metadata: entry.metadata ?? {},
    });
  } catch (e) {
    console.warn('[AI Usage] Log failed (non-blocking):', (e as Error).message);
  }
}

/**
 * Hook: haalt het aantal AI-acties op voor de huidige organisatie in de huidige kalendermaand.
 * Herlaadt automatisch elke 30 seconden om verse data te tonen.
 */
export function useAiUsageThisMonth(): {
  count: number;
  loading: boolean;
  refetch: () => void;
} {
  const { orgId } = useOrg();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  function fetchCount() {
    if (!supabase || !orgId) {
      setLoading(false);
      return;
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    supabase
      .from('ai_usage')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', startOfMonth.toISOString())
      .then(function (res) {
        if (res.count !== null && res.count !== undefined) setCount(res.count);
        setLoading(false);
      });
  }

  useEffect(function () {
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return function () { clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  return { count, loading, refetch: fetchCount };
}

/**
 * Bereken de kosten van een AI-call in euro-cent op basis van token-gebruik.
 * Claude Sonnet 4.6 pricing (USD, ~€1 = $1.08 in 2026):
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
  const USD_TO_EUR = 0.93; // approximate, adjust periodically

  // Claude Sonnet 4.6 pricing per million tokens (USD)
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

  return Math.round(usd * USD_TO_EUR * 100); // eur cents
}
