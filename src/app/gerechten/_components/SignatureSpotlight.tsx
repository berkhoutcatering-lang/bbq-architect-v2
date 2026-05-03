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
        background:
          'linear-gradient(135deg, rgba(255,191,0,.10) 0%, rgba(196,163,90,.06) 50%, rgba(0,0,0,.2) 100%)',
        border: '1px solid color-mix(in oklab, var(--brand) 28%, transparent)',
        overflow: 'hidden',
        marginBottom: 22,
        padding: '22px 26px',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 20,
        alignItems: 'center',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow:
          '0 1px 0 rgba(255,191,0,0.14) inset, 0 8px 24px rgba(0,0,0,.4), 0 0 60px rgba(255,191,0,.08)',
        transition: 'transform .15s, box-shadow .15s',
      }}
      className="signature-card"
    >
      {/* Smoke / grain overlay */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(45deg, rgba(0,0,0,.0) 0 6px, rgba(0,0,0,.05) 6px 7px)',
          pointerEvents: 'none',
          opacity: 0.4,
        }}
      />
      {/* Aura */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '-30%',
          right: '-10%',
          width: 260,
          height: 260,
          background:
            'radial-gradient(circle, rgba(255,191,0,.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

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
            color: 'var(--brand)',
            fontWeight: 700,
          }}
        >
          <Star size={12} fill="currentColor" />
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

      {/* Glyph illustration */}
      <div
        style={{
          position: 'relative',
          width: 180,
          height: 180,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        className="signature-glyph-wrap"
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle, rgba(255,191,0,.22) 0%, transparent 65%)',
          }}
        />
        <div
          style={{
            fontSize: 110,
            filter: 'drop-shadow(0 12px 32px rgba(255,191,0,.4))',
            transform: 'translateZ(0)',
            position: 'relative',
            transition: 'transform .3s cubic-bezier(.2,.8,.2,1)',
          }}
          className="signature-glyph"
        >
          {glyph}
        </div>
      </div>
      <style jsx>{`
        :global(.signature-card:hover) {
          transform: translateY(-2px);
          box-shadow: 0 1px 0 rgba(255, 191, 0, 0.2) inset, 0 14px 32px rgba(0, 0, 0, 0.5),
            0 0 80px rgba(255, 191, 0, 0.14);
        }
        :global(.signature-card:hover .signature-glyph) {
          transform: translateZ(0) scale(1.08) rotate(-3deg);
        }
        @media (max-width: 800px) {
          :global(.signature-card) {
            grid-template-columns: 1fr !important;
          }
          :global(.signature-glyph-wrap) {
            width: 100% !important;
            height: 140px !important;
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
