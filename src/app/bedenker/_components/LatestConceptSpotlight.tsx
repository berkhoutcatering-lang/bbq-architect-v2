'use client';

import Link from 'next/link';
import { Sparkles, ArrowUpRight } from 'lucide-react';

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
  const inner = (
    <div
      className="latest-concept-card"
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
        cursor: href ? 'pointer' : 'default',
        textDecoration: 'none',
        color: 'var(--text)',
        transition: 'border-color .15s',
      }}
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
          <Sparkles size={12} color="#a78bfa" fill="currentColor" />
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
              color: 'var(--muted)',
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
          width: 120,
          height: 120,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        className="latest-concept-glyph-wrap"
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
          :global(.latest-concept-card) {
            grid-template-columns: 1fr !important;
          }
          :global(.latest-concept-glyph-wrap) {
            width: 100% !important;
            height: 100px !important;
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
