'use client';

import React from 'react';

export interface DotStreakDay {
  date: string;
  level: 'ok' | 'warn' | 'danger' | 'empty';
}

interface DotStreakProps {
  days: DotStreakDay[];
  size?: number;
}

/**
 * Day-by-day compliance streak (bv. HACCP per dag, laatste 7 dagen).
 * 'empty' = geen registratie die dag (grijze ring).
 */
export default function DotStreak({ days, size = 14 }: DotStreakProps): React.ReactElement {
  function colorFor(level: DotStreakDay['level']) {
    if (level === 'ok') return 'var(--green)';
    if (level === 'warn') return 'var(--amber)';
    if (level === 'danger') return 'var(--red)';
    return 'transparent';
  }
  function borderFor(level: DotStreakDay['level']) {
    if (level === 'empty') return 'var(--border-strong)';
    return 'transparent';
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {days.map((d, i) => (
        <span
          key={i}
          title={`${d.date}: ${d.level}`}
          style={{
            display: 'inline-block',
            width: size,
            height: size,
            borderRadius: '50%',
            background: colorFor(d.level),
            border: d.level === 'empty' ? `1.5px dashed ${borderFor(d.level)}` : 'none',
          }}
        />
      ))}
    </div>
  );
}
