'use client';

import { useEffect } from 'react';
import {
  X,
  Check,
  BookmarkPlus,
  List,
  Utensils,
  Wine,
  Sparkles,
  GitBranch,
  ArrowUpRight,
} from 'lucide-react';
import type { Concept } from './types';

interface Props {
  concept: Concept | null;
  onClose: () => void;
  onSave: (c: Concept) => void;
}

export default function ConceptDrawer({ concept, onClose, onSave }: Props) {
  useEffect(() => {
    if (!concept) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [concept, onClose]);

  if (!concept) return null;
  const saving = concept.saveState === 'saving';
  const saved = concept.saveState === 'saved' || !!concept.saved;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,.55)',
          backdropFilter: 'blur(4px)',
          animation: 'bedenker-fade .2s ease',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 620,
          height: '100%',
          background: 'var(--card)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '-12px 0 60px rgba(0,0,0,.4)',
          animation: 'bedenker-slide .3s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero */}
        <div
          style={{
            position: 'relative',
            height: 200,
            background: concept.tone,
            display: 'flex',
            alignItems: 'flex-end',
            padding: 22,
            flexShrink: 0,
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
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(0,0,0,.5)',
              border: '1px solid rgba(255,255,255,.15)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(6px)',
            }}
            aria-label="Sluiten"
          >
            <X size={16} />
          </button>
          <div
            style={{
              fontSize: 86,
              position: 'absolute',
              top: 30,
              right: 60,
              filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.4))',
            }}
          >
            {concept.glyph}
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,.75)',
                letterSpacing: '.2em',
                textTransform: 'uppercase',
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              {concept.category} · {concept.cuisine}
            </div>
            <h2
              style={{
                margin: 0,
                fontWeight: 400,
                fontSize: 28,
                color: '#fff',
                textWrap: 'balance',
                maxWidth: 380,
                lineHeight: 1.1,
              }}
            >
              {concept.name}
            </h2>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
          <p style={{ margin: '0 0 18px', color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.55 }}>
            {concept.tagline}
          </p>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 22 }}>
            <KPI label="Porties" value={String(concept.portions)} />
            <KPI label="Kostprijs" value={`€${concept.estCost.toFixed(2)}`} sub="p.p." />
            <KPI
              label="Verkoop"
              value={concept.estPrice > 0 ? `€${concept.estPrice.toFixed(2)}` : '—'}
              sub={concept.margin > 0 ? `${Math.round(concept.margin * 100)}% marge` : ''}
              tone="brand"
            />
            <KPI
              label="Prep"
              value={concept.prepTime >= 60 ? `${(concept.prepTime / 60).toFixed(0)}u` : `${concept.prepTime}m`}
              sub={concept.serveTemp}
            />
          </div>

          <Section title="Ingrediënten" icon={List}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              {concept.ingredients.length === 0 ? (
                <div style={{ padding: 14, fontSize: 13, color: 'var(--muted)' }}>Geen ingrediënten gegenereerd.</div>
              ) : (
                concept.ingredients.map((i, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 14px',
                      fontSize: 13,
                      borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                      background: i.critical ? 'rgba(255,191,0,.04)' : 'transparent',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {i.critical && (
                        <span
                          style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand)' }}
                        />
                      )}
                      {i.name}
                    </span>
                    <span style={{ color: 'var(--muted)', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
                      {i.qty}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Section>

          <Section title="Bereiding" icon={Utensils}>
            {concept.method.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Nog geen bereidingsstappen.</div>
            ) : (
              <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {concept.method.map((m, idx) => (
                  <li key={idx} style={{ display: 'flex', gap: 12, fontSize: 13, lineHeight: 1.5 }}>
                    <span
                      style={{
                        flexShrink: 0,
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: 'rgba(255,191,0,.1)',
                        color: 'var(--brand)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                        marginTop: 1,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <span>{m}</span>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          {concept.pairing && (
            <Section title="Pairing" icon={Wine}>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{concept.pairing}</div>
            </Section>
          )}

          {concept.serviceTip && (
            <Section title="Service-tip" icon={Sparkles}>
              <div
                style={{
                  padding: '12px 14px',
                  background: 'rgba(255,191,0,.04)',
                  border: '1px solid rgba(255,191,0,.18)',
                  borderRadius: 10,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: 'var(--text)',
                  fontStyle: 'italic',
                }}
              >
                {concept.serviceTip}
              </div>
            </Section>
          )}

          {concept.allergens.length > 0 && (
            <Section title="Allergenen" icon={Sparkles}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {concept.allergens.map((a) => (
                  <span
                    key={a}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      background: 'rgba(239,68,68,.08)',
                      color: '#fca5a5',
                      border: '1px solid rgba(239,68,68,.22)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    ⚠ {a}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {concept.inspiredBy.length > 0 && (
            <Section title="Inspired by jouw recepten" icon={GitBranch}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {concept.inspiredBy.map((p, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,.02)',
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{p.glyph || '🍴'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                      {p.category && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{p.category}</div>
                      )}
                    </div>
                    <a
                      href="/gerechten"
                      style={{
                        fontSize: 11,
                        color: 'var(--brand)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        textDecoration: 'none',
                      }}
                    >
                      Bekijk <ArrowUpRight size={11} />
                    </a>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Sticky footer */}
        <div
          style={{
            flexShrink: 0,
            padding: 16,
            borderTop: '1px solid var(--border)',
            background: 'var(--card)',
            display: 'flex',
            gap: 10,
          }}
        >
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <X size={14} /> Sluiten
          </button>
          <button
            onClick={() => onSave(concept)}
            disabled={saved || saving}
            className="btn btn-brand"
            style={{
              flex: 1,
              justifyContent: 'center',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: saved || saving ? 'default' : 'pointer',
            }}
          >
            {saving ? (
              <>Opslaan…</>
            ) : saved ? (
              <>
                <Check size={14} /> Bewaard in /gerechten als concept
              </>
            ) : (
              <>
                <BookmarkPlus size={14} /> Bewaar als concept
              </>
            )}
          </button>
        </div>
      </div>
      <style jsx>{`
        @keyframes bedenker-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes bedenker-slide {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof X;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon size={13} color="var(--brand-gold)" />
        <span
          style={{
            fontSize: 10,
            letterSpacing: '.22em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            fontWeight: 700,
          }}
        >
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function KPI({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'brand' }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '10px 12px',
        background: 'rgba(255,255,255,.02)',
      }}
    >
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
