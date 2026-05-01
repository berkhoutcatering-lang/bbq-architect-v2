'use client';

import React from 'react';
import { PieChart, Pie, Cell } from 'recharts';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutMiniProps {
  data: DonutSlice[];
  size?: number;
  innerRatio?: number;
  centerLabel?: string;
  centerSublabel?: string;
}

/**
 * Compacte donut. Gebruik alleen voor share-of-total waarden (3-6 buckets).
 * Returnt null als alle waarden 0 zijn — laat de caller een empty-state tonen.
 */
export default function DonutMini({
  data,
  size = 96,
  innerRatio = 0.62,
  centerLabel,
  centerSublabel,
}: DonutMiniProps): React.ReactElement | null {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;

  const outer = size / 2;
  const inner = outer * innerRatio;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          dataKey="value"
          cx="50%"
          cy="50%"
          outerRadius={outer - 2}
          innerRadius={inner}
          stroke="none"
          isAnimationActive={false}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
      </PieChart>
      {centerLabel ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
            {centerLabel}
          </div>
          {centerSublabel ? (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, letterSpacing: '.04em' }}>
              {centerSublabel}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
