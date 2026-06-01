/**
 * Server-side AI-usage tracking + cap-enforcement.
 *
 * Roep `logAiUsageServer()` aan vanuit elke Anthropic-SDK-call in /api/**.
 * Deze gebruikt service-role key, dus RLS wordt bypassed en logging werkt altijd.
 *
 * Roep `checkAiCapServer()` vóór de Anthropic-call om soft-throttle af te dwingen.
 */

import { createClient } from '@supabase/supabase-js';
import { TIER_LIMITS, type Tier } from './featureFlags';

export type AiActionType = 'offerte_wizard' | 'chat' | 'prep_suggestion' | 'menu_suggestion' | 'other';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.warn('[AI Usage Server] Missing SUPABASE_SERVICE_ROLE_KEY — logging disabled');
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface ServerUsageEntry {
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
 * Log een AI-actie naar `ai_usage` (server-side, bypassed RLS).
 * Fails silently — nooit een AI-flow blokkeren vanwege logging.
 */
export async function logAiUsageServer(entry: ServerUsageEntry): Promise<void> {
  const sb = getAdminClient();
  if (!sb) return;

  try {
    await sb.from('ai_usage').insert({
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
    console.warn('[AI Usage Server] Log failed (non-blocking):', (e as Error).message);
  }
}

export interface CapStatus {
  allowed: boolean;
  used: number;
  cap: number;
  tier: Tier;
  reason?: 'over_cap' | 'throttled' | 'no_org';
}

/**
 * Check of een org de AI-cap nog niet heeft overschreden.
 *
 * Return {allowed:true} = mag doorgaan.
 * Return {allowed:false, reason:'over_cap'} = >150% cap, hard-block.
 * Return {allowed:true, reason:'throttled'} = >100% cap maar <150%, soft-throttle (caller
 *   kan rate-limiten tot 10/uur).
 *
 * Altijd tolerant bij fouten: bij DB-error returnt `allowed:true` om AI-flow niet te breken.
 */
export async function checkAiCapServer(organizationId: string): Promise<CapStatus> {
  const sb = getAdminClient();
  if (!sb) return { allowed: true, used: 0, cap: -1, tier: 'starter' };

  try {
    // Get tier — defensive validatie tegen onbekende plan-waardes (legacy 'pro',
    // 'free', NULL etc.). Zonder check crasht TIER_LIMITS[tier].aiActionsPerMonth
    // en degradeert naar fail-open in de catch — wat onbegrensde AI-spend toestaat.
    const orgRes = await sb.from('organizations').select('plan').eq('id', organizationId).single();
    const rawPlan = orgRes.data?.plan;
    const tier: Tier = rawPlan === 'professional' || rawPlan === 'enterprise' ? rawPlan : 'starter';
    const cap = TIER_LIMITS[tier].aiActionsPerMonth;

    if (cap === -1) return { allowed: true, used: 0, cap: -1, tier };

    // Count this month's usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count } = await sb
      .from('ai_usage')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', startOfMonth.toISOString());

    const used = count ?? 0;
    const hardLimit = Math.floor(cap * 1.5); // 150% = hard-block

    if (used >= hardLimit) {
      return { allowed: false, used, cap, tier, reason: 'over_cap' };
    }
    if (used >= cap) {
      return { allowed: true, used, cap, tier, reason: 'throttled' };
    }
    return { allowed: true, used, cap, tier };
  } catch (e) {
    // Never block on DB errors
    console.warn('[AI Cap Server] Check failed — allowing:', (e as Error).message);
    return { allowed: true, used: 0, cap: -1, tier: 'starter' };
  }
}

/**
 * Voorbeeld-wrapper om rond Anthropic-calls te gebruiken.
 *
 * @example
 *   const cap = await checkAiCapServer(orgId);
 *   if (!cap.allowed) return NextResponse.json({ error: 'AI limit exceeded' }, { status: 429 });
 *
 *   const response = await anthropic.messages.create({ ... });
 *
 *   await logAiUsageServer({
 *     organization_id: orgId,
 *     user_id: userId,
 *     action_type: 'chat',
 *     model: response.model,
 *     tokens_input: response.usage.input_tokens,
 *     tokens_output: response.usage.output_tokens,
 *     tokens_cache_read: response.usage.cache_read_input_tokens ?? 0,
 *     tokens_cache_creation: response.usage.cache_creation_input_tokens ?? 0,
 *     cost_eur_cents: estimateAiCostCents({ ... }),
 *   });
 */

/* ── COST-BASED CAP (in cents) ──────────────────────────────────────────────
 *
 * Aparte cap-check op €-cents in plaats van actie-count. Komt naast `checkAiCapServer`
 * (die telt acties); deze telt cumulatieve cost_eur_cents in de huidige maand.
 *
 * Mapping spec → real tier-namen:
 *   free → starter        (€5,00 / maand)
 *   pro → professional    (€50,00 / maand)
 *   enterprise → enterprise (€500,00 / maand)
 *
 * Soft-cap (100%): caller voegt X-Cost-Warning header toe.
 * Hard-cap (150%): caller returnt 429.
 */

const COST_CAP_CENTS_PER_TIER: Record<Tier, number> = {
    starter: 500,
    professional: 5000,
    enterprise: 50000,
};

export interface CostCapStatus {
    allowed: boolean;
    usedCents: number;
    capCents: number;
    tier: Tier;
    reason?: 'over_cap' | 'throttled' | 'no_org';
}

/**
 * Som van `cost_eur_cents` voor de org in de huidige maand. Vergelijkt met
 * per-tier cents-cap. Tolerant bij DB-errors (returnt allowed:true om AI-flow
 * niet te breken — net als checkAiCapServer).
 */
export async function checkAiCostCapServer(organizationId: string): Promise<CostCapStatus> {
    const sb = getAdminClient();
    if (!sb) return { allowed: true, usedCents: 0, capCents: -1, tier: 'starter' };

    try {
        const orgRes = await sb.from('organizations').select('plan').eq('id', organizationId).single();
        const rawPlan = orgRes.data?.plan;
        const tier: Tier = rawPlan === 'professional' || rawPlan === 'enterprise' ? rawPlan : 'starter';
        const capCents = COST_CAP_CENTS_PER_TIER[tier];

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { data } = await sb
            .from('ai_usage')
            .select('cost_eur_cents')
            .eq('organization_id', organizationId)
            .gte('created_at', startOfMonth.toISOString());

        const usedCents = (data ?? []).reduce(
            (sum: number, row: { cost_eur_cents: number | null }) => sum + (row.cost_eur_cents ?? 0),
            0,
        );
        const hardLimit = Math.floor(capCents * 1.5);

        if (usedCents >= hardLimit) {
            return { allowed: false, usedCents, capCents, tier, reason: 'over_cap' };
        }
        if (usedCents >= capCents) {
            return { allowed: true, usedCents, capCents, tier, reason: 'throttled' };
        }
        return { allowed: true, usedCents, capCents, tier };
    } catch (e) {
        console.warn('[AI Cost-Cap Server] Check failed — allowing:', (e as Error).message);
        return { allowed: true, usedCents: 0, capCents: -1, tier: 'starter' };
    }
}
