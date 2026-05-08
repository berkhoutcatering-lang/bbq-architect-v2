'use client';

import { Star } from 'lucide-react';

interface Props {
  name: string;
  tagline?: string;
  glyph?: string;
  verkoop?: number;
  margePct?: number;
  inMenus?: number;
  smokeUur?: string;
  onClick?: () => void;
}

export default function SignatureSpotlight({
  name,
  tagline,
  glyph = '🍢',
  verkoop,
  margePct,
  inMenus,
  smokeUur,
  onClick,
}: Props) {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        borderRadius: 16,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        marginBottom: 22,
        padding: '22px 26px',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 20,
        alignItems: 'center',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color .15s',
      }}
      className="signature-card"
    >
      <div style={{ position: 'relative', minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
            fontSize: 10,
            letterSpacing: '.22em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            fontWeight: 700,
          }}
        >
          <Star size={12} color="var(--brand)" fill="currentColor" />
          <span>Signature · meest gekozen</span>
        </div>
        <h2
          style={{
            margin: 0,
            fontWeight: 400,
            fontSize: 32,
            letterSpacing: '-.02em',
            lineHeight: 1.1,
            textWrap: 'balance',
          }}
        >
          {name}
        </h2>
        {tagline && (
          <div
            style={{
              marginTop: 6,
              fontSize: 13.5,
              color: 'var(--muted)',
              fontStyle: 'italic',
            }}
          >
            {tagline}
          </div>
        )}

        <div
          style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, auto)',
            gap: 24,
          }}
          className="signature-stats"
        >
          <Stat label="Verkoop" value={verkoop !== undefined ? `€${verkoop.toFixed(2)}` : '—'} />
          <Stat
            label="Marge"
            value={margePct !== undefined ? `${Math.round(margePct)}%` : '—'}
            tone={margePct && margePct >= 60 ? 'green' : 'default'}
          />
          <Stat label="In menu's" value={inMenus !== undefined ? `${inMenus}×` : '—'} />
          <Stat label="Smoke-tijd" value={smokeUur || '—'} />
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          width: 120,
          height: 120,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        className="signature-glyph-wrap"
      >
        <div
          style={{
            fontSize: 80,
            filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.35))',
          }}
        >
          {glyph}
        </div>
      </div>
      <style jsx>{`
        @media (max-width: 800px) {
          :global(.signature-card) {
            grid-template-columns: 1fr !important;
          }
          :global(.signature-glyph-wrap) {
            width: 100% !important;
            height: 100px !important;
          }
          :global(.signature-stats) {
            grid-template-columns: repeat(2, auto) !important;
          }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'default' }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          letterSpacing: '.2em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          fontWeight: 700,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 500,
          color: tone === 'green' ? 'var(--green)' : 'var(--text)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}
