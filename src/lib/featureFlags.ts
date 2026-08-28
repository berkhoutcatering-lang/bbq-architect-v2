'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { dedupe } from '@/lib/requestDedupe';

// ═══════════════════════════════════════════════════════════════
// TIERS & LIMITS
//
// Drie abonnementen. Eén AI-actie = 1 offerte-wizard-run of 1 chat-
// conversatie of 1 menu-suggestie. Bij overschrijding van de cap:
// soft-throttle met upgrade-prompt, geen hard-block.
// ═══════════════════════════════════════════════════════════════

export type Tier = 'starter' | 'professional' | 'enterprise';

export interface TierLimits {
  aiActionsPerMonth: number; // -1 = unlimited
  eventsPerMonth: number;    // -1 = unlimited
  teamMembers: number;       // -1 = unlimited
  storageGB: number;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  starter:      { aiActionsPerMonth: 50,   eventsPerMonth: 10,  teamMembers: 2,  storageGB: 1 },
  professional: { aiActionsPerMonth: 500,  eventsPerMonth: 50,  teamMembers: 5,  storageGB: 10 },
  enterprise:   { aiActionsPerMonth: 2000, eventsPerMonth: -1,  teamMembers: -1, storageGB: 100 },
};

export interface TierPricing {
  monthlyEUR: number;
  yearlyEUR: number;   // jaarprijs = 10× maandprijs (2 maanden gratis)
  label: string;
  tagline: string;
}

export const TIER_PRICING: Record<Tier, TierPricing> = {
  starter: {
    monthlyEUR: 49,
    yearlyEUR: 490,
    label: 'Starter',
    tagline: 'Voor nano-caterers — 1 tot 5 events per maand',
  },
  professional: {
    monthlyEUR: 99,
    yearlyEUR: 990,
    label: 'Pro',
    tagline: 'Voor actieve caterers — 5 tot 30 events per maand',
  },
  enterprise: {
    monthlyEUR: 249,
    yearlyEUR: 2490,
    label: 'Enterprise',
    tagline: 'Voor groei-bedrijven en kleine ketens — 30+ events per maand',
  },
};

// Features die per tier ontgrendeld worden.
// Alles dat hier NIET in staat = beschikbaar in alle tiers.
// Een feature in `professional` is ook automatisch beschikbaar in `enterprise`.
export const TIER_FEATURES: Record<Tier, string[]> = {
  starter: [
    'events',
    'offertes',
    'facturen',
    'klanten',
    'recepten',
    'gerechten',
    'agenda',
    'ai_assistant',       // met cap van TIER_LIMITS.starter.aiActionsPerMonth
    'ai_offerte_wizard',  // idem
  ],
  professional: [
    'menu_engineering',
    'haccp',
    'voorraad',
    'inkoop',
    'crew_uren',
    'materieel',
    'logistiek',
    'moneybird_sync',
    'mollie_ideal',
    'e_signature',
    'advanced_analytics',
    'price_intelligence',
    'foto_archief',
    'template_editor',
    'website_builder',
    'csv_import',
  ],
  enterprise: [
    'lead_capture_widget',
    'dropoff_portal',
    'api_access',
    'white_label',
    'multi_location',
    'priority_support',
    'custom_branding',
  ],
};

const TIER_ORDER: Tier[] = ['starter', 'professional', 'enterprise'];

export function tierAtLeast(current: Tier, required: Tier): boolean {
  return TIER_ORDER.indexOf(current) >= TIER_ORDER.indexOf(required);
}

/** Geef de minimum-tier die deze feature bevat, of null als nergens gedefinieerd. */
export function minimumTierFor(feature: string): Tier | null {
  for (const tier of TIER_ORDER) {
    if (TIER_FEATURES[tier].includes(feature)) return tier;
  }
  return null;
}

/** Alle features die een tier krijgt (inclusief lagere tiers). */
export function featuresForTier(tier: Tier): string[] {
  const all: string[] = [];
  for (const t of TIER_ORDER) {
    all.push(...TIER_FEATURES[t]);
    if (t === tier) break;
  }
  return all;
}

// ═══════════════════════════════════════════════════════════════
// LEGACY FEATURE-FLAGS (backwards-compat met Berkhout's bestaande setup)
// ═══════════════════════════════════════════════════════════════

// Deze boolean-map blijft gerespecteerd bovenop tier-features.
// Staat op true → feature is enabled, ongeacht tier (voor Berkhout's founder-account).
const DEFAULT_FLAGS: Record<string, boolean> = {
  ai_assistant: true,
  price_intelligence: true,
  csv_import: true,
  website_builder: true,
  advanced_analytics: true,
  api_access: false,
  multi_location: false,
  white_label: false,
};

export function useFeatureFlags() {
  const { orgId } = useOrg();
  const [flags, setFlags] = useState<Record<string, boolean>>(DEFAULT_FLAGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(function () {
    if (!supabase || !orgId) return;

    dedupe('flags:' + orgId, function () {
      return supabase!.from('organizations').select('feature_flags').eq('id', orgId).single();
    })
      .then(function ({ data }) {
        if (data?.feature_flags && typeof data.feature_flags === 'object') {
          setFlags({ ...DEFAULT_FLAGS, ...(data.feature_flags as Record<string, boolean>) });
        }
        setLoaded(true);
      });
  }, [orgId]);

  function isEnabled(flag: string): boolean {
    return flags[flag] ?? DEFAULT_FLAGS[flag] ?? true;
  }

  return { flags, isEnabled, loaded };
}

// ═══════════════════════════════════════════════════════════════
// TIER HOOK (nieuw — gebruik dit voor paywall-checks)
// ═══════════════════════════════════════════════════════════════

export interface UseTierResult {
  tier: Tier;
  limits: TierLimits;
  pricing: TierPricing;
  features: string[];
  hasFeature: (feature: string) => boolean;
  requiresUpgradeFor: (feature: string) => Tier | null;
  loaded: boolean;
}

/**
 * Haalt de huidige tier uit de organization en geeft limits + feature-checks terug.
 * Gebruik dit voor paywall-beslissingen in de UI.
 *
 * @example
 *   const { hasFeature, requiresUpgradeFor } = useTier();
 *   if (!hasFeature('haccp')) return <UpgradePrompt minimumTier={requiresUpgradeFor('haccp')} />;
 */
export function useTier(): UseTierResult {
  const { organization } = useOrg();
  const { isEnabled, loaded: flagsLoaded } = useFeatureFlags();

  const tier: Tier = (organization?.plan as Tier) || 'starter';
  const features = featuresForTier(tier);

  function hasFeature(feature: string): boolean {
    // Legacy-flag override: als een boolean-flag expliciet op true staat, is die altijd actief.
    // (Dit is hoe Berkhout's founder-account extra features krijgt zonder Enterprise-tier.)
    if (isEnabled(feature)) return true;
    return features.includes(feature);
  }

  function requiresUpgradeFor(feature: string): Tier | null {
    if (hasFeature(feature)) return null;
    return minimumTierFor(feature);
  }

  return {
    tier,
    limits: TIER_LIMITS[tier],
    pricing: TIER_PRICING[tier],
    features,
    hasFeature,
    requiresUpgradeFor,
    loaded: flagsLoaded && !!organization,
  };
}
