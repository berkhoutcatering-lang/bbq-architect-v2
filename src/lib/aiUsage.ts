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

  /* De teller stond elke 30 seconden een query te doen op élke pagina, ook als
     het tabblad allang op de achtergrond stond. Twee minuten is ruim genoeg
     voor een verbruiksmeter, en bij een verborgen tabblad slaan we de tik
     helemaal over — bij terugkomst wordt meteen ververst, dus wie kijkt ziet
     nooit een verouderd getal. */
  useEffect(function () {
    fetchCount();

    const interval = setInterval(function () {
      if (document.visibilityState === 'hidden') return;
      fetchCount();
    }, 120_000);

    function onVisible() {
      if (document.visibilityState === 'visible') fetchCount();
    }
    document.addEventListener('visibilitychange', onVisible);

    return function () {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  return { count, loading, refetch: fetchCount };
}

// Re-export voor backward compat — nieuwe code importeert direct uit @/lib/aiCost
// (zonder 'use client' wrapper). Server-routes MOETEN @/lib/aiCost gebruiken,
// anders crashen ze met "client function from server".
export { estimateAiCostCents } from '@/lib/aiCost';
