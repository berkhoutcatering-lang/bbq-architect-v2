'use client';

import { Trophy, ArrowUpRight } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface Props {
  naam: string;
  beschrijving?: string;
  glyph?: string;
  categorie?: string;
  margePct: number;
  kostprijsPp?: number;
  popularity?: number;
  href?: string;
}

/** Hook for 3D mouse-tilt op de card */
function useTilt() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    function update() {
      curX += (targetX - curX) * 0.12;
      curY += (targetY - curY) * 0.12;
      if (el) el.style.transform = `perspective(1200px) rotateX(${curY}deg) rotateY(${curX}deg)`;
      if (Math.abs(targetX - curX) > 0.01 || Math.abs(targetY - curY) > 0.01) {
        raf = requestAnimationFrame(update);
      }
    }
    function onMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      targetX = ((cx - rect.width / 2) / rect.width) * 6;
      targetY = -((cy - rect.height / 2) / rect.height) * 4;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    }
    function onLeave() {
      targetX = 0;
      targetY = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    }
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);
  return ref;
}

export default function WinnerSpotlight({
  naam,
  beschrijving,
  glyph = '🏆',
  categorie,
  margePct,
  kostprijsPp,
  popularity,
  href,
}: Props) {
  const tiltRef = useTilt();

  const inner = (
    <div
      ref={tiltRef}
      className="winner-spotlight-card"
      style={{
        transformStyle: 'preserve-3d',
        position: 'relative',
        borderRadius: 16,
        background:
          'linear-gradient(135deg, rgba(34,197,94,.14) 0%, rgba(255,191,0,.06) 50%, rgba(0,0,0,.2) 100%)',
        border: '1px solid color-mix(in oklab, #22c55e 30%, transparent)',
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
          '0 1px 0 rgba(34,197,94,0.18) inset, 0 8px 24px rgba(0,0,0,.4), 0 0 60px rgba(34,197,94,.08)',
        transition: 'transform .15s, box-shadow .15s',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(45deg, rgba(0,0,0,.0) 0 6px, rgba(0,0,0,.05) 6px 7px)',
          pointerEvents: 'none',
          opacity: 0.35,
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
          background: 'radial-gradient(circle, rgba(34,197,94,.22) 0%, transparent 70%)',
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
            color: '#86efac',
            fontWeight: 700,
          }}
        >
          <Trophy size={12} fill="currentColor" />
          <span>Top-marge gerecht · winner</span>
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
          {naam}
        </h2>
        {beschrijving && (
          <div
            style={{
              marginTop: 6,
              fontSize: 13.5,
              color: 'var(--muted)',
              fontStyle: 'italic',
              maxWidth: 460,
            }}
          >
            {beschrijving}
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
          {categorie && <Stat label="Categorie" value={categorie} />}
          <Stat label="Marge" value={`${Math.round(margePct)}%`} tone="green" />
          {kostprijsPp !== undefined && kostprijsPp > 0 && (
            <Stat label="Kostprijs" value={`€${kostprijsPp.toFixed(2)}`} sub="p.p." />
          )}
          {popularity !== undefined && popularity > 0 && (
            <Stat label="Populair" value={`${popularity}×`} sub="ingezet" />
          )}
        </div>

        {href && (
          <div
            style={{
              marginTop: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: '#86efac',
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
        className="winner-glyph-wrap"
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle, rgba(34,197,94,.26) 0%, transparent 65%)',
          }}
        />
        <div
          style={{
            fontSize: 110,
            filter: 'drop-shadow(0 12px 32px rgba(34,197,94,.5))',
            position: 'relative',
            transform: 'translateZ(40px)',
            transition: 'transform .3s cubic-bezier(.2,.8,.2,1)',
            animation: 'winner-glyph-float 5s ease-in-out infinite',
          }}
          className="winner-glyph"
        >
          {glyph}
        </div>
      </div>

      <style jsx>{`
        @keyframes winner-glyph-float {
          0%,
          100% {
            transform: translateZ(40px) translateY(0) rotate(-2deg);
          }
          50% {
            transform: translateZ(50px) translateY(-8px) rotate(2deg);
          }
        }
        :global(.winner-spotlight-card:hover .winner-glyph) {
          animation-play-state: paused;
          transform: translateZ(70px) scale(1.12) rotate(-4deg);
        }
        @media (max-width: 800px) {
          :global(.winner-spotlight-card) {
            grid-template-columns: 1fr !important;
          }
          :global(.winner-glyph-wrap) {
            width: 100% !important;
            height: 120px !important;
          }
        }
      `}</style>
    </div>
  );

  if (href) {
    return (
      <a href={href} style={{ textDecoration: 'none' }}>
        {inner}
      </a>
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
          color: tone === 'green' ? '#22c55e' : 'var(--text)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
        {sub && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>{sub}</span>}
      </div>
    </div>
  );
}
