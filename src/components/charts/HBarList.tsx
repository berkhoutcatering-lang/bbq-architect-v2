'use client';

import React from 'react';

export interface HBarRow {
  label: string;
  value: number;
  detail?: string;
  color?: string;
}

interface HBarListProps {
  rows: HBarRow[];
  valueFormatter?: (v: number) => string;
  defaultColor?: string;
  emptyState?: React.ReactNode;
}

/**
 * Horizontale bars in lijst-vorm. Per row: label + value (rechts), bar onder,
 * optionele detail-sublabel. Bar-breedte = value / max van rows. Gebruik voor
 * leveranciers-uitgaven, gerechten-marges, etc.
 */
export default function HBarList({
  rows,
  valueFormatter = (v) => String(v),
  defaultColor = 'var(--brand-gold)',
  emptyState,
}: HBarListProps): React.ReactElement | null {
  if (!rows || rows.length === 0) {
    if (emptyState) return <>{emptyState}</>;
    return null;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r, i) => {
        const w = (r.value / max) * 100;
        const color = r.color || defaultColor;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 11,
              }}
            >
              <span
                style={{
                  color: 'var(--text)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                }}
              >
                {r.label}
              </span>
              <span
                style={{
                  color: 'var(--text)',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {valueFormatter(r.value)}
              </span>
            </div>
            <div
              style={{
                height: 6,
                background: 'rgba(255,255,255,.04)',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${w}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${color}aa, ${color})`,
                  borderRadius: 3,
                  transition: 'width .3s',
                }}
              />
            </div>
            {r.detail ? (
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--muted-light)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {r.detail}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
