'use client';

import React from 'react';

export interface BarDatum {
  label: string;
  value: number;
  current?: boolean;
}

interface BarChartVerticalProps {
  data: BarDatum[];
  height?: number;
  color?: string;
}

/**
 * Verticale bar-chart in puur SVG/CSS. Hoogste bar krijgt 100%, rest schaalt
 * lineair. Bar met `current: true` krijgt vol gradient + sterkere border;
 * andere bars zachtere fill. Gebruik voor "OMZET LAATSTE 6 MND" of vergelijkbare
 * 4-12 datapoints met één highlight.
 */
export default function BarChartVertical({
  data,
  height = 110,
  color = 'var(--brand-gold)',
}: BarChartVerticalProps): React.ReactElement | null {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 6,
        height,
        paddingTop: 4,
      }}
    >
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 18);
        return (
          <div
            key={i}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: '100%',
                height: Math.max(2, h),
                background: d.current
                  ? `linear-gradient(180deg, ${color}, ${color}aa)`
                  : `${color}55`,
                border: '1px solid ' + (d.current ? color : `${color}66`),
                borderRadius: '4px 4px 0 0',
                transition: 'height .3s',
              }}
              aria-label={`${d.label}: ${d.value}`}
            />
            <div
              style={{
                fontSize: 9,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: d.current ? 'var(--text)' : 'var(--muted)',
              }}
            >
              {d.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
