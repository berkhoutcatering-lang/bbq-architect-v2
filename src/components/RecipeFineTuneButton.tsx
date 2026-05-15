'use client';
/**
 * RecipeFineTuneButton — "Verfijn met AI" knop op een bestaand recept.
 *
 * Werkt alleen als het recept al ingredient_costs heeft. AI bekijkt het
 * recept + voorraad-context en levert 5-8 concrete fine-tune suggesties.
 * User klikt per suggestie ✓ Accepteer (past direct toe op form-state)
 * of ✗ Negeer. "Accepteer alle high-impact" als shortcut.
 */

import React, { useState } from 'react';
import {
  Lightbulb, X, Loader2, AlertTriangle, Check,
  PlusCircle, RefreshCw, Scale, ListPlus, MessageSquare,
  TrendingUp, Minus,
} from 'lucide-react';
import { useToast } from '@/components/Toast';

const GOLD = '#c4a35a';

export type FineTuneFocus = 'smaak' | 'kostprijs' | 'textuur' | 'preptijd' | 'presentatie' | 'schaalbaarheid';

export interface RecipeForTune {
  naam: string;
  beschrijving?: string;
  porties: number;
  ingredient_costs: Array<{
    naam: string;
    qty_pp: number;
    unit: string;
    yield?: number;
    inventory_id?: number | null;
    is_estimated?: boolean;
    estimated_price?: number | null;
  }>;
  bereidingswijze?: string;
  allergenen?: string[];
  tags?: string[];
  wijn_suggestie?: string;
  service_tip?: string;
}

export type FineTune =
  | {
      type: 'add_ingredient';
      impact: 'high' | 'medium' | 'low';
      category: string;
      titel: string;
      reden: string;
      details: {
        naam: string;
        qty_pp: number;
        unit: string;
        yield?: number;
        inventory_id?: number | null;
        is_estimated?: boolean;
        estimated_price_eur?: number | null;
      };
    }
  | {
      type: 'replace_ingredient';
      impact: 'high' | 'medium' | 'low';
      category: string;
      titel: string;
      reden: string;
      details: {
        from_naam: string;
        to_naam: string;
        to_qty_pp: number;
        to_unit: string;
        inventory_id?: number | null;
        is_estimated?: boolean;
        estimated_price_eur?: number | null;
      };
    }
  | {
      type: 'tweak_quantity';
      impact: 'high' | 'medium' | 'low';
      category: string;
      titel: string;
      reden: string;
      details: { ingredient_naam: string; new_qty_pp: number; new_unit?: string | null };
    }
  | {
      type: 'add_step';
      impact: 'high' | 'medium' | 'low';
      category: string;
      titel: string;
      reden: string;
      details: { stap_text: string; positie: 'begin' | 'eind' | number };
    }
  | {
      type: 'general_tip';
      impact: 'high' | 'medium' | 'low';
      category: string;
      titel: string;
      reden: string;
      details: { tip_text: string; veld: 'wijn_suggestie' | 'service_tip' | 'vrij' };
    };

export interface FineTuneResponse {
  recept_analyse: string;
  fine_tunes: FineTune[];
}

interface Props {
  recept: RecipeForTune;
  onApply: (tune: FineTune) => Promise<void> | void;
  /** Alle accepted indices worden uit de lijst geblust nadat ze toegepast zijn. */
  disabled?: boolean;
}

const FOCUS_OPTIONS: { id: FineTuneFocus; label: string }[] = [
  { id: 'smaak', label: 'Smaak' },
  { id: 'kostprijs', label: 'Kostprijs' },
  { id: 'textuur', label: 'Textuur' },
  { id: 'preptijd', label: 'Bereidingstijd' },
  { id: 'presentatie', label: 'Presentatie' },
  { id: 'schaalbaarheid', label: 'Schaalbaarheid' },
];

function impactColor(impact: 'high' | 'medium' | 'low'): { bg: string; text: string; label: string } {
  if (impact === 'high') return { bg: 'rgba(34,197,94,.12)', text: '#86efac', label: 'High impact' };
  if (impact === 'medium') return { bg: 'rgba(245,158,11,.12)', text: '#fbbf24', label: 'Medium' };
  return { bg: 'rgba(130,130,130,.12)', text: 'var(--muted)', label: 'Low' };
}

function tuneIcon(type: FineTune['type']) {
  switch (type) {
    case 'add_ingredient': return PlusCircle;
    case 'replace_ingredient': return RefreshCw;
    case 'tweak_quantity': return Scale;
    case 'add_step': return ListPlus;
    case 'general_tip': return MessageSquare;
  }
}

export default function RecipeFineTuneButton({ recept, onApply, disabled }: Props) {
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<Set<FineTuneFocus>>(new Set());
  const [extraWensen, setExtraWensen] = useState('');
  const [response, setResponse] = useState<FineTuneResponse | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState<number | null>(null);
  const [meta, setMeta] = useState<{ cost_cents: number; tune_count: number } | null>(null);

  function toggleFocus(f: FineTuneFocus) {
    const next = new Set(focus);
    if (next.has(f)) next.delete(f);
    else next.add(f);
    setFocus(next);
  }

  async function fetchSuggestions() {
    setError(null);
    setResponse(null);
    setDismissed(new Set());
    setApplied(new Set());
    setLoading(true);
    try {
      const res = await fetch('/api/recipe/ai-improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recept,
          focus: focus.size > 0 ? Array.from(focus) : undefined,
          extra_wensen: extraWensen.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error || `AI-call faalde (${res.status})`);
        setLoading(false);
        return;
      }
      setResponse(body.data as FineTuneResponse);
      setMeta(body.meta);
      setLoading(false);
    } catch (e) {
      setError((e as Error).message || 'Netwerk-fout');
      setLoading(false);
    }
  }

  async function acceptTune(idx: number) {
    if (!response) return;
    const tune = response.fine_tunes[idx];
    setApplying(idx);
    try {
      await onApply(tune);
      setApplied(prev => new Set(prev).add(idx));
      showToast(`Toegepast: ${tune.titel}`, 'success');
    } catch (e) {
      showToast(`Niet toegepast: ${(e as Error).message || 'onbekende fout'}`, 'error');
    } finally {
      setApplying(null);
    }
  }

  function dismiss(idx: number) {
    setDismissed(prev => new Set(prev).add(idx));
  }

  async function acceptAllHigh() {
    if (!response) return;
    for (let i = 0; i < response.fine_tunes.length; i++) {
      if (response.fine_tunes[i].impact === 'high' && !dismissed.has(i) && !applied.has(i)) {
        await acceptTune(i);
      }
    }
  }

  function closeModal() {
    if (loading || applying != null) return;
    setOpen(false);
    setResponse(null);
    setError(null);
    setDismissed(new Set());
    setApplied(new Set());
    setExtraWensen('');
    setFocus(new Set());
  }

  const visibleTunes = response
    ? response.fine_tunes
        .map((t, i) => ({ t, i }))
        .filter(({ i }) => !dismissed.has(i))
    : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title="Vraag AI om verbeteringen op dit recept"
        aria-label="Verfijn dit recept met AI"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', fontSize: 12, fontWeight: 600,
          background: 'rgba(252,211,77,.12)',
          color: '#fbbf24',
          border: '1px solid rgba(252,211,77,.4)', borderRadius: 8,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Lightbulb size={12} /> Verfijn met AI
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fine-tune-title"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: 16, paddingTop: 40, overflowY: 'auto',
          }}
        >
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 22, width: '100%', maxWidth: 640,
            boxShadow: '0 24px 60px rgba(0,0,0,.5)',
            position: 'relative',
          }}>
            <button
              type="button" onClick={closeModal} disabled={loading || applying != null}
              aria-label="Sluit"
              style={{
                position: 'absolute', top: 10, right: 10,
                background: 'transparent', border: 'none',
                color: 'var(--muted)', cursor: 'pointer',
                padding: 6, borderRadius: 6,
              }}
            >
              <X size={16} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(252,211,77,.18)', border: '1px solid rgba(252,211,77,.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Lightbulb size={18} style={{ color: '#fbbf24' }} />
              </div>
              <div>
                <h2 id="fine-tune-title" style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
                  Verfijn &ldquo;{recept.naam}&rdquo;
                </h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
                  AI bekijkt je recept en stelt 5-8 concrete verbeteringen voor. Jij beslist per stuk.
                </p>
              </div>
            </div>

            {/* ─── Voor de fetch: focus + extra wensen ─── */}
            {!response && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
                    Waar wil je op letten? <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--muted-light)', letterSpacing: 'normal' }}>(optioneel)</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {FOCUS_OPTIONS.map(f => {
                      const isOn = focus.has(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => toggleFocus(f.id)}
                          disabled={loading}
                          style={{
                            padding: '6px 12px', fontSize: 12, fontWeight: 600,
                            background: isOn ? `${GOLD}26` : 'transparent',
                            color: isOn ? GOLD : 'var(--text)',
                            border: `1px solid ${isOn ? `${GOLD}88` : 'var(--border)'}`,
                            borderRadius: 999, cursor: 'pointer',
                          }}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                    Extra wensen <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--muted-light)', letterSpacing: 'normal' }}>(optioneel)</span>
                  </label>
                  <textarea
                    value={extraWensen}
                    onChange={e => setExtraWensen(e.target.value)}
                    placeholder="bv. moet werken voor 80 gasten, gluten-vrij houden, sneller op te warmen…"
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
                    display: 'flex', gap: 8, padding: 10, borderRadius: 8, marginBottom: 12,
                    background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)',
                    color: '#fca5a5', fontSize: 12,
                  }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>{error}</div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                  <p style={{ fontSize: 10, color: 'var(--muted-light)', margin: 0, flex: 1 }}>
                    Sonnet 4.6 · ~€0.03 per verfijning · jij beslist per suggestie
                  </p>
                  <button
                    type="button"
                    onClick={fetchSuggestions}
                    disabled={loading}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '10px 18px', fontSize: 13, fontWeight: 700,
                      background: loading ? 'rgba(252,211,77,.5)' : '#fbbf24',
                      color: '#0a0a0c', border: 'none', borderRadius: 8,
                      cursor: loading ? 'wait' : 'pointer',
                    }}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={13} className="spin" /> AI denkt…
                      </>
                    ) : (
                      <>
                        <Lightbulb size={13} /> Vraag suggesties
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ─── Resultaat ─── */}
            {response && (
              <div>
                <div style={{
                  padding: 12, borderRadius: 10, marginBottom: 14,
                  background: 'rgba(252,211,77,.08)', border: '1px solid rgba(252,211,77,.25)',
                }}>
                  <div style={{ fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#fbbf24', fontWeight: 700, marginBottom: 4 }}>
                    AI Analyse
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>
                    {response.recept_analyse}
                  </div>
                </div>

                {visibleTunes.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    Geen openstaande suggesties meer. Sluit dit venster.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', flex: 1 }}>
                        {visibleTunes.length} suggestie{visibleTunes.length === 1 ? '' : 's'}
                        {meta && <span> · €{(meta.cost_cents / 100).toFixed(3)}</span>}
                      </div>
                      {visibleTunes.some(({ t }) => t.impact === 'high') && (
                        <button
                          type="button"
                          onClick={acceptAllHigh}
                          disabled={applying != null}
                          style={{
                            padding: '6px 12px', fontSize: 11, fontWeight: 600,
                            background: 'rgba(34,197,94,.15)', color: '#86efac',
                            border: '1px solid rgba(34,197,94,.4)', borderRadius: 8,
                            cursor: applying != null ? 'wait' : 'pointer',
                          }}
                        >
                          <TrendingUp size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                          Accepteer alle high-impact
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {visibleTunes.map(({ t, i }) => {
                        const isApplied = applied.has(i);
                        const isApplying = applying === i;
                        const Icon = tuneIcon(t.type);
                        const impactC = impactColor(t.impact);
                        return (
                          <div
                            key={i}
                            style={{
                              padding: 12, borderRadius: 10,
                              background: isApplied ? 'rgba(34,197,94,.06)' : 'rgba(255,255,255,.02)',
                              border: `1px solid ${isApplied ? 'rgba(34,197,94,.35)' : 'var(--border)'}`,
                              opacity: isApplied ? 0.7 : 1,
                              transition: 'all .2s',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                              <div style={{
                                width: 28, height: 28, flexShrink: 0,
                                borderRadius: 8, display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                background: impactC.bg, color: impactC.text,
                              }}>
                                <Icon size={14} />
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                                  <span style={{ fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700, color: impactC.text, padding: '1px 6px', borderRadius: 4, background: impactC.bg }}>
                                    {impactC.label}
                                  </span>
                                  <span style={{ fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--muted)' }}>
                                    {t.category}
                                  </span>
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                                  {t.titel}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4, marginBottom: 6 }}>
                                  {t.reden}
                                </div>
                                <TuneDetails tune={t} />
                              </div>

                              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                {!isApplied ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => acceptTune(i)}
                                      disabled={applying != null}
                                      title="Accepteer en pas direct toe"
                                      style={{
                                        width: 28, height: 28, padding: 0,
                                        background: '#22c55e', color: '#0a0a0c',
                                        border: 'none', borderRadius: 6,
                                        cursor: applying != null ? 'wait' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      }}
                                    >
                                      {isApplying ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => dismiss(i)}
                                      disabled={applying != null}
                                      title="Negeer deze suggestie"
                                      style={{
                                        width: 28, height: 28, padding: 0,
                                        background: 'rgba(130,130,130,.18)', color: 'var(--muted)',
                                        border: '1px solid var(--border)', borderRadius: 6,
                                        cursor: applying != null ? 'wait' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      }}
                                    >
                                      <Minus size={13} />
                                    </button>
                                  </>
                                ) : (
                                  <div style={{
                                    padding: '4px 8px', fontSize: 10, fontWeight: 700,
                                    letterSpacing: '.1em', textTransform: 'uppercase',
                                    color: '#86efac', background: 'rgba(34,197,94,.12)',
                                    borderRadius: 6, alignSelf: 'center',
                                  }}>
                                    Toegepast
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => { setResponse(null); }}
                        disabled={applying != null}
                        style={{
                          fontSize: 11, color: 'var(--muted)',
                          background: 'transparent', border: 'none',
                          cursor: 'pointer', textDecoration: 'underline',
                        }}
                      >
                        Vraag opnieuw met andere focus
                      </button>
                      <button
                        type="button"
                        onClick={closeModal}
                        disabled={applying != null}
                        style={{
                          padding: '8px 14px', fontSize: 12, fontWeight: 700,
                          background: GOLD, color: '#0a0a0c',
                          border: 'none', borderRadius: 8, cursor: 'pointer',
                        }}
                      >
                        Sluit
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
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

function TuneDetails({ tune }: { tune: FineTune }) {
  const baseStyle: React.CSSProperties = {
    fontSize: 11, padding: '4px 8px',
    background: 'rgba(255,255,255,.03)',
    border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)',
    display: 'inline-block', marginRight: 4,
  };
  if (tune.type === 'add_ingredient') {
    return (
      <div>
        <span style={baseStyle}>
          + <strong>{tune.details.naam}</strong> {tune.details.qty_pp} {tune.details.unit}/gast
          {tune.details.is_estimated && tune.details.estimated_price_eur != null && (
            <span style={{ color: 'var(--muted)', marginLeft: 4 }}>
              (~€{tune.details.estimated_price_eur.toFixed(2)}/{tune.details.unit})
            </span>
          )}
        </span>
      </div>
    );
  }
  if (tune.type === 'replace_ingredient') {
    return (
      <div>
        <span style={baseStyle}>
          <strong>{tune.details.from_naam}</strong> → <strong>{tune.details.to_naam}</strong>
          {' '}{tune.details.to_qty_pp} {tune.details.to_unit}/gast
        </span>
      </div>
    );
  }
  if (tune.type === 'tweak_quantity') {
    return (
      <div>
        <span style={baseStyle}>
          <strong>{tune.details.ingredient_naam}</strong> → {tune.details.new_qty_pp} {tune.details.new_unit || ''}/gast
        </span>
      </div>
    );
  }
  if (tune.type === 'add_step') {
    return (
      <div>
        <span style={baseStyle}>
          Bereiding ({tune.details.positie === 'begin' ? 'aan het begin' : tune.details.positie === 'eind' ? 'op het eind' : `bij stap ${tune.details.positie}`}):
          <em style={{ color: 'var(--muted)', marginLeft: 4 }}>&ldquo;{tune.details.stap_text}&rdquo;</em>
        </span>
      </div>
    );
  }
  if (tune.type === 'general_tip') {
    return (
      <div>
        <span style={baseStyle}>
          {tune.details.veld === 'wijn_suggestie' && '🍷 '}
          {tune.details.veld === 'service_tip' && '🍽️ '}
          {tune.details.tip_text}
        </span>
      </div>
    );
  }
  return null;
}
