'use client';

import React from 'react';
import Link from 'next/link';
import StackBarMini from '@/components/charts/StackBarMini';
import DonutMini from '@/components/charts/DonutMini';
import StackBarHorizontal from '@/components/charts/StackBarHorizontal';
import FunnelBars from '@/components/charts/FunnelBars';
import type { FunnelStage } from '@/components/charts/FunnelBars';

export interface PulsData {
  revenue: {
    monthTotal: number;
    weeks: { label: string; value: number }[];
    monthLabel: string;
  };
  margin: {
    healthy: number;
    tight: number;
    loss: number;
    avgPct: number;
  };
  invoices: {
    onTime: number;
    soon: number;
    overdue: number;
    totalOpen: number;
  };
  pipeline: FunnelStage[];
}

interface Props {
  data: PulsData;
}

/**
 * Zone 2 — de cockpit-strip. Eén dichte rij van 4 visuele tegels op
 * dieper bg. Geen rasterlijnen tussen tegels (zone B uit plan).
 */
export default function ZonePuls({ data }: Props) {
  const fmtEuro = (n: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

  const totalMargin = data.margin.healthy + data.margin.tight + data.margin.loss;

  return (
    <div
      style={{
        background: 'var(--color-bg-deep)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-8)',
        border: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 32,
        }}
      >
        {/* OMZET */}
        <PulsTile
          label={`Omzet · ${data.revenue.monthLabel}`}
          value={fmtEuro(data.revenue.monthTotal)}
          href="/financien"
        >
          <StackBarMini
            data={data.revenue.weeks}
            width={170}
            height={48}
            color="var(--brand)"
          />
          <div
            style={{
              fontSize: 10,
              color: 'var(--muted)',
              marginTop: 6,
              letterSpacing: '.04em',
            }}
          >
            laatste 4 weken
          </div>
        </PulsTile>

        {/* MARGE */}
        <PulsTile
          label="Marge · gemiddeld"
          value={`${data.margin.avgPct.toFixed(0)}%`}
          href="/marges"
        >
          {totalMargin > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <DonutMini
                size={68}
                data={[
                  { label: 'Gezond', value: data.margin.healthy, color: 'var(--green)' },
                  { label: 'Krap', value: data.margin.tight, color: 'var(--amber)' },
                  { label: 'Verlies', value: data.margin.loss, color: 'var(--red)' },
                ]}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10 }}>
                <Legend color="var(--green)" label="Gezond" count={data.margin.healthy} />
                <Legend color="var(--amber)" label="Krap" count={data.margin.tight} />
                <Legend color="var(--red)" label="Verlies" count={data.margin.loss} />
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>nog geen offertes</span>
          )}
        </PulsTile>

        {/* OPEN FACTUREN */}
        <PulsTile
          label="Open facturen"
          value={fmtEuro(data.invoices.totalOpen)}
          valueColor={data.invoices.overdue > 0 ? 'var(--red)' : 'var(--text)'}
          href="/facturen"
        >
          {data.invoices.totalOpen > 0 ? (
            <>
              <StackBarHorizontal
                segments={[
                  { label: 'Op tijd', value: data.invoices.onTime, color: 'var(--green)' },
                  { label: 'Binnenkort', value: data.invoices.soon, color: 'var(--amber)' },
                  { label: 'Vervallen', value: data.invoices.overdue, color: 'var(--red)' },
                ]}
                height={10}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  marginTop: 6,
                  color: 'var(--muted)',
                  letterSpacing: '.04em',
                }}
              >
                <span>{data.invoices.onTime} op tijd</span>
                <span style={{ color: data.invoices.overdue > 0 ? 'var(--red)' : 'var(--muted)' }}>
                  {data.invoices.overdue} vervallen
                </span>
              </div>
            </>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>alles betaald — netjes</span>
          )}
        </PulsTile>

        {/* PIPELINE */}
        <PulsTile
          label="In de pipeline"
          value={`${data.pipeline.reduce((s, p) => s + p.count, 0)}`}
          valueSuffix="offertes"
          href="/offertes"
        >
          <FunnelBars stages={data.pipeline} />
        </PulsTile>
      </div>
    </div>
  );
}

function PulsTile({
  label,
  value,
  valueColor,
  valueSuffix,
  href,
  children,
}: {
  label: string;
  value: string;
  valueColor?: string;
  valueSuffix?: string;
  href?: string;
  children: React.ReactNode;
}) {
  const inner = (
    <div
      className={href ? 'puls-tile-clickable' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        cursor: href ? 'pointer' : 'default',
        padding: 4,
        margin: -4,
        borderRadius: 'var(--radius-md)',
        transition: 'background .15s, transform .15s',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.14em',
            color: 'var(--muted)',
          }}
        >
          {label}
        </div>
        {href ? (
          <span
            aria-hidden="true"
            style={{
              fontSize: 10,
              color: 'var(--muted)',
              opacity: 0.6,
              letterSpacing: '.05em',
            }}
            className="puls-tile-arrow"
          >
            →
          </span>
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
        }}
      >
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: valueColor || 'var(--text)',
            lineHeight: 1,
            letterSpacing: '-.01em',
            fontFamily: 'var(--font-artisan)',
          }}
        >
          {value}
        </div>
        {valueSuffix ? (
          <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.04em' }}>
            {valueSuffix}
          </span>
        ) : null}
      </div>
      <div style={{ flex: 1, minHeight: 56 }}>{children}</div>
      <style>{`
        .puls-tile-clickable:hover { background: rgba(255,255,255,.03); }
        .puls-tile-clickable:hover .puls-tile-arrow { opacity: 1; color: var(--brand); }
      `}</style>
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
        {inner}
      </Link>
    );
  }
  return inner;
}

function Legend({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 2,
          background: color,
          display: 'inline-block',
        }}
      />
      {label} · {count}
    </span>
  );
}
