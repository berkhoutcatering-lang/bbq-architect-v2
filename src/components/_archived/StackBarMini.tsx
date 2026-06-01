'use client';

import React from 'react';

export interface StackBarDatum {
  label: string;
  value: number;
}

interface StackBarMiniProps {
  data: StackBarDatum[];
  width?: number;
  height?: number;
  color?: string;
  highlightLast?: boolean;
}

/**
 * Compacte vertical-bar reeks (custom SVG, geen library).
 * Geen stacking — naam "stack" houdt aan voor mogelijke uitbreiding.
 * Toont X bars met optioneel uitgelichte laatste (huidige periode).
 * Returnt null als er <2 datapunten zijn of som = 0.
 */
export default function StackBarMini({
  data,
  width = 160,
  height = 56,
  color = 'var(--brand)',
  highlightLast = true,
}: StackBarMiniProps): React.ReactElement | null {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data.map((d) => d.value));
  if (max <= 0) return null;

  const gap = 6;
  const barW = (width - gap * (data.length - 1)) / data.length;
  const baseLineY = height - 1;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <line
        x1={0}
        y1={baseLineY}
        x2={width}
        y2={baseLineY}
        stroke="var(--border)"
        strokeWidth={1}
      />
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 6);
        const x = i * (barW + gap);
        const y = height - 1 - h;
        const isLast = i === data.length - 1;
        const fill = highlightLast && isLast ? color : 'color-mix(in srgb, var(--text) 22%, transparent)';
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={Math.max(2, h)}
            fill={fill}
            rx={2}
          />
        );
      })}
    </svg>
  );
}
