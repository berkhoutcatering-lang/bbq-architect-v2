'use client';

import Link from 'next/link';
import { Sparkles, ArrowUpRight } from 'lucide-react';
import { useTilt } from './wow-hooks';

interface Props {
  name: string;
  tagline?: string;
  glyph?: string;
  category?: string;
  cuisine?: string;
  bewaardOp?: string; // ISO date string
  kostprijsPp?: number;
  margePct?: number;
  href?: string;
}

export default function LatestConceptSpotlight({
  name,
  tagline,
  glyph = '✨',
  category,
  cuisine,
  bewaardOp,
  kostprijsPp,
  margePct,
  href,
}: Props) {
  const tiltRef = useTilt();
  const inner = (
    <div
      ref={tiltRef}
      style={{
        transformStyle: 'preserve-3d',
        position: 'relative',
        borderRadius: 16,
        background:
          'linear-gradient(135deg, rgba(167,139,250,.12) 0%, rgba(255,191,0,.06) 50%, rgba(0,0,0,.2) 100%)',
        border: '1px solid color-mix(in oklab, #a78bfa 28%, transparent)',
        overflow: 'hidden',
        marginBottom: 22,
        padding: '22px 26px',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 20,
        alignItems: 'center',
        cursor: href ? 'pointer' : 'default',
        textDecoration: 'none',
        color: 'var(--text)',
        boxShadow:
          '0 1px 0 rgba(167,139,250,0.18) inset, 0 8px 24px rgba(0,0,0,.4), 0 0 60px rgba(167,139,250,.08)',
        transition: 'transform .15s, box-shadow .15s',
      }}
      className="latest-concept-card"
    >
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
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '-30%',
          right: '-10%',
          width: 260,
          height: 260,
          background: 'radial-gradient(circle, rgba(167,139,250,.20) 0%, transparent 70%)',
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
            color: '#c4b5fd',
            fontWeight: 700,
          }}
        >
          <Sparkles size={12} fill="currentColor" />
          <span>Recent toegevoegd · uit jouw bibliotheek</span>
        </div>
        <h2
          style={{
            margin: 0,
            fontWeight: 400,
            fontSize: 30,
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
              maxWidth: 460,
            }}
          >
            {tagline}
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            display: 'flex',
            gap: 22,
            flexWrap: 'wrap',
            alignItems: 'baseline',
          }}
        >
          {category && (
            <Stat label="Categorie" value={cuisine ? `${category} · ${cuisine}` : category} />
          )}
          {kostprijsPp !== undefined && kostprijsPp > 0 && (
            <Stat label="Kostprijs" value={`€${kostprijsPp.toFixed(2)}`} sub="p.p." />
          )}
          {margePct !== undefined && margePct > 0 && (
            <Stat label="Marge" value={`${Math.round(margePct)}%`} tone="green" />
          )}
          {bewaardOp && <Stat label="Bewaard" value={fmtRelative(bewaardOp)} />}
        </div>

        {href && (
          <div
            style={{
              marginTop: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: '#c4b5fd',
              fontWeight: 600,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
            }}
          >
            Bekijk in /gerechten <ArrowUpRight size={12} />
          </div>
        )}
      </div>

      <div
        style={{
          position: 'relative',
          width: 160,
          height: 160,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        className="latest-concept-glyph-wrap"
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle, rgba(167,139,250,.24) 0%, transparent 65%)',
          }}
        />
        <div
          style={{
            fontSize: 110,
            filter: 'drop-shadow(0 12px 32px rgba(167,139,250,.5))',
            position: 'relative',
            transform: 'translateZ(40px)',
            transition: 'transform .3s cubic-bezier(.2,.8,.2,1)',
            animation: 'latest-glyph-float 5s ease-in-out infinite',
          }}
          className="latest-concept-glyph"
        >
          {glyph}
        </div>
      </div>
      <style jsx>{`
        @keyframes latest-glyph-float {
          0%,
          100% {
            transform: translateZ(40px) translateY(0) rotate(-2deg);
          }
          50% {
            transform: translateZ(50px) translateY(-8px) rotate(2deg);
          }
        }
        :global(.latest-concept-card:hover .latest-concept-glyph) {
          animation-play-state: paused;
          transform: translateZ(70px) scale(1.12) rotate(-4deg);
        }
        @media (max-width: 800px) {
          :global(.latest-concept-card) {
            grid-template-columns: 1fr !important;
          }
          :global(.latest-concept-glyph-wrap) {
            width: 100% !important;
            height: 120px !important;
          }
        }
      `}</style>
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none' }}>
        {inner}
      </Link>
    );
  }
  return inner;
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'green' | 'default';
}) {
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
          fontSize: 18,
          fontWeight: 500,
          color: tone === 'green' ? 'var(--green)' : 'var(--text)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
        {sub && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>{sub}</span>}
      </div>
    </div>
  );
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} uur geleden`;
  const d = Math.round(hr / 24);
  if (d < 7) return `${d} dag${d === 1 ? '' : 'en'} geleden`;
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const dt = new Date(iso);
  return `${dt.getDate()} ${months[dt.getMonth()]}`;
}
