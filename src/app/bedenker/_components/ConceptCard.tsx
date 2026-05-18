'use client';

import { useRef } from 'react';
import { Sparkles, BookmarkPlus, Check, Maximize2 } from 'lucide-react';
import type { Concept } from './types';
import { RISK_COLOR, RISK_LABEL } from './types';
import { useAnimatedNumber, useTilt, fireSparkles } from './wow-hooks';
import CitationsChip from '@/components/chips/CitationsChip';

interface Props {
  concept: Concept;
  onSave: (c: Concept) => void;
  onOpen: (c: Concept) => void;
  /** Index voor stagger-reveal animation (0,1,2,…) */
  revealIndex?: number;
}

export default function ConceptCard({ concept, onSave, onOpen, revealIndex = 0 }: Props) {
  const saving = concept.saveState === 'saving';
  const saved = concept.saveState === 'saved' || !!concept.saved;
  const tiltRef = useTilt();
  const saveBtnRef = useRef<HTMLButtonElement | null>(null);

  // Animated stat numbers
  const aniCost = useAnimatedNumber(concept.estCost, 700);
  const aniPrice = useAnimatedNumber(concept.estPrice, 700);
  const aniMargin = useAnimatedNumber(concept.margin * 100, 700);
  const aniConfidence = useAnimatedNumber(concept.confidence * 100, 800);

  function handleSave() {
    if (saveBtnRef.current) fireSparkles(saveBtnRef.current);
    onSave(concept);
  }

  return (
    <article
      ref={tiltRef}
      className="bedenker-card"
      style={{
        position: 'relative',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transformStyle: 'preserve-3d',
        animation: `bedenker-reveal .6s cubic-bezier(.2,.8,.2,1) both`,
        animationDelay: `${revealIndex * 120}ms`,
        transition: 'box-shadow .2s',
      }}
    >
      {/* Hero with glyph */}
      <div
        style={{
          position: 'relative',
          height: 140,
          background: concept.tone,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(0,0,0,.0) 0 8px, rgba(0,0,0,.08) 8px 9px)',
            mixBlendMode: 'multiply',
          }}
        />
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
          <ConceptStatusPill />
          <SourcePill />
        </div>
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            fontSize: 10,
            color: 'rgba(255,255,255,.85)',
            background: 'rgba(0,0,0,.4)',
            backdropFilter: 'blur(6px)',
            padding: '4px 8px',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            style={{ width: 6, height: 6, borderRadius: '50%', background: RISK_COLOR(concept.risk) }}
          />
          {RISK_LABEL(concept.risk)}
        </div>
        <div
          className="bedenker-glyph"
          style={{
            fontSize: 76,
            filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.4))',
            transform: 'translateZ(40px)',
            transition: 'transform .3s cubic-bezier(.2,.8,.2,1)',
          }}
        >
          {concept.glyph}
        </div>
      </div>

      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        {/* Title block */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 10,
                color: 'var(--brand-gold)',
                letterSpacing: '.18em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {concept.category}
            </span>
            <span style={{ fontSize: 10, color: 'var(--muted-light)' }}>·</span>
            <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.06em' }}>{concept.cuisine}</span>
          </div>
          <h3
            style={{
              margin: 0,
              fontWeight: 400,
              fontSize: 22,
              lineHeight: 1.15,
              letterSpacing: '-.01em',
              textWrap: 'balance',
            }}
          >
            {concept.name}
          </h3>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>{concept.tagline}</p>
        </div>

        {/* Stats grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 1,
            background: 'var(--border)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <Stat label="KOSTPRIJS" value={`€${aniCost.toFixed(2)}`} sub="per portie" />
          <Stat
            label="VERKOOP"
            value={concept.estPrice > 0 ? `€${aniPrice.toFixed(2)}` : '—'}
            sub={concept.margin > 0 ? `${aniMargin.toFixed(0)}% marge` : 'geen marge'}
            tone="brand"
          />
          <Stat
            label="PREP"
            value={concept.prepTime >= 60 ? `${(concept.prepTime / 60).toFixed(0)}u` : `${concept.prepTime}m`}
            sub={concept.serveTemp}
          />
        </div>

        {/* Diet/allergen badges */}
        {(concept.diet.length || concept.allergens.length) > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {concept.diet.map((d) => (
              <Badge key={d} tone="green">
                {d}
              </Badge>
            ))}
            {concept.allergens.map((a) => (
              <Badge key={a} tone="red">
                ⚠ {a}
              </Badge>
            ))}
          </div>
        )}

        {/* Confidence */}
        <div>
          <div style={{ marginBottom: 5 }}>
            <span
              style={{
                fontSize: 9,
                letterSpacing: '.22em',
                textTransform: 'uppercase',
                color: 'var(--muted-light)',
                fontWeight: 700,
              }}
            >
              AI Confidence
            </span>
          </div>
          <ConfidenceBar pct={aniConfidence / 100} />
        </div>

        {/* Pillar #1 (Provenance-first AI): Citations API source-attribution per claim */}
        {concept.citations && concept.citations.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 9,
                letterSpacing: '.22em',
                textTransform: 'uppercase',
                color: 'var(--muted-light)',
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              AI bron-attribution
            </div>
            <CitationsChip citations={concept.citations} />
          </div>
        )}

        {/* Inspired by */}
        {concept.inspiredBy.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 9,
                letterSpacing: '.22em',
                textTransform: 'uppercase',
                color: 'var(--muted-light)',
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              Inspired by jouw recepten
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {concept.inspiredBy.map((p, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 9px 4px 6px',
                    borderRadius: 999,
                    background: 'rgba(196,163,90,.08)',
                    border: '1px solid rgba(196,163,90,.22)',
                    fontSize: 11,
                    color: 'var(--text)',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{p.glyph || '🍴'}</span>
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 6 }}>
          <button
            ref={saveBtnRef}
            onClick={handleSave}
            disabled={saved || saving}
            className={saved ? 'btn btn-ghost' : 'btn btn-brand'}
            style={{
              flex: 1,
              justifyContent: 'center',
              cursor: saved || saving ? 'default' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {saving ? (
              <>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    border: '2px solid rgba(0,0,0,.25)',
                    borderTopColor: '#0a0a0c',
                    borderRadius: '50%',
                    animation: 'bedenker-spin .8s linear infinite',
                    display: 'inline-block',
                  }}
                />
                Opslaan…
              </>
            ) : saved ? (
              <>
                <Check size={14} /> Bewaard als concept
              </>
            ) : (
              <>
                <BookmarkPlus size={14} /> Bewaar als concept
              </>
            )}
          </button>
          <button
            onClick={() => onOpen(concept)}
            className="btn btn-ghost"
            title="Open detail"
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      <style jsx>{`
        :global(.bedenker-card) {
          will-change: transform;
        }
        :global(.bedenker-card:hover) {
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 191, 0, 0.18);
        }
        :global(.bedenker-card:hover .bedenker-glyph) {
          transform: translateZ(60px) scale(1.12) rotate(-3deg);
        }
        @keyframes bedenker-reveal {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.96);
            filter: blur(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }
        @keyframes bedenker-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </article>
  );
}

export function SkeletonCard() {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
        animation: 'bedenker-pulse 1.5s ease-in-out infinite',
      }}
    >
      <div
        style={{
          height: 140,
          background:
            'linear-gradient(110deg, rgba(255,255,255,.02) 30%, rgba(255,255,255,.06) 50%, rgba(255,255,255,.02) 70%)',
          backgroundSize: '200% 100%',
          animation: 'bedenker-shimmer 1.6s linear infinite',
        }}
      />
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Skel width="40%" height={14} />
        <Skel width="80%" height={22} />
        <Skel width="95%" height={12} />
        <Skel height={56} />
        <Skel height={40} />
      </div>
      <style jsx>{`
        @keyframes bedenker-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }
        @keyframes bedenker-shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </div>
  );
}

function Skel({ width, height }: { width?: string; height: number }) {
  return (
    <div
      style={{
        height,
        width: width || '100%',
        background: 'rgba(255,255,255,.04)',
        borderRadius: 4,
      }}
    />
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'brand' }) {
  return (
    <div style={{ background: 'var(--card-solid, var(--card))', padding: '10px 12px' }}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: '.18em',
          textTransform: 'uppercase',
          color: 'var(--muted-light)',
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: tone === 'brand' ? 'var(--brand)' : 'var(--text)',
          fontVariantNumeric: 'tabular-nums',
          marginTop: 3,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function Badge({ tone, children }: { tone: 'green' | 'red'; children: React.ReactNode }) {
  const cfg =
    tone === 'green'
      ? { bg: 'rgba(34,197,94,.10)', fg: '#86efac', border: 'rgba(34,197,94,.25)' }
      : { bg: 'rgba(239,68,68,.08)', fg: '#fca5a5', border: 'rgba(239,68,68,.22)' };
  return (
    <span
      style={{
        fontSize: 10,
        padding: '2px 8px',
        borderRadius: 4,
        background: cfg.bg,
        color: cfg.fg,
        border: `1px solid ${cfg.border}`,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

function ConceptStatusPill() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px',
        borderRadius: 999,
        background: 'rgba(167,139,250,.12)',
        border: '1px solid rgba(167,139,250,.32)',
        color: '#c4b5fd',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '.16em',
        textTransform: 'uppercase',
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: '#a78bfa',
          boxShadow: '0 0 8px #a78bfa',
        }}
      />
      Concept
    </span>
  );
}

function SourcePill() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 7px',
        borderRadius: 4,
        background: 'rgba(255,191,0,.10)',
        border: '1px solid rgba(255,191,0,.28)',
        color: 'var(--brand)',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '.18em',
        textTransform: 'uppercase',
      }}
    >
      <Sparkles size={9} /> AI
    </span>
  );
}

function ConfidenceBar({ pct }: { pct: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 4,
          background: 'rgba(255,255,255,.06)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: pct * 100 + '%',
            height: '100%',
            background: pct > 0.85 ? '#22c55e' : pct > 0.7 ? 'var(--brand)' : '#f59e0b',
            borderRadius: 2,
          }}
        />
      </div>
      <span
        style={{
          fontSize: 10,
          color: 'var(--muted)',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 600,
        }}
      >
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}
