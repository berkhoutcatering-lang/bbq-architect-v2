'use client';

import React from 'react';
import Link from 'next/link';

export interface VerticalTimelineItem {
  id: string | number;
  text: string;
  time: string;
  dot?: string;
  href?: string;
}

interface VerticalTimelineProps {
  items: VerticalTimelineItem[];
  emptyText?: string;
}

/**
 * Verticale tijdlijn-feed. Tijd-labels links, items rechts, een dunne lijn ertussen.
 * Geen SVG nodig — pure JSX en CSS.
 */
export default function VerticalTimeline({
  items,
  emptyText = 'Stil hier.',
}: VerticalTimelineProps): React.ReactElement {
  if (items.length === 0) {
    return (
      <div style={{ padding: '24px 8px', color: 'var(--muted)', fontSize: 13 }}>{emptyText}</div>
    );
  }

  return (
    <div style={{ position: 'relative', paddingLeft: 84 }}>
      {/* verticale lijn */}
      <div
        style={{
          position: 'absolute',
          left: 76,
          top: 8,
          bottom: 8,
          width: 1,
          background: 'var(--border)',
        }}
        aria-hidden="true"
      />
      {items.map((it, i) => {
        const rowStyle: React.CSSProperties = {
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          paddingTop: i === 0 ? 0 : 14,
          paddingBottom: 4,
          textDecoration: 'none',
          color: 'inherit',
          cursor: it.href ? 'pointer' : 'default',
        };
        const inner = (
          <>
            <div
              style={{
                position: 'absolute',
                left: -84,
                top: i === 0 ? 0 : 14,
                width: 64,
                fontSize: 10,
                color: 'var(--muted)',
                letterSpacing: '.04em',
                textAlign: 'right',
              }}
            >
              {it.time}
            </div>
            <span
              style={{
                position: 'absolute',
                left: -12,
                top: i === 0 ? 5 : 19,
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: it.dot || 'var(--brand)',
                border: '2px solid var(--bg)',
                boxShadow: `0 0 0 1px ${it.dot || 'var(--brand)'}`,
              }}
              aria-hidden="true"
            />
            <div
              style={{
                fontSize: 13,
                color: 'var(--text)',
                flex: 1,
                lineHeight: 1.45,
              }}
            >
              {it.text}
            </div>
          </>
        );
        return it.href ? (
          <Link key={it.id} href={it.href} style={rowStyle}>
            {inner}
          </Link>
        ) : (
          <div key={it.id} style={rowStyle}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
