/**
 * LiveCostHeader — Pillar #1 (Live Recipe Cost)
 *
 * Server Component. Toont kostprijs nu, delta vs 7 dagen, last-change tijd
 * en een 30-dagen sparkline. Data via RPC get_latest_gerecht_cost_delta.
 *
 * Gerendered als header op /gerechten/[id]. Map elk veld 1-op-1 op de RPC
 * resultaat zodat een nieuwe snapshot direct doortikt.
 */

import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase-server';
import PriceTrendSparkline, { type SparkPoint } from './PriceTrendSparkline';

interface Props {
    gerechtId: string;
    organizationId: string;
    fallbackKostprijsCents: number;
    porties: number;
    verkoopprijs: number;
}

interface CostDelta {
    kost_now_cents: number | null;
    kost_7d_cents: number | null;
    delta_7d_pct: number | null;
    last_change_at: string | null;
    sparkline_30d: SparkPoint[] | null;
}

export default async function LiveCostHeader({
    gerechtId,
    organizationId,
    fallbackKostprijsCents,
    porties,
    verkoopprijs,
}: Props) {
    const sb = await createServerSupabase();
    const { data, error } = await sb.rpc('get_latest_gerecht_cost_delta', {
        p_org_id: organizationId,
        p_gerecht_id: gerechtId,
    });

    const row: CostDelta = Array.isArray(data) && data[0]
        ? (data[0] as CostDelta)
        : { kost_now_cents: null, kost_7d_cents: null, delta_7d_pct: null, last_change_at: null, sparkline_30d: [] };

    // Fallback naar gerechten.total_cost_cents als nog geen snapshot bestaat
    const kostprijsCents = row.kost_now_cents ?? fallbackKostprijsCents;
    const kostPerPortie = porties > 0 ? kostprijsCents / porties / 100 : kostprijsCents / 100;
    const margePct =
        verkoopprijs > 0
            ? Math.round(((verkoopprijs - kostPerPortie) / verkoopprijs) * 100)
            : null;

    const delta = row.delta_7d_pct;
    const deltaColor =
        delta === null || Math.abs(delta) < 1
            ? 'var(--color-text-muted, #94a3b8)'
            : delta > 0
            ? '#dc2626' // rood — kostprijs gestegen, slecht voor marge
            : '#16a34a'; // groen — kostprijs gedaald
    const DeltaIcon =
        delta === null || Math.abs(delta) < 1
            ? Minus
            : delta > 0
            ? ArrowUpRight
            : ArrowDownRight;

    const lastChangeLabel = row.last_change_at
        ? new Date(row.last_change_at).toLocaleString('nl-NL', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
          })
        : 'nog niet bijgewerkt';

    return (
        <section
            style={{
                background: 'var(--color-bg-secondary, #1f2937)',
                border: '1px solid var(--color-border, #374151)',
                borderRadius: 12,
                padding: 20,
                marginBottom: 24,
            }}
        >
            {error && (
                <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>
                    Live-cost data kon niet worden geladen ({error.message})
                </div>
            )}

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr)) 220px',
                    gap: 16,
                    alignItems: 'center',
                }}
            >
                {/* KPI 1 — Kostprijs nu */}
                <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-muted, #94a3b8)', letterSpacing: 0.5 }}>
                        Kostprijs
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>
                        € {(kostprijsCents / 100).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted, #94a3b8)', marginTop: 2 }}>
                        per {porties} porties
                    </div>
                </div>

                {/* KPI 2 — Per portie */}
                <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-muted, #94a3b8)', letterSpacing: 0.5 }}>
                        Per portie
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>
                        € {kostPerPortie.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>

                {/* KPI 3 — Delta 7d */}
                <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-muted, #94a3b8)', letterSpacing: 0.5 }}>
                        Δ 7 dagen
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: deltaColor, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <DeltaIcon size={18} />
                        {delta === null ? '–' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
                    </div>
                </div>

                {/* KPI 4 — Marge */}
                <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-muted, #94a3b8)', letterSpacing: 0.5 }}>
                        Marge
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: margePct !== null && margePct < 25 ? '#dc2626' : 'inherit' }}>
                        {margePct === null ? '–' : `${margePct}%`}
                    </div>
                </div>

                {/* Sparkline */}
                <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-muted, #94a3b8)', letterSpacing: 0.5, marginBottom: 4 }}>
                        30 dagen historie
                    </div>
                    <PriceTrendSparkline data={row.sparkline_30d ?? []} height={64} />
                </div>
            </div>

            <div
                style={{
                    marginTop: 12,
                    paddingTop: 12,
                    borderTop: '1px solid var(--color-border, #374151)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    color: 'var(--color-text-muted, #94a3b8)',
                }}
            >
                <RefreshCw size={12} />
                Laatste update: {lastChangeLabel}
                {row.kost_now_cents === null && (
                    <span style={{ marginLeft: 8, fontStyle: 'italic' }}>
                        (gebruikt opgeslagen kostprijs — eerste mutation triggert live tracking)
                    </span>
                )}
            </div>
        </section>
    );
}
