'use client';

import React from 'react';

interface ProgressRingProps {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
}

/**
 * Circulaire voortgangs-ring (custom SVG, geen library).
 * value: 0-100. Toont percentage in het midden tenzij `label` is gegeven.
 */
export default function ProgressRing({
  value,
  size = 96,
  stroke = 8,
  color = 'var(--brand)',
  trackColor = 'var(--border)',
  label,
  sublabel,
}: ProgressRingProps): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - clamped / 100);

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: 1,
        }}
      >
        <div style={{ fontSize: size > 70 ? 22 : 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
          {label ?? `${Math.round(clamped)}%`}
        </div>
        {sublabel ? (
          <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.04em' }}>{sublabel}</div>
        ) : null}
      </div>
    </div>
  );
}
