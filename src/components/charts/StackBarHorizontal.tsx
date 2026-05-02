'use client';

import React from 'react';

export interface StackSegment {
  label: string;
  value: number;
  color: string;
}

interface StackBarHorizontalProps {
  segments: StackSegment[];
  height?: number;
  showLabels?: boolean;
}

/**
 * Horizontale gestapelde balk in één lijn (custom SVG, geen library).
 * Gebruik voor 2-4 segmenten van een totaal (bv. open/binnenkort/vervallen).
 * Returnt null als som = 0.
 */
export default function StackBarHorizontal({
  segments,
  height = 12,
  showLabels = false,
}: StackBarHorizontalProps): React.ReactElement | null {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;

  let acc = 0;
  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height,
          background: 'var(--border)',
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        {segments.map((s, i) => {
          const pct = (s.value / total) * 100;
          acc += pct;
          if (s.value <= 0) return null;
          return (
            <div
              key={i}
              style={{
                width: `${pct}%`,
                height: '100%',
                background: s.color,
                transition: 'width 400ms ease',
              }}
              aria-label={`${s.label}: ${s.value}`}
            />
          );
        })}
      </div>
      {showLabels ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 6,
            fontSize: 10,
            color: 'var(--muted)',
            letterSpacing: '.04em',
          }}
        >
          {segments.map((s, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: s.color,
                  display: 'inline-block',
                }}
              />
              {s.label} · {s.value}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
