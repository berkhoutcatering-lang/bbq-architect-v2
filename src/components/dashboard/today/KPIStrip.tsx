'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LineChart, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import Sparkline from '@/components/Sparkline';

export interface KpiItem {
  id: string;
  label: string;
  value: string;
  sub: string;
  tone: 'ok' | 'warn' | 'bad' | 'default';
  trend: number[];
  href?: string;
}

interface Props {
  kpis: KpiItem[];
  /** ISO timestamp van de laatste data-refresh, gerenderd als "Bijgewerkt om HH:MM". */
  updatedAt?: string;
}

const TONE_COLOR: Record<KpiItem['tone'], string> = {
  ok: '#86efac',
  warn: '#fbbf24',
  bad: 'var(--red)',
  default: 'var(--brand-gold)',
};

const TONE_VALUE_COLOR: Record<KpiItem['tone'], string> = {
  ok: 'var(--text)',
  warn: '#fbbf24',
  bad: 'var(--red)',
  default: 'var(--text)',
};

export default function KPIStrip({ kpis, updatedAt }: Props): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();
  const updateLabel = updatedAt
    ? `Bijgewerkt om ${new Date(updatedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
    : null;

  return (
    <div
      className="smoke-card"
      style={{
        marginBottom: 18,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LineChart size={12} color="var(--muted)" />
          <span
            style={{
              fontSize: 10,
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              fontWeight: 700,
              color: 'var(--muted)',
            }}
          >
            CIJFERS · LAATSTE 7 DAGEN
          </span>
          {updateLabel ? (
            <span
              style={{
                fontSize: 10,
                color: 'var(--muted-light)',
                marginLeft: 8,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              · {updateLabel}
            </span>
          ) : null}
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 7,
            padding: '4px 9px',
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
          }}
        >
          {expanded ? 'Inklappen' : 'Detail'}
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {!expanded ? (
          <motion.div
            key="row"
            className="kpi-strip-row"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${kpis.length}, minmax(0, 1fr))`,
            }}
          >
            {kpis.map((k, i) => (
              <KpiTile key={k.id} kpi={k} firstChild={i === 0} compact />
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            className="kpi-strip-grid"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}
          >
            {kpis.map((k) => (
              <KpiTile key={k.id} kpi={k} firstChild={false} compact={false} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @media (max-width: 1024px) {
          .kpi-strip-row { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 600px) {
          .kpi-strip-row, .kpi-strip-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>
    </div>
  );
}

function KpiTile({ kpi, firstChild, compact }: { kpi: KpiItem; firstChild: boolean; compact: boolean }) {
  const color = TONE_COLOR[kpi.tone];
  const valueColor = TONE_VALUE_COLOR[kpi.tone];
  // Verberg sparkline als alle waarden gelijk zijn — een vlakke lijn liegt over
  // beweging die er niet is. Beter geen lijn dan een nep-trend.
  const hasRealTrend = kpi.trend.length >= 2 && kpi.trend.some((v) => v !== kpi.trend[0]);

  const tooltipText = `${kpi.label} · ${kpi.value}${kpi.sub ? ' · ' + kpi.sub : ''}${kpi.href ? ' — klik voor detail' : ''}`;

  const inner = (
    <div
      title={tooltipText}
      style={{
        display: compact ? 'flex' : 'grid',
        flexDirection: compact ? 'column' : undefined,
        alignItems: compact ? 'flex-start' : 'center',
        gridTemplateColumns: compact ? undefined : '1fr 100px',
        gap: compact ? 0 : 12,
        padding: compact ? '12px 14px' : '12px 14px',
        background: compact ? 'transparent' : 'rgba(255,255,255,.015)',
        border: compact ? 'none' : '1px solid var(--border)',
        borderLeft: compact && !firstChild ? '1px solid var(--border)' : compact ? 'none' : '1px solid var(--border)',
        borderRadius: compact ? 0 : 10,
        cursor: kpi.href ? 'pointer' : 'default',
        fontFamily: 'inherit',
        textAlign: 'left',
        color: 'var(--text)',
        transition: 'background .15s',
        minHeight: 44,
      }}
    >
      <div style={{ minWidth: 0, ...(compact ? { width: '100%' } : {}) }}>
        <div
          style={{
            fontSize: 9,
            letterSpacing: '.15em',
            textTransform: 'uppercase',
            fontWeight: 700,
            color: 'var(--muted)',
            marginBottom: 5,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
          }}
        >
          {kpi.label}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 5 }}>
          <span
            style={{
              fontSize: compact ? 16 : 18,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: valueColor,
              letterSpacing: '-.01em',
              whiteSpace: 'nowrap',
            }}
          >
            {kpi.value}
          </span>
        </div>
        {!compact ? (
          <div
            style={{
              fontSize: 10,
              color: 'var(--muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {kpi.sub}
          </div>
        ) : null}
        {compact && hasRealTrend ? (
          <Sparkline values={kpi.trend} color={color} fillColor={color} width={84} height={20} />
        ) : null}
      </div>
      {!compact && hasRealTrend ? (
        <Sparkline values={kpi.trend} color={color} fillColor={color} width={100} height={36} />
      ) : null}
    </div>
  );

  if (kpi.href) {
    return (
      <Link href={kpi.href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {inner}
      </Link>
    );
  }
  return inner;
}
