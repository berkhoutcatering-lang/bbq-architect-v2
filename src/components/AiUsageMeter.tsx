'use client';

import Link from 'next/link';
import { Sparkles, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { useTier, minimumTierFor, TIER_PRICING } from '@/lib/featureFlags';
import { useAiUsageThisMonth } from '@/lib/aiUsage';

interface Props {
  /** Optioneel override (als je een eigen count wilt passen). Anders uit `useAiUsageThisMonth()`. */
  used?: number;
  /** Optioneel: compactere variant voor sidebar. */
  variant?: 'full' | 'compact';
  /** Optioneel: className voor wrappers. */
  className?: string;
}

/**
 * Toont de AI-actie-meter voor de huidige organisatie.
 * - Bij <80% cap: neutrale weergave
 * - Bij 80-100%: upgrade-suggestie in goud
 * - Bij >100%: soft-throttle waarschuwing in amber
 *
 * Standaard haalt hij live data uit `ai_usage` tabel (zie migration create_ai_usage_tracking).
 * Pass `used` expliciet om een eigen waarde te tonen.
 */
export default function AiUsageMeter({ used: usedProp, variant = 'full', className = '' }: Props) {
  const { tier, limits, loaded } = useTier();
  const { count: usedFromDb } = useAiUsageThisMonth();
  const used = usedProp ?? usedFromDb;

  if (!loaded) return null;

  const cap = limits.aiActionsPerMonth;
  const isUnlimited = cap === -1;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / cap) * 100));
  const overCap = !isUnlimited && used > cap;
  const nearCap = !isUnlimited && pct >= 80 && !overCap;

  const nextTier = minimumTierFor(
    tier === 'starter' ? 'mollie_ideal' : tier === 'professional' ? 'lead_capture_widget' : 'api_access'
  ); // quick suggestion: starter → pro, pro → enterprise

  const barColor = overCap
    ? 'bg-amber-400'
    : nearCap
    ? 'bg-[var(--color-accent-gold)]'
    : 'bg-white/30';

  const textColor = overCap ? 'text-amber-300' : nearCap ? 'text-[var(--color-accent-gold)]' : 'text-[var(--text)]';

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--card-solid)] ${className}`}>
        <Sparkles className={`w-3.5 h-3.5 shrink-0 ${textColor}`} />
        <div className="flex-1 min-w-0">
          <div className={`text-[11px] font-bold tabular-nums ${textColor}`}>
            {isUnlimited ? `${used} AI-acties` : `${used} / ${cap}`}
          </div>
          {!isUnlimited && (
            <div className="h-1 bg-[var(--card-solid)] rounded-full overflow-hidden mt-1">
              <div className={`h-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-xl border bg-[var(--card)] ${nearCap || overCap ? 'border-[var(--color-accent-gold)]/30' : 'border-[var(--card-solid)]'} ${className}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            overCap ? 'bg-amber-500/10' : nearCap ? 'bg-[var(--color-accent-gold)]/10' : 'bg-white/5'
          }`}>
            {overCap
              ? <AlertTriangle className="w-4 h-4 text-amber-400" />
              : <Sparkles className={`w-4 h-4 ${nearCap ? 'text-[var(--color-accent-gold)]' : 'text-white/70'}`} />
            }
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.15em] font-bold text-[var(--muted)]">AI-verbruik deze maand</div>
            <div className={`text-[18px] font-bold tabular-nums ${textColor}`}>
              {isUnlimited ? (
                <>{used} <span className="text-[11px] font-normal text-[var(--muted)]">acties</span></>
              ) : (
                <>
                  {used} <span className="text-[11px] font-normal text-[var(--muted)]">/ {cap}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-[var(--muted)]">Tier</div>
          <div className="text-[13px] font-bold text-[var(--text)] capitalize">{TIER_PRICING[tier].label}</div>
        </div>
      </div>

      {!isUnlimited && (
        <div className="h-2 bg-[var(--color-bg-deep)] rounded-full overflow-hidden mb-3">
          <div
            className={`h-full ${barColor} transition-all duration-700`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {overCap && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[12px] text-amber-200 leading-relaxed">
          <strong className="font-bold">Limiet bereikt.</strong> AI-acties zijn tijdelijk beperkt tot 10 per uur.
          {nextTier && (
            <> Upgrade naar <span className="font-bold capitalize">{TIER_PRICING[nextTier].label}</span> voor onbeperkt gebruik.</>
          )}
        </div>
      )}

      {nearCap && !overCap && nextTier && (
        <Link
          href="/pricing"
          className="flex items-center justify-between gap-2 p-3 rounded-lg bg-[var(--color-accent-gold)]/[0.08] border border-[var(--color-accent-gold)]/20 text-[12px] text-[var(--color-accent-gold)] hover:bg-[var(--color-accent-gold)]/[0.12] transition-colors no-underline"
        >
          <span>
            Je AI-gebruik is hoog — upgrade naar <span className="font-bold capitalize">{TIER_PRICING[nextTier].label}</span> voor 10× meer ruimte.
          </span>
          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
        </Link>
      )}

      {!nearCap && !overCap && (
        <div className="text-[11px] text-[var(--muted)]">
          {isUnlimited
            ? 'Fair-use beleid — geen harde limiet.'
            : `Nog ${cap - used} AI-acties beschikbaar tot eind van de maand.`}
        </div>
      )}
    </div>
  );
}
