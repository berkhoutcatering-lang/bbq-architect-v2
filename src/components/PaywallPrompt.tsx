'use client';

import Link from 'next/link';
import { Lock, Sparkles, ArrowRight } from 'lucide-react';
import { useTier, TIER_PRICING, type Tier } from '@/lib/featureFlags';

interface Props {
  /** Feature-key die niet-beschikbaar is voor huidige tier. */
  feature: string;
  /** Optionele titel (default: auto gegenereerd). */
  title?: string;
  /** Optionele beschrijving van wat deze feature doet. */
  description?: string;
  /** Compacte variant (voor inline-placements). */
  variant?: 'full' | 'compact';
  /** Optioneel: toon onder/naast een specifieke tier-badge. */
  className?: string;
}

const FEATURE_DESCRIPTIONS: Record<string, { title: string; desc: string }> = {
  menu_engineering: {
    title: 'Menu-engineering',
    desc: 'BCG-matrix per gerecht — zie waar je marge en volume zitten. Optimaliseer je menu op basis van data, niet gevoel.',
  },
  haccp: {
    title: 'HACCP-module',
    desc: 'Temperatuur-registratie, afwijkingen en compliance-logs. NVWA-audit-klaar in één klik.',
  },
  voorraad: {
    title: 'Voorraadbeheer',
    desc: 'Track voorraad per item, stel minimum-limieten in, ontvang automatische tekort-alerts.',
  },
  inkoop: {
    title: 'Inkoop-beheer',
    desc: 'Leveranciers, bestellingen en bonnen — allemaal op één plek.',
  },
  crew_uren: {
    title: 'Crew & uren-registratie',
    desc: 'Tijdregistratie per event, per medewerker. Automatische uren-export.',
  },
  materieel: {
    title: 'Materieel-beheer',
    desc: 'Houd je apparatuur bij, plan onderhoud, voorkom verrassingen.',
  },
  moneybird_sync: {
    title: 'Moneybird-integratie',
    desc: 'Sync facturen automatisch naar je Moneybird-boekhouding.',
  },
  mollie_ideal: {
    title: 'iDEAL-betaling',
    desc: 'Klanten betalen facturen direct met iDEAL — binnen 2 werkdagen geld op je rekening.',
  },
  e_signature: {
    title: 'E-signature',
    desc: 'Juridisch verifieerbare digitale handtekening op offertes.',
  },
  lead_capture_widget: {
    title: 'Lead-capture widget',
    desc: 'Embed een offerte-formulier op je website — leads landen direct in je CRM.',
  },
  dropoff_portal: {
    title: 'Drop-off bestel-portal',
    desc: 'Klanten boeken standaard-pakketten zelf, 24/7.',
  },
  api_access: {
    title: 'API-toegang',
    desc: 'Bouw custom integraties met je andere tools.',
  },
  white_label: {
    title: 'White-label PDF\u2019s',
    desc: 'Offerte- en factuur-PDF\u2019s in jouw eigen huisstijl.',
  },
  advanced_analytics: {
    title: 'Advanced analytics',
    desc: 'Diepere rapportages: trend-analyse, klant-segmentatie, profitability-dashboard.',
  },
};

/**
 * Toont een upgrade-prompt wanneer de huidige tier de feature niet heeft.
 * Gebruikt `requiresUpgradeFor()` uit `useTier()` om de minimum-tier te bepalen.
 */
export default function PaywallPrompt({
  feature,
  title,
  description,
  variant = 'full',
  className = '',
}: Props) {
  const { tier, requiresUpgradeFor } = useTier();
  const needsTier = requiresUpgradeFor(feature);

  // Feature beschikbaar — niets renderen
  if (!needsTier) return null;

  const info = FEATURE_DESCRIPTIONS[feature];
  const displayTitle = title ?? info?.title ?? 'Deze feature';
  const displayDesc = description ?? info?.desc ?? 'Beschikbaar vanaf een hogere tier.';
  const targetPrice = TIER_PRICING[needsTier];

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-3 p-3 rounded-lg border border-[var(--color-accent-gold)]/30 bg-[var(--color-accent-gold)]/5 ${className}`}>
        <Lock className="w-4 h-4 text-[var(--color-accent-gold)] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-bold text-[var(--text)] truncate">{displayTitle}</div>
          <div className="text-[11px] text-[var(--muted)]">Vanaf <span className="capitalize">{targetPrice.label}</span> (€{targetPrice.monthlyEUR}/mnd)</div>
        </div>
        <Link
          href="/pricing"
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-bold bg-[var(--color-accent-gold)] text-black hover:brightness-110 no-underline shrink-0"
        >
          Upgrade
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-[var(--color-accent-gold)]/30 bg-gradient-to-br from-[var(--color-accent-gold)]/[0.08] via-transparent to-transparent p-8 ${className}`}>
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--color-accent-gold)/20%,_transparent_50%)]" />

      <div className="relative">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-xl bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)]/30 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5 text-[var(--color-accent-gold)]" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--color-accent-gold)]">
                {TIER_PRICING[tier].label}-tier bereikt
              </div>
            </div>
            <h2 className="text-2xl font-extralight text-[var(--text)] mb-2">{displayTitle}</h2>
            <p className="text-[14px] text-[var(--muted)] leading-relaxed max-w-xl">
              {displayDesc}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--color-bg-deep)] border border-[var(--card-solid)] mb-5">
          <Sparkles className="w-5 h-5 text-[var(--color-accent-gold)] shrink-0" />
          <div className="flex-1">
            <div className="text-[12px] text-[var(--muted)]">Beschikbaar vanaf</div>
            <div className="text-[16px] font-bold text-[var(--text)]">
              <span className="capitalize">{targetPrice.label}</span>{' '}
              <span className="tabular-nums">€{targetPrice.monthlyEUR}</span>
              <span className="text-[12px] text-[var(--muted)] font-normal">/maand</span>
              {' · '}
              <span className="tabular-nums">€{targetPrice.yearlyEUR}</span>
              <span className="text-[12px] text-[var(--muted)] font-normal">/jaar</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/pricing"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-bold bg-[var(--color-accent-gold)] text-black hover:brightness-110 no-underline"
          >
            <span>Upgrade naar <span className="capitalize">{targetPrice.label}</span></span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/pricing"
            className="text-[12px] text-[var(--muted)] hover:text-[var(--text)] no-underline"
          >
            Vergelijk alle tiers →
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Wrapper-component: toont children als feature beschikbaar is, anders de paywall.
 * Handig om een heel blok achter een paywall te plaatsen.
 *
 * @example
 *   <RequireTier feature="menu_engineering">
 *     <MenuEngineeringDashboard />
 *   </RequireTier>
 */
export function RequireTier({
  feature,
  children,
  fallback,
}: {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { hasFeature, loaded } = useTier();

  if (!loaded) return null;

  if (!hasFeature(feature)) {
    return fallback ?? <PaywallPrompt feature={feature} />;
  }

  return <>{children}</>;
}

/**
 * Tier-badge — toont huidige tier of 'needed' tier voor een feature.
 */
export function TierBadge({
  tier: tierOverride,
  className = '',
}: {
  tier?: Tier;
  className?: string;
}) {
  const { tier: currentTier } = useTier();
  const tier = tierOverride ?? currentTier;
  const pricing = TIER_PRICING[tier];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.1em] border ${
        tier === 'enterprise'
          ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
          : tier === 'professional'
          ? 'bg-[var(--color-accent-gold)]/10 text-[var(--color-accent-gold)] border-[var(--color-accent-gold)]/30'
          : 'bg-white/5 text-white/70 border-white/10'
      } ${className}`}
    >
      {pricing.label}
    </span>
  );
}
