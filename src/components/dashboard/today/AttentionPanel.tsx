'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle, MailWarning, Clock, Percent, Thermometer, ChevronRight, ArrowRight, BellRing,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  'alert-triangle': AlertTriangle,
  'mail-warning': MailWarning,
  clock: Clock,
  percent: Percent,
  thermometer: Thermometer,
};

export type AttentionSeverity = 'high' | 'medium' | 'low';

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  icon: string;
  title: string;
  detail: string;
  cta: string;
  href: string;
}

const SEV: Record<AttentionSeverity, { bg: string; border: string; dot: string; label: string }> = {
  high: { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.3)', dot: 'var(--red)', label: 'Hoog' },
  medium: { bg: 'rgba(217, 119, 6, 0.08)', border: 'rgba(217, 119, 6, 0.3)', dot: '#f59e0b', label: 'Gemiddeld' },
  low: { bg: 'rgba(255,255,255,.03)', border: 'var(--border)', dot: '#94a3b8', label: 'Laag' },
};

interface Props {
  items: AttentionItem[];
}

export default function AttentionPanel({ items }: Props): React.ReactElement | null {
  if (items.length === 0) return null;
  const high = items.filter((i) => i.severity === 'high').length;

  return (
    <div
      className="smoke-card"
      style={{
        padding: '20px 22px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              fontWeight: 700,
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <BellRing size={11} color="var(--red)" />
            AANDACHT NODIG
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400 }}>
            {items.length} {items.length === 1 ? 'alert' : 'alerts'}
          </div>
        </div>
        {high > 0 ? (
          <span
            style={{
              fontSize: 11,
              color: 'var(--red)',
              background: 'rgba(239,68,68,.1)',
              border: '1px solid rgba(239,68,68,.25)',
              padding: '3px 9px',
              borderRadius: 999,
              fontWeight: 600,
            }}
          >
            {high} hoog
          </span>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {items.map((it) => {
          const sev = SEV[it.severity];
          const Icon = ICON_MAP[it.icon] || AlertTriangle;
          return (
            <Link key={it.id} href={it.href} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div
                style={{
                  background: sev.bg,
                  border: `1px solid ${sev.border}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  transition: 'transform .15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateX(2px)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = '')}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'rgba(0,0,0,.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: sev.dot,
                  }}
                >
                  <Icon size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginBottom: 3,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--text)',
                        lineHeight: 1.3,
                        flex: 1,
                        minWidth: 0,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {it.title}
                    </div>
                    <ChevronRight size={12} color="var(--muted)" />
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--muted)',
                      lineHeight: 1.4,
                      marginBottom: 6,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {it.detail}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: sev.dot,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {it.cta} <ArrowRight size={10} />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
