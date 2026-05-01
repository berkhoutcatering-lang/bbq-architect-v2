'use client';

import React from 'react';

export interface TimelineEvent {
  id: string | number;
  date: string;
  label: string;
  guests?: number;
  status?: string;
  href?: string;
  color?: string;
}

interface HorizontalTimelineProps {
  events: TimelineEvent[];
  days?: number;
  height?: number;
  onEventClick?: (event: TimelineEvent) => void;
}

const NL_DAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

/**
 * Horizontale 14-dagen tijdlijn met events als dots.
 * X-as: vandaag → vandaag+N. Events buiten range worden weggelaten.
 * Empty events: toont alleen de as-lijn met dag-labels.
 */
export default function HorizontalTimeline({
  events,
  days = 14,
  height = 110,
  onEventClick,
}: HorizontalTimelineProps): React.ReactElement {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayMs = 1000 * 60 * 60 * 24;
  const padX = 18;
  const padY = 18;
  const widthPct = 100;

  const dayPositions: { idx: number; date: Date; isWeekend: boolean }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today.getTime() + i * dayMs);
    dayPositions.push({ idx: i, date: d, isWeekend: d.getDay() === 0 || d.getDay() === 6 });
  }

  function xForDate(iso: string): number | null {
    const d = new Date(iso);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / dayMs);
    if (diff < 0 || diff >= days) return null;
    return (diff / (days - 1)) * (widthPct - (padX * 2 / 4)) + (padX / 4);
  }

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ overflow: 'visible' }}
        >
          {/* baseline */}
          <line
            x1={0}
            y1={height / 2}
            x2={100}
            y2={height / 2}
            stroke="var(--border)"
            strokeWidth={0.4}
            vectorEffect="non-scaling-stroke"
          />
          {/* dag-tickjes */}
          {dayPositions.map((dp, i) => {
            const x = (dp.idx / (days - 1)) * 100;
            return (
              <line
                key={i}
                x1={x}
                y1={height / 2 - 2}
                x2={x}
                y2={height / 2 + 2}
                stroke={dp.isWeekend ? 'var(--brand-tint-strong)' : 'var(--border-strong)'}
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
      </div>

      {/* event dots */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {events.map((e) => {
          const xPct = xForDate(e.date);
          if (xPct === null) return null;
          const dotColor = e.color || 'var(--brand)';
          const dotSize = e.guests && e.guests >= 80 ? 14 : e.guests && e.guests >= 40 ? 11 : 9;
          return (
            <button
              key={e.id}
              onClick={() => onEventClick?.(e)}
              style={{
                position: 'absolute',
                left: `${xPct}%`,
                top: height / 2,
                transform: 'translate(-50%, -50%)',
                width: dotSize,
                height: dotSize,
                borderRadius: '50%',
                background: dotColor,
                border: '2px solid var(--bg)',
                cursor: onEventClick ? 'pointer' : 'default',
                padding: 0,
                boxShadow: `0 0 0 1px ${dotColor}, 0 2px 6px rgba(0,0,0,.4)`,
              }}
              title={`${e.label}${e.guests ? ` · ${e.guests}p` : ''}`}
              aria-label={`${e.label} op ${e.date}`}
            />
          );
        })}
      </div>

      {/* dag-labels */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: 'var(--muted)',
          letterSpacing: '.04em',
        }}
      >
        {dayPositions.map((dp, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              textAlign: 'center',
              color: dp.idx === 0 ? 'var(--brand)' : dp.isWeekend ? 'var(--text)' : 'var(--muted)',
              fontWeight: dp.idx === 0 ? 700 : 400,
            }}
          >
            {dp.idx === 0 ? 'nu' : `${dp.date.getDate()}${i % 2 === 0 ? '' : ''}`}
          </span>
        ))}
      </div>

      {/* dag-naam onder het eerste */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 9,
          color: 'var(--muted)',
          letterSpacing: '.06em',
          textTransform: 'lowercase',
        }}
      >
        {dayPositions.map((dp, i) => (
          <span key={i} style={{ flex: 1, textAlign: 'center', opacity: i % 2 === 0 ? 1 : 0.5 }}>
            {NL_DAYS[dp.date.getDay()]}
          </span>
        ))}
      </div>
    </div>
  );
}
