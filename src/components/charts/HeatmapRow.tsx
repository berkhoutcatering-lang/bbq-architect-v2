'use client';

import React from 'react';
import Link from 'next/link';

export interface HeatmapCell {
  label: string;
  value: number;
  level: 'ok' | 'warn' | 'danger' | 'empty';
  href?: string;
}

interface HeatmapRowProps {
  cells: HeatmapCell[];
  cellHeight?: number;
}

/**
 * Heatmap-rij voor categorieën (bv. voorraad-categorie × status-level).
 * Elke cel heeft een achtergrond op basis van level + label/aantal.
 */
export default function HeatmapRow({ cells, cellHeight = 56 }: HeatmapRowProps): React.ReactElement {
  function bgFor(level: HeatmapCell['level'], value: number): string {
    if (level === 'empty' || value === 0) return 'var(--card-solid)';
    if (level === 'danger') return 'rgba(239, 68, 68, .25)';
    if (level === 'warn') return 'rgba(245, 158, 11, .22)';
    return 'rgba(34, 197, 94, .18)';
  }
  function borderFor(level: HeatmapCell['level']): string {
    if (level === 'danger') return 'rgba(239, 68, 68, .55)';
    if (level === 'warn') return 'rgba(245, 158, 11, .45)';
    if (level === 'ok') return 'rgba(34, 197, 94, .35)';
    return 'var(--border)';
  }
  function textFor(level: HeatmapCell['level']): string {
    if (level === 'danger') return 'var(--red)';
    if (level === 'warn') return 'var(--amber)';
    if (level === 'ok') return 'var(--green)';
    return 'var(--muted)';
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
        gap: 6,
      }}
    >
      {cells.map((c, i) => {
        const cellInner = (
          <>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: textFor(c.level),
                lineHeight: 1,
              }}
            >
              {c.value}
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--muted)',
                textTransform: 'lowercase',
                letterSpacing: '.04em',
                textAlign: 'center',
              }}
            >
              {c.label}
            </div>
          </>
        );
        const cellStyle: React.CSSProperties = {
          height: cellHeight,
          borderRadius: 'var(--radius-md)',
          background: bgFor(c.level, c.value),
          border: `1px solid ${borderFor(c.level)}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          padding: 6,
          cursor: c.href ? 'pointer' : 'default',
          textDecoration: 'none',
          transition: 'transform .15s',
        };
        return c.href ? (
          <Link
            key={i}
            href={c.href}
            title={`${c.label}: ${c.value}`}
            style={cellStyle}
          >
            {cellInner}
          </Link>
        ) : (
          <div key={i} title={`${c.label}: ${c.value}`} style={cellStyle}>
            {cellInner}
          </div>
        );
      })}
    </div>
  );
}
