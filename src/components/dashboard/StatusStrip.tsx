'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

export interface StatusTile {
  key: string;
  /** Hoofdcijfer (bijvoorbeeld 6) */
  count: number | string;
  /** Korte beschrijving onder het cijfer (max 2 woorden) */
  label: string;
  /** Optioneel: kleinere subtekst rechts van cijfer */
  hint?: string;
  /** Waar de tegel heen linkt */
  href: string;
  /** Optioneel icoon links van het cijfer */
  icon?: ReactNode;
  /** Toon in zachte oranje als waarschuwing (niet rood — die is voor urgent) */
  attention?: boolean;
}

interface Props {
  tiles: StatusTile[];
}

/**
 * StatusStrip — smalle horizontale strook met kijk-info-tegels.
 * Géén CTA-vibe; alleen status. Klikbaar maar zonder pijl-knop.
 */
export default function StatusStrip({ tiles }: Props) {
  if (tiles.length === 0) return null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`,
        gap: 8,
        padding: 4,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--card)',
        border: '1px solid var(--border)',
      }}
      className="status-strip"
    >
      {tiles.map((t, idx) => (
        <Link
          key={t.key}
          href={t.href}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            textDecoration: 'none',
            color: 'var(--text)',
            background: 'transparent',
            borderRight: idx < tiles.length - 1 ? '1px solid var(--border)' : 'none',
            minWidth: 0,
            transition: 'background 120ms ease',
          }}
          className="status-strip__tile"
        >
          {t.icon && (
            <span
              style={{
                color: t.attention ? 'var(--brand)' : 'var(--muted)',
                flexShrink: 0,
                display: 'inline-flex',
              }}
            >
              {t.icon}
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, flex: 1 }}>
            <span
              style={{
                fontSize: 20,
                fontWeight: 800,
                lineHeight: 1,
                color: t.attention ? 'var(--brand)' : 'var(--text)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {t.count}
            </span>
            <span
              style={{
                fontSize: 12,
                color: 'var(--muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {t.label}
            </span>
          </div>
          {t.hint && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--muted)',
                whiteSpace: 'nowrap',
                marginLeft: 'auto',
                flexShrink: 0,
              }}
            >
              {t.hint}
            </span>
          )}
        </Link>
      ))}
      <style>{`
        .status-strip__tile:hover { background: var(--brand-tint-subtle); }
        @media (max-width: 720px) {
          .status-strip { grid-template-columns: repeat(2, 1fr) !important; }
          .status-strip__tile { border-right: none !important; }
        }
      `}</style>
    </div>
  );
}
