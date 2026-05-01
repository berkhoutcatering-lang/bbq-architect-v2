'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';

export interface AlertItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  href?: string;
}

interface Props {
  alerts: AlertItem[];
}

/**
 * Eén compacte strip die alle conditionele banners samenvoegt.
 * Verschijnt alleen als er ≥1 alert is — anders rendert deze niets.
 */
export default function AlertStrip({ alerts }: Props): React.ReactElement | null {
  if (alerts.length === 0) return null;

  const top = alerts.slice(0, 3);
  const rest = alerts.length - top.length;

  function colorFor(s: AlertItem['severity']) {
    if (s === 'critical') return { bg: 'var(--status-danger-bg)', border: 'var(--status-danger-border)', text: 'var(--status-danger-text)' };
    if (s === 'warning') return { bg: 'var(--status-warning-bg)', border: 'var(--status-warning-border)', text: 'var(--status-warning-text)' };
    return { bg: 'var(--status-info-bg)', border: 'var(--status-info-border)', text: 'var(--status-info-text)' };
  }

  const worst = top.reduce<AlertItem['severity']>((acc, a) => {
    if (a.severity === 'critical') return 'critical';
    if (acc !== 'critical' && a.severity === 'warning') return 'warning';
    return acc;
  }, 'info');
  const c = colorFor(worst);

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '10px 18px',
        borderRadius: 'var(--radius-md)',
        background: c.bg,
        border: `1px solid ${c.border}`,
        fontSize: 13,
      }}
    >
      <AlertTriangle size={15} style={{ color: c.text, flexShrink: 0 }} />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px 14px',
          color: 'var(--text)',
        }}
      >
        {top.map((a, i) => (
          <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {i > 0 ? (
              <span style={{ color: 'var(--muted)', opacity: 0.5 }}>·</span>
            ) : null}
            {a.href ? (
              <Link
                href={a.href}
                style={{
                  color: 'var(--text)',
                  textDecoration: 'none',
                  borderBottom: '1px dashed var(--border-strong)',
                  paddingBottom: 1,
                }}
              >
                {a.message}
              </Link>
            ) : (
              <span>{a.message}</span>
            )}
          </span>
        ))}
        {rest > 0 ? (
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>+{rest} meer</span>
        ) : null}
      </div>
      {top[0]?.href ? (
        <Link
          href={top[0].href}
          className="btn btn-ghost btn-sm"
          style={{ flexShrink: 0, textDecoration: 'none' }}
        >
          Bekijk <ArrowRight size={12} />
        </Link>
      ) : null}
    </div>
  );
}
