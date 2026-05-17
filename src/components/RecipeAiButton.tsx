'use client';
/**
 * RecipeAiButton — "✨ AI: vul recept in" knop + modal.
 *
 * Gebruik in /gerechten editor. User klikt → modal vraagt recept-naam +
 * porties + optionele wensen → POST naar /api/recipe/ai-fill →
 * onResult(filled) wordt aangeroepen met het complete form-payload.
 *
 * Bij matched ingrediënten: inventory_id gevuld + echte prijs uit voorraad.
 * Bij ontbrekende: is_estimated=true + estimated_price_eur voor schatting.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Loader2, AlertTriangle, Wand2 } from 'lucide-react';
import { useToast } from '@/components/Toast';

const GOLD = '#c4a35a';

export interface AiFillIngredient {
  naam: string;
  inventory_id: number | null;
  qty_pp: number;
  unit: string;
  yield: number;
  is_estimated: boolean;
  estimated_price_eur: number | null;
}

export interface AiFillResult {
  naam: string;
  beschrijving: string;
  porties: number;
  ingredient_costs: AiFillIngredient[];
  bereidingswijze: string;
  allergenen: string[];
  tags: string[];
  wijn_suggestie: string;
  service_tip: string;
  kostprijs_pp_schatting: number;
}

export interface AiFillMeta {
  inventory_size: number;
  matched_count: number;
  estimated_count: number;
  cost_cents: number;
  elapsed_ms: number;
}

interface Props {
  defaultName?: string;
  defaultPorties?: number;
  onResult: (data: AiFillResult, meta: AiFillMeta) => void;
  /** Compact = inline-button, normaal = grote CTA. */
  compact?: boolean;
}

export default function RecipeAiButton({ defaultName = '', defaultPorties = 10, onResult, compact }: Props) {
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [porties, setPorties] = useState(defaultPorties);
  const [hints, setHints] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => { setName(defaultName); }, [defaultName]);
  useEffect(() => { setPorties(defaultPorties); }, [defaultPorties]);

  async function generate() {
    setError(null);
    if (!name.trim() || name.trim().length < 2) {
      setError('Geef een recept-naam van min. 2 letters.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/recipe/ai-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe_name: name.trim(),
          porties,
          hints: hints.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error || `AI-call faalde (${res.status})`);
        setLoading(false);
        return;
      }
      onResult(body.data as AiFillResult, body.meta as AiFillMeta);
      showToast(`Recept gegenereerd — ${body.meta.matched_count} uit voorraad, ${body.meta.estimated_count} geschat`, 'success');
      setOpen(false);
      setLoading(false);
      setHints('');
    } catch (e) {
      setError((e as Error).message || 'Netwerk-fout');
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={compact ? {
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', fontSize: 12, fontWeight: 600,
          background: `linear-gradient(135deg, ${GOLD}26, ${GOLD}10)`,
          color: GOLD, border: `1px solid ${GOLD}66`, borderRadius: 8,
          cursor: 'pointer',
        } : {
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', fontSize: 13, fontWeight: 700,
          background: `linear-gradient(135deg, ${GOLD}, #d4b67a)`,
          color: '#0a0a0c', border: 'none', borderRadius: 10,
          cursor: 'pointer',
          boxShadow: '0 4px 18px rgba(196,163,90,.32), inset 0 1px 0 rgba(255,255,255,.2)',
        }}
        aria-label="AI vult recept in"
      >
        <Sparkles size={compact ? 12 : 14} />
        {compact ? 'AI vul in' : 'AI: vul recept in'}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-fill-title"
          onClick={(e) => { if (e.target === e.currentTarget && !loading) setOpen(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 14, padding: 24, width: '100%', maxWidth: 480,
              boxShadow: '0 24px 60px rgba(0,0,0,.5)',
              position: 'relative',
            }}
          >
            <button
              type="button"
              onClick={() => !loading && setOpen(false)}
              disabled={loading}
              aria-label="Sluit dialoog"
              style={{
                position: 'absolute', top: 10, right: 10,
                background: 'transparent', border: 'none',
                color: 'var(--muted)', cursor: loading ? 'not-allowed' : 'pointer',
                padding: 6, borderRadius: 6,
              }}
            >
              <X size={16} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `${GOLD}26`, border: `1px solid ${GOLD}66`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Wand2 size={18} style={{ color: GOLD }} />
              </div>
              <div>
                <h2 id="ai-fill-title" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                  AI vult je recept in
                </h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
                  Geeft ingrediënten, bereidingswijze, allergenen en kostprijs — gematched aan je voorraad.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                  Recept-naam
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !loading) generate(); }}
                  placeholder="bv. Pulled Pork Taco, Bavette met chimichurri…"
                  disabled={loading}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 14,
                    background: 'var(--bg)', color: 'var(--text)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                    Porties
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={porties}
                    onChange={e => setPorties(Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 10)))}
                    disabled={loading}
                    style={{
                      width: '100%', padding: '10px 12px', fontSize: 14,
                      background: 'var(--bg)', color: 'var(--text)',
                      border: '1px solid var(--border)', borderRadius: 8,
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                  Extra wensen <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--muted-light)' }}>(optioneel)</span>
                </label>
                <textarea
                  value={hints}
                  onChange={e => setHints(e.target.value)}
                  placeholder="bv. glutenvrij, low&slow, gebruik mijn ribeye-voorraad…"
                  disabled={loading}
                  rows={2}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 13,
                    background: 'var(--bg)', color: 'var(--text)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    outline: 'none', resize: 'vertical',
                  }}
                />
              </div>

              {error && (
                <div style={{
                  display: 'flex', gap: 8, padding: 10, borderRadius: 8,
                  background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)',
                  color: '#fca5a5', fontSize: 12,
                }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>{error}</div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  style={{
                    padding: '9px 14px', fontSize: 13, fontWeight: 600,
                    background: 'transparent', color: 'var(--muted)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Annuleren
                </button>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={generate}
                  disabled={loading || !name.trim()}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 18px', fontSize: 13, fontWeight: 700,
                    background: loading ? 'rgba(196,163,90,.5)' : `linear-gradient(135deg, ${GOLD}, #d4b67a)`,
                    color: '#0a0a0c', border: 'none', borderRadius: 8,
                    cursor: loading ? 'wait' : 'pointer',
                    boxShadow: loading ? 'none' : '0 4px 14px rgba(196,163,90,.32)',
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="spin" />
                      Bezig…
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      Genereer
                    </>
                  )}
                </button>
              </div>

              <p style={{ fontSize: 10, color: 'var(--muted-light)', margin: 0, lineHeight: 1.5 }}>
                Sonnet 4.6 · ~€0.03 per recept (cached) · prijzen die niet in voorraad staan worden geschat — verfijn later met een foto.
              </p>
            </div>
          </div>

          <style jsx>{`
            @keyframes spin { to { transform: rotate(360deg); } }
            :global(.spin) { animation: spin .9s linear infinite; }
          `}</style>
        </div>
      )}
    </>
  );
}
