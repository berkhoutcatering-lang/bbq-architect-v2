'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
}

/**
 * Mini-zone-header voor de Today-pagina zones.
 * Subtiel, scanbaar — geen lijntje, geen background.
 */
export default function ZoneLabel({ children }: Props) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '.32em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        marginBottom: 16,
      }}
    >
      <span style={{ marginRight: 10, opacity: 0.5 }}>· · ·</span>
      {children}
    </div>
  );
}
