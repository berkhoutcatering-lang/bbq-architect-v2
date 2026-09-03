'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import DonutMini from '@/components/charts/DonutMini';
import BarChartVertical from '@/components/charts/BarChartVertical';
import HBarList from '@/components/charts/HBarList';
import type { RevenueMixSlice } from '@/lib/today/revenue-mix';
import type { RevenueMonthBucket } from '@/lib/today/revenue-buckets';
import type { SupplierSpendRow } from '@/lib/today/supplier-spend';
import { formatEurInt, formatPercent } from '@/lib/format';

interface Props {
  revenueMix: RevenueMixSlice[];
  monthBuckets: RevenueMonthBucket[];
  suppliers: SupplierSpendRow[];
  monthLabel: string;
  updatedAt?: string;
  onOpenFinancien?: () => void;
}

/* Geld-canon is src/lib/format.ts. De lokale variant hier rondde niet af,
 * waardoor een maandtotaal van 3567.3 als "€ 3.567,3" op het dashboard stond. */
const formatEuro = formatEurInt;

function formatEuroShort(v: number): string {
  if (v >= 1000) return `€ ${(v / 1000).toFixed(1)}k`;
  return formatEurInt(v);
}

export default function BusinessCharts({
  revenueMix,
  monthBuckets,
  suppliers,
  monthLabel,
  updatedAt,
  onOpenFinancien,
}: Props): React.ReactElement {
  const totalMix = revenueMix.reduce((s, d) => s + d.value, 0);
  const cur = monthBuckets[monthBuckets.length - 1]?.value || 0;
  const prev = monthBuckets[monthBuckets.length - 2]?.value || 0;
  const monthGrowth = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
  const updateLabel = updatedAt
    ? `Bijgewerkt ${new Date(updatedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
    : null;

  return (
    <div style={{ marginBottom: 18 }}>
      {updateLabel ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            fontSize: 10,
            color: 'var(--muted-light)',
            fontVariantNumeric: 'tabular-nums',
            marginBottom: 6,
            paddingRight: 4,
          }}
        >
          {updateLabel}
        </div>
      ) : null}
      <div
        className="business-charts-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 14,
        }}
      >
      {/* Donut */}
      <ChartCard
        title={`OMZET-MIX · ${monthLabel.toUpperCase()}`}
        subtitle="Waar komt het vandaan?"
        action={onOpenFinancien ? 'Detail' : undefined}
        onAction={onOpenFinancien}
      >
        {totalMix > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, marginTop: 4 }}>
            <DonutMini
              data={revenueMix.map((s) => ({ label: s.label, value: s.value, color: s.color }))}
              size={118}
              centerLabel={formatEuroShort(totalMix)}
              centerSublabel="totaal"
            />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {revenueMix.map((d) => {
                const pct = totalMix > 0 ? Math.round((d.value / totalMix) * 100) : 0;
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: d.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        color: 'var(--text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {d.label}
                    </span>
                    <span
                      style={{
                        color: 'var(--muted)',
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyChart
            label="Nog geen omzet deze maand"
            ctaLabel="Plan je eerste event"
            ctaHref="/agenda"
          />
        )}
      </ChartCard>

      {/* Bars: 6 months */}
      <ChartCard
        title="OMZET · LAATSTE 6 MND"
        subtitle={
          <span>
            <span
              style={{
                color: monthGrowth > 0 ? '#86efac' : 'var(--red)',
                fontWeight: 600,
              }}
            >
              {monthGrowth > 0 ? '▲' : '▼'} {formatPercent(Math.abs(monthGrowth), 0)}
            </span>{' '}
            vs vorige maand
          </span>
        }
        action={onOpenFinancien ? 'Detail' : undefined}
        onAction={onOpenFinancien}
      >
        {monthBuckets.some((b) => b.value > 0) ? (
          <>
            <BarChartVertical
              data={monthBuckets.map((b) => ({ label: b.m, value: b.value, current: b.current }))}
              height={110}
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginTop: 10,
                paddingTop: 10,
                borderTop: '1px solid var(--border)',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--muted)',
                  letterSpacing: '.15em',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                {monthLabel}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 18,
                  fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                  color: '#86efac',
                }}
              >
                {formatEuro(cur)}
              </span>
            </div>
          </>
        ) : (
          <EmptyChart label="Geen omzet-historie" ctaLabel="Maak event aan" ctaHref="/agenda" />
        )}
      </ChartCard>

      {/* Suppliers */}
      <ChartCard
        title="LEVERANCIERS · UITGAVEN"
        subtitle="Top 5 · laatste 90 dagen"
        action={onOpenFinancien ? 'Detail' : undefined}
        onAction={onOpenFinancien}
      >
        <HBarList
          rows={suppliers.map((s) => ({ label: s.label, value: s.spent, color: 'var(--brand-gold)' }))}
          valueFormatter={(v) => formatEuro(v)}
          emptyState={<EmptyChart label="Nog geen geboekte bonnen" ctaLabel="Scan je eerste bon" ctaHref="/financien" />}
        />
      </ChartCard>

        <style>{`
          @media (max-width: 1024px) {
            .business-charts-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </div>
  );
}


function ChartCard({
  title, subtitle, action, onAction, children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="smoke-card"
      style={{
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 200,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 14,
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              fontWeight: 700,
              color: 'var(--muted)',
              marginBottom: 3,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div style={{ fontSize: 11, color: 'var(--muted-light)' }}>{subtitle}</div>
          ) : null}
        </div>
        {action ? (
          <button
            onClick={onAction}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 7,
              padding: '4px 8px',
              fontSize: 10,
              color: 'var(--muted)',
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {action} <ArrowRight size={10} />
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function EmptyChart({
  label,
  ctaLabel,
  ctaHref,
}: {
  label: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        color: 'var(--muted-light)',
        fontSize: 12,
        padding: '20px 0',
        textAlign: 'center',
      }}
    >
      <span>{label}</span>
      {ctaLabel && ctaHref ? (
        <a
          href={ctaHref}
          style={{
            fontSize: 11,
            color: 'var(--brand)',
            fontWeight: 600,
            textDecoration: 'none',
            letterSpacing: '.04em',
          }}
        >
          {ctaLabel} →
        </a>
      ) : null}
    </div>
  );
}
