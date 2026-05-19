/**
 * AI-cost hard-cap kill-switch.
 *
 * Hard rule 7 (BBQ Architect): elke Anthropic-call wordt getrackt in `ai_usage`
 * tabel. Soft-cap = 100% van tier-limit (banner-waarschuwing). Hard-cap = 150%
 * van tier-limit (kill-switch: nieuwe calls returnen 402 zonder Anthropic
 * te raken).
 *
 * Tarieven 2026 — afgestemd op realistic Pro-tier usage (gemiddeld €6.33/maand
 * AI-spend bij normal-use, conservatieve buffer voor zwaar-gebruik tenants).
 *
 *   Starter (€49/mnd):     soft €3.00    hard €4.50    (90% gross-margin)
 *   Pro (€99/mnd):         soft €15.00   hard €22.50   (89% gross-margin)
 *   Enterprise (€249/mnd): soft €50.00   hard €75.00   (85% gross-margin)
 *
 * Server-only: gebruik in API-routes (geen 'use client'). Niet importeren
 * vanuit components.
 */

import { createClient } from '@supabase/supabase-js';

export type Tier = 'starter' | 'pro' | 'enterprise';

interface TierCap {
  soft_eur: number;
  hard_eur: number;
}

const TIER_CAPS: Record<Tier, TierCap> = {
  starter: { soft_eur: 3.00, hard_eur: 4.50 },
  pro: { soft_eur: 15.00, hard_eur: 22.50 },
  enterprise: { soft_eur: 50.00, hard_eur: 75.00 },
};

export type CapStatus = 'ok' | 'soft_warning' | 'hard_block';

export interface CapResult {
  status: CapStatus;
  tier: Tier;
  used_eur: number;
  soft_eur: number;
  hard_eur: number;
  projected_eur: number;
  /** Mensentaal-uitleg voor UI / error-payload. */
  message: string;
}

/**
 * Lazy admin-client. Server-only (gebruikt SERVICE_ROLE_KEY).
 * Niet importeren in client code.
 */
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('[aiCostCap] Supabase admin credentials ontbreken (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Pak de huidige MTD spend (maand-tot-nu) in EUR voor een tenant.
 * Idempotent: pure read, geen mutatie.
 */
async function getMonthToDateSpendEur(orgId: string): Promise<number> {
  const admin = getAdminClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data, error } = await admin
    .from('ai_usage')
    .select('cost_eur_cents')
    .eq('organization_id', orgId)
    .gte('created_at', monthStart.toISOString());

  if (error) {
    // Bij DB-fout: fail-open (laat call door, log error) — beter een verrassing
    // bij maand-eind dan downtime door cap-check-bug.
    console.error('[aiCostCap] getMonthToDateSpendEur error:', error.message);
    return 0;
  }

  const totalCents = (data ?? []).reduce(function (sum, row) {
    return sum + (Number(row.cost_eur_cents) || 0);
  }, 0);
  return totalCents / 100;
}

/**
 * Resolve tier voor een org. Lazy lookup met fallback naar 'starter'.
 */
async function getOrgTier(orgId: string): Promise<Tier> {
  const admin = getAdminClient();
  const { data } = await admin
    .from('organizations')
    .select('tier')
    .eq('id', orgId)
    .single();
  const t = (data?.tier as string | undefined)?.toLowerCase();
  if (t === 'pro' || t === 'enterprise' || t === 'starter') return t as Tier;
  return 'starter';
}

/**
 * Check OF een nieuwe AI-call binnen het budget past.
 *
 * Aanroep VÓÓR de Anthropic-call. `estimatedCallEur` is een ruwe schatting
 * van de call (bv 0.02 voor een Haiku-classify, 0.10 voor een Sonnet-wizard).
 * Conservatieve schattingen voorkomen dat een tenant net over de hard-cap
 * schiet door een onverwacht lange response.
 *
 *   const cap = await checkAiCap(orgId, 0.05);
 *   if (cap.status === 'hard_block') {
 *     return NextResponse.json({ error: 'ai_cap_exceeded', ...cap }, { status: 402 });
 *   }
 *   // optioneel: cap.status === 'soft_warning' → log + banner
 *   const response = await anthropic.messages.create(...);
 */
export async function checkAiCap(orgId: string, estimatedCallEur: number = 0.02): Promise<CapResult> {
  const [tier, used] = await Promise.all([
    getOrgTier(orgId),
    getMonthToDateSpendEur(orgId),
  ]);

  const caps = TIER_CAPS[tier];
  const projected = used + Math.max(0, estimatedCallEur);

  if (projected > caps.hard_eur) {
    return {
      status: 'hard_block',
      tier,
      used_eur: used,
      soft_eur: caps.soft_eur,
      hard_eur: caps.hard_eur,
      projected_eur: projected,
      message: `AI-budget voor deze maand is op. Je ${tier}-abonnement heeft hard-cap €${caps.hard_eur.toFixed(2)} bereikt (gebruikt: €${used.toFixed(2)}). AI-features pauzeren tot maand-eind of upgrade je abonnement.`,
    };
  }

  if (projected > caps.soft_eur) {
    return {
      status: 'soft_warning',
      tier,
      used_eur: used,
      soft_eur: caps.soft_eur,
      hard_eur: caps.hard_eur,
      projected_eur: projected,
      message: `AI-budget bijna op. Je ${tier}-abonnement is op €${used.toFixed(2)} van €${caps.soft_eur.toFixed(2)} soft-cap; bij €${caps.hard_eur.toFixed(2)} schakelen AI-features uit tot maand-eind.`,
    };
  }

  return {
    status: 'ok',
    tier,
    used_eur: used,
    soft_eur: caps.soft_eur,
    hard_eur: caps.hard_eur,
    projected_eur: projected,
    message: 'OK',
  };
}

/**
 * Convenience helper: alleen status-check, geen extra metadata.
 * Returnt true als de call geblokkeerd moet worden.
 */
export async function isAiCapBlocked(orgId: string, estimatedCallEur: number = 0.02): Promise<boolean> {
  const cap = await checkAiCap(orgId, estimatedCallEur);
  return cap.status === 'hard_block';
}

/**
 * Wrapper voor API-routes: doe cap-check, returnt een ready-to-use
 * NextResponse-instance bij hard-block (caller hoeft alleen `return` te doen).
 * Bij ok of soft-warning: null — caller gaat verder met de Anthropic-call.
 *
 * Gebruik:
 *   const capRes = await enforceAiCap(orgId, 0.05);
 *   if (capRes) return capRes;
 *   // hier door met messages.create(...)
 *
 * Cost-estimates per call-type (richtlijn, conservatief naar boven afgerond):
 *   - Haiku tekst (classify, briefing, allergen)              €0.01
 *   - Haiku streaming (chef-coach, klantgesprek)              €0.02
 *   - Sonnet tekst (recept-improve, supplier-analysis)        €0.05
 *   - Sonnet vision (bon-extract, parse-attachment)            €0.03
 *   - Sonnet vision batch-25 (pricelist-PDF, catalog-parse)    €0.20
 *   - Opus tekst (offerte-wizard escalation)                   €0.15
 */
export async function enforceAiCap(orgId: string, estimatedCallEur: number = 0.02): Promise<import('next/server').NextResponse | null> {
  const { NextResponse } = await import('next/server');
  const cap = await checkAiCap(orgId, estimatedCallEur);
  if (cap.status === 'hard_block') {
    return NextResponse.json({
      error: 'ai_cap_exceeded',
      message: cap.message,
      tier: cap.tier,
      used_eur: cap.used_eur,
      hard_eur: cap.hard_eur,
    }, { status: 402 });
  }
  return null;
}

/**
 * Tier-caps lookup voor UI-display (bv. /instellingen/ai-usage).
 */
export function getTierCaps(tier: Tier): TierCap {
  return TIER_CAPS[tier];
}
