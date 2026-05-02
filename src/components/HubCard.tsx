'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface HubCardStat {
  label: string;
  value: string | number;
  accent?: 'default' | 'success' | 'warning' | 'danger';
}

export interface HubCardProps {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  cta: string;
  stats?: HubCardStat[];
  recent?: string;
  loading?: boolean;
}

const accentColor: Record<NonNullable<HubCardStat['accent']>, string> = {
  default: 'var(--text)',
  success: 'var(--green, #22c55e)',
  warning: 'var(--amber, #f59e0b)',
  danger: 'var(--red, #ef4444)',
};

/**
 * HubCard — gebruikt op /factuur-lezer, /administratie en /systeem (komende ronde).
 * Toont icon + titel + uitleg PLUS optioneel een rij live KPIs + recent-label,
 * zodat een hub-bezoek direct context geeft ("wat staat er nu in deze module?").
 */
export default function HubCard({ href, icon: Icon, title, desc, cta, stats, recent, loading }: HubCardProps) {
  return (
    <Link
      href={href}
      className="hub-card-v2"
      aria-label={`${title} — ${cta}`}
      className="smoke-card smoke-card-interactive"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 20,
        borderRadius: 'var(--radius-lg)',
        textDecoration: 'none',
        color: 'var(--text)',
        minHeight: 200,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-md)',
            background: 'var(--brand-tint)',
            color: 'var(--brand)',
            flexShrink: 0,
          }}
        >
          <Icon size={20} />
        </div>
        {recent ? (
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--muted-light)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              textAlign: 'right',
              maxWidth: 140,
            }}
          >
            {recent}
          </div>
        ) : null}
      </div>

      <div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>{desc}</div>
      </div>

      {stats && stats.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(stats.length, 3)}, 1fr)`,
            gap: 12,
            padding: '12px 0',
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {stats.map((s, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: accentColor[s.accent ?? 'default'],
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {loading ? <span style={{ color: 'var(--muted-light)' }}>–</span> : s.value}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--brand)',
          marginTop: 'auto',
        }}
      >
        {cta}
        <ArrowRight size={14} className="hub-card-arrow" />
      </div>

      <style jsx>{`
        .hub-card-v2:hover {
          border-color: var(--brand) !important;
          background: color-mix(in srgb, var(--brand) 4%, var(--card)) !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
        }
        .hub-card-v2:hover :global(.hub-card-arrow) {
          transform: translateX(4px);
        }
        .hub-card-v2:active {
          transform: translateY(0);
        }
        .hub-card-v2:focus-visible {
          outline: 2px solid var(--brand);
          outline-offset: 2px;
        }
        :global(.hub-card-arrow) {
          transition: transform 150ms ease;
        }
      `}</style>
    </Link>
  );
}
