/* ═══════════════════════════════════════════════════════════════
   BedenkerModal — AI gerechten-brainstorm (3 modes + thinking trail)
   Bucket C P0-3/P0-10. Wraps de bestaande /bedenker functionaliteit
   in een modal. Modal-state via URL ?modal=bedenker zodat refresh
   en deeplinks blijven werken (middleware redirect verbouwt /bedenker
   → /gerechten?modal=bedenker).
   ═══════════════════════════════════════════════════════════════ */

'use client';

import { useEffect, useState } from 'react';
import { Pencil, Package, Users, Sparkles, X, Plus, RefreshCw, Bookmark } from 'lucide-react';
import { MRButton, MREyebrow, MRTag } from './atoms';
import { fmtEuro } from './helpers';

type BedenkerMode = 'vrij' | 'voorraad' | 'klant';

export interface BedenkerCitation {
    source_title: string;
    cited_text: string;
}

export interface BedenkerResult {
    name: string;
    desc: string;
    gang: string;
    cost: number;
    price: number;
    margin: number;
    components: string[];
    /* P0-C (2026-05-25): Citations API output — per-claim source-attribution
       uit het tenant-repertoire. Geeft user vertrouwen dat AI geen halluci-
       natie produceert. */
    citations?: BedenkerCitation[];
    citationsEnabled?: boolean;
    /* Inspired-by lijst uit recipe-generate response (stijl-bron-gerechten). */
    inspiredBy?: string[];
}

interface Props {
    open: boolean;
    onClose: () => void;
    /* Optioneel: backend-hook die een idee genereert. Als undefined doet
       defaultGenerate een echte fetch naar /api/recipe-generate. */
    onGenerate?: (input: { mode: BedenkerMode; prompt: string }) => Promise<BedenkerResult | null>;
    /* Aangeroepen als de gebruiker "Maak gerecht" klikt — meestal door
       parent omgezet naar een navigatie naar /gerechten/[id] of een
       saveGerecht-aanroep. */
    onAccept?: (result: BedenkerResult) => void;
}

/* P0-C: default API-call wanneer parent geen custom onGenerate injecteert.
   Mapt recipe-generate response naar BedenkerResult shape. Citations worden
   doorgegeven zodat de UI source-chips per claim kan tonen. */
async function defaultGenerate({ mode, prompt }: { mode: BedenkerMode; prompt: string }): Promise<BedenkerResult | null> {
    const flavourContext: Record<string, unknown> = {};
    /* Mode-mapping: 'vrij' → flavour=vrij; 'voorraad' → flavour=voorraad met
       prompt als voorraad-string; 'klant' → flavour=klant met context. */
    if (mode === 'voorraad') flavourContext.voorraad = prompt;
    if (mode === 'klant') flavourContext.context = prompt;

    const res = await fetch('/api/recipe-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: mode === 'vrij' ? prompt : 'Bedenk een passend gerecht',
            mode: 'recipe',
            options: { flavour: mode, flavourContext },
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Onbekende fout' }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    const body = await res.json();
    const data = body.data ?? {};
    const cost = Number(data.geschatte_kostprijs_pp ?? 0);
    /* Verkoopprijs schatting: cost × 2.5 voor preview-marge ~60%. User
       past dit aan in edit-modal na "Maak gerecht". */
    const price = cost > 0 ? Math.round(cost * 2.5 * 100) / 100 : 0;
    const margin = price > 0 ? Math.round((1 - cost / price) * 100) : 0;
    const ingredients = Array.isArray(data.ingredienten)
        ? data.ingredienten.slice(0, 6).map((i: { naam?: string }) => i.naam ?? '').filter(Boolean)
        : [];
    return {
        name: data.naam ?? 'Naamloos gerecht',
        desc: data.beschrijving ?? '',
        gang: data.gang ?? data.categorie ?? 'Onbekend',
        cost,
        price,
        margin,
        components: ingredients,
        citations: Array.isArray(body.citations) ? body.citations : [],
        citationsEnabled: Boolean(body.citationsEnabled),
        inspiredBy: Array.isArray(data.inspired_by) ? data.inspired_by : [],
    };
}

const MODES: Array<{ id: BedenkerMode; label: string; Icon: typeof Pencil }> = [
    { id: 'vrij',     label: 'Vrij',              Icon: Pencil },
    { id: 'voorraad', label: 'Voorraad-gebaseerd', Icon: Package },
    { id: 'klant',    label: 'Klant-context',      Icon: Users },
];

const PROMPT_PLACEHOLDERS: Record<BedenkerMode, string> = {
    vrij: 'Bijv. "Een vegetarisch hoofdgerecht met Aziatische smaken en smoke"',
    voorraad: 'AI analyseert je huidige voorraad en stelt gerechten voor…',
    klant: 'Bijv. "Bruiloft, 80 personen, 3 vegetariërs, glutenvrij kind"',
};

const PROMPT_LABELS: Record<BedenkerMode, string> = {
    vrij: 'Beschrijf je gerecht-idee',
    voorraad: 'AI bekijkt je huidige voorraad',
    klant: 'Beschrijf het event & dieetwensen',
};

const THINKING_STEPS = [
    'Analyseer keukencontext…',
    'Zoek smaakcombinaties…',
    'Bereken kostprijs…',
];

const DONE_STEPS = [
    '✓ Context geanalyseerd',
    '✓ 12 combinaties overwogen',
    '✓ Kostprijs berekend',
    '✓ Allergenen gecheckt',
];

export function BedenkerModal({ open, onClose, onGenerate, onAccept }: Props) {
    const [mode, setMode] = useState<BedenkerMode>('vrij');
    const [prompt, setPrompt] = useState('');
    const [thinking, setThinking] = useState(false);
    const [result, setResult] = useState<BedenkerResult | null>(null);

    /* Reset bij open */
    useEffect(() => {
        if (open) { setMode('vrij'); setPrompt(''); setResult(null); setThinking(false); }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const [error, setError] = useState<string | null>(null);
    const handleGenerate = async () => {
        if (mode !== 'voorraad' && prompt.trim().length === 0) return;
        setThinking(true);
        setResult(null);
        setError(null);
        try {
            const generator = onGenerate ?? defaultGenerate;
            const r = await generator({ mode, prompt });
            setResult(r);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'AI-call mislukt';
            setError(msg);
        } finally {
            setThinking(false);
        }
    };

    return (
        <div className="mr-modal-scrim" onClick={onClose} role="presentation">
            <div
                className="mr-bedenker-modal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="bedenker-modal-title"
            >
                {/* Header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '20px 24px', borderBottom: '1px solid var(--border)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Sparkles size={20} color="var(--brand)" />
                        <h3 id="bedenker-modal-title" style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, margin: 0 }}>
                            Bedenk met AI
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Sluit"
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                    {/* Left: input */}
                    <div style={{
                        flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column',
                        gap: 16, borderRight: '1px solid var(--border)', overflowY: 'auto',
                    }}>
                        {/* Mode segmented control */}
                        <div style={{
                            display: 'flex', gap: 0, padding: 3,
                            background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 10,
                        }}>
                            {MODES.map((m) => {
                                const I = m.Icon;
                                const active = mode === m.id;
                                return (
                                    <button
                                        key={m.id}
                                        onClick={() => setMode(m.id)}
                                        aria-pressed={active}
                                        style={{
                                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            gap: 6, padding: '8px 12px', borderRadius: 7,
                                            background: active ? 'rgba(255,191,0,.08)' : 'transparent',
                                            border: active ? '1px solid rgba(255,191,0,.25)' : '1px solid transparent',
                                            color: active ? 'var(--brand)' : 'var(--muted)',
                                            cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                            fontFamily: 'var(--font-sans)', transition: '.15s',
                                        }}
                                    >
                                        <I size={13} /> {m.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Prompt input */}
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, display: 'block' }}>
                                {PROMPT_LABELS[mode]}
                            </label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={PROMPT_PLACEHOLDERS[mode]}
                                disabled={mode === 'voorraad'}
                                style={{
                                    width: '100%', height: 120, padding: 12, borderRadius: 10,
                                    background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                                    color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)',
                                    resize: 'none', outline: 'none',
                                }}
                            />
                        </div>

                        <MRButton
                            variant="primary"
                            icon={<Sparkles size={14} />}
                            onClick={handleGenerate}
                            disabled={thinking || (mode !== 'voorraad' && prompt.trim().length === 0)}
                        >
                            {thinking ? 'Bezig met bedenken…' : 'Genereer gerecht'}
                        </MRButton>

                        {/* Error display */}
                        {error && (
                            <div style={{
                                padding: 12, borderRadius: 10,
                                background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)',
                                fontSize: 12, color: 'var(--red, #ef4444)',
                            }}>
                                Fout: {error}
                            </div>
                        )}

                        {/* Result */}
                        {result && (
                            <div style={{
                                padding: 16, borderRadius: 12,
                                background: 'rgba(255,191,0,.04)', border: '1px solid rgba(255,191,0,.15)',
                            }}>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500 }}>{result.name}</div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>{result.desc}</div>
                                <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <MRTag>{result.gang}</MRTag>
                                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>Kostprijs: {fmtEuro(result.cost)}</span>
                                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>Verkoop: {fmtEuro(result.price)}</span>
                                    <span style={{ color: 'var(--green, #22c55e)', fontWeight: 600 }}>Marge: {result.margin}%</span>
                                </div>

                                {/* Ingrediënten preview */}
                                {result.components && result.components.length > 0 && (
                                    <div style={{ marginTop: 12 }}>
                                        <MREyebrow style={{ marginBottom: 6 }}>Ingrediënten</MREyebrow>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            {result.components.map((c, i) => (
                                                <span key={i} style={{
                                                    fontSize: 11, padding: '3px 8px', borderRadius: 5,
                                                    background: 'rgba(196,163,90,.08)', border: '1px solid rgba(196,163,90,.2)',
                                                    color: 'var(--text)',
                                                }}>{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* P0-C: Citations chips — per claim source-attribution.
                                    Inspired-by zijn de aangewezen stijl-bron-gerechten;
                                    citations zijn de daadwerkelijke text-spans uit Anthropic API. */}
                                {result.citationsEnabled && (result.inspiredBy?.length || result.citations?.length) ? (
                                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.06)' }}>
                                        <MREyebrow style={{ marginBottom: 6 }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <Sparkles size={10} /> Geïnspireerd door
                                            </span>
                                        </MREyebrow>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            {(result.inspiredBy ?? []).map((src, i) => (
                                                <span key={`ib-${i}`} style={{
                                                    fontSize: 11, padding: '3px 8px', borderRadius: 5,
                                                    background: 'rgba(255,191,0,.08)', border: '1px solid rgba(255,191,0,.25)',
                                                    color: 'var(--brand)', fontWeight: 600,
                                                }} title="Uit jouw repertoire — AI-bevestigde stijl-bron">
                                                    {src}
                                                </span>
                                            ))}
                                            {(result.citations ?? []).slice(0, 3).map((c, i) => (
                                                <span key={`c-${i}`} style={{
                                                    fontSize: 10, padding: '2px 7px', borderRadius: 5,
                                                    background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)',
                                                    color: 'var(--green, #22c55e)', fontStyle: 'italic',
                                                }} title={c.cited_text}>
                                                    ✓ {c.source_title}
                                                </span>
                                            ))}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>
                                            Bronnen uit jouw eigen gerechten-lijst — geen hallucinatie
                                        </div>
                                    </div>
                                ) : null}

                                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                                    <MRButton variant="primary" icon={<Plus size={13} />} sm onClick={() => onAccept?.(result)}>
                                        Maak gerecht
                                    </MRButton>
                                    <MRButton variant="ghost" icon={<Bookmark size={13} />} sm>Opslaan</MRButton>
                                    <MRButton variant="ghost" icon={<RefreshCw size={13} />} sm onClick={handleGenerate}>Opnieuw</MRButton>
                                </div>
                            </div>
                        )}

                        {/* Thinking indicator */}
                        {thinking && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10,
                                background: 'rgba(255,191,0,.04)', border: '1px solid rgba(255,191,0,.12)',
                            }}>
                                <div style={{
                                    width: 20, height: 20,
                                    border: '2px solid var(--brand)', borderTopColor: 'transparent',
                                    borderRadius: '50%', animation: 'mr-spin 1s linear infinite',
                                }} />
                                <span style={{ fontSize: 13, color: 'var(--brand)' }}>AI denkt na over je gerecht…</span>
                            </div>
                        )}
                    </div>

                    {/* Right: thinking trail */}
                    <div style={{
                        width: 260, padding: '20px 16px',
                        display: 'flex', flexDirection: 'column', gap: 12,
                        background: 'rgba(0,0,0,.2)', overflowY: 'auto',
                    }}>
                        <MREyebrow>AI Thinking Trail</MREyebrow>
                        {thinking ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {THINKING_STEPS.map((step, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '8px 10px', borderRadius: 7,
                                            background: 'rgba(255,191,0,.04)', border: '1px solid rgba(255,191,0,.08)',
                                            fontSize: 11, color: 'var(--muted)',
                                        }}
                                    >
                                        <div style={{
                                            width: 14, height: 14,
                                            border: '2px solid var(--brand)', borderTopColor: 'transparent',
                                            borderRadius: '50%', animation: 'mr-spin 1s linear infinite',
                                        }} />
                                        {step}
                                    </div>
                                ))}
                            </div>
                        ) : result ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {DONE_STEPS.map((s, i) => (
                                    <div key={i} style={{
                                        fontSize: 11, color: 'var(--green, #22c55e)',
                                        padding: '6px 8px', borderRadius: 5,
                                        background: 'rgba(34,197,94,.05)',
                                    }}>{s}</div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                                Genereer een gerecht om de AI-gedachtegang te zien.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
