'use client';

import React from 'react';

export interface FunnelStage {
  label: string;
  count: number;
  amount?: number;
}

interface FunnelBarsProps {
  stages: FunnelStage[];
  color?: string;
  showAmount?: boolean;
}

/**
 * Trechter-balken: per stage een horizontale balk met breedte op basis
 * van count, ten opzichte van eerste stage. Geen library.
 * Returnt null als alle stages count=0 hebben.
 */
export default function FunnelBars({
  stages,
  color = 'var(--brand)',
  showAmount = false,
}: FunnelBarsProps): React.ReactElement | null {
  const max = Math.max(...stages.map((s) => s.count));
  if (max <= 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {stages.map((s, i) => {
        const pct = max > 0 ? (s.count / max) * 100 : 0;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                fontSize: 11,
                color: 'var(--muted)',
                width: 76,
                flexShrink: 0,
                letterSpacing: '.02em',
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                flex: 1,
                height: 16,
                background: 'var(--border)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: `color-mix(in srgb, ${color} ${30 + (i * 0)}%, var(--card-solid))`,
                  transition: 'width 400ms ease',
                }}
              />
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text)',
                minWidth: 28,
                textAlign: 'right',
              }}
            >
              {s.count}
            </div>
            {showAmount && typeof s.amount === 'number' ? (
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--muted)',
                  minWidth: 60,
                  textAlign: 'right',
                }}
              >
                €{Math.round(s.amount / 1000) > 0 ? `${(s.amount / 1000).toFixed(1)}k` : s.amount.toFixed(0)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
