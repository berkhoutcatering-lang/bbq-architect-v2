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

interface BedenkerResult {
    name: string;
    desc: string;
    gang: string;
    cost: number;
    price: number;
    margin: number;
    components: string[];
}

interface Props {
    open: boolean;
    onClose: () => void;
    /* Optioneel: backend-hook die een idee genereert. Als undefined gebruikt
       de modal een lokale demo-call met setTimeout (voor visuele bevestiging). */
    onGenerate?: (input: { mode: BedenkerMode; prompt: string }) => Promise<BedenkerResult | null>;
    /* Aangeroepen als de gebruiker "Maak gerecht" klikt — meestal door
       parent omgezet naar een navigatie naar /gerechten/[id] of een
       saveGerecht-aanroep. */
    onAccept?: (result: BedenkerResult) => void;
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

    const handleGenerate = async () => {
        setThinking(true);
        setResult(null);
        try {
            if (onGenerate) {
                const r = await onGenerate({ mode, prompt });
                setResult(r);
            } else {
                /* Visuele demo wanneer geen backend gewired is — vervang
                   later door echte AI-call vanuit parent. */
                await new Promise((r) => setTimeout(r, 2200));
                setResult({
                    name: 'Smoked Miso Aubergine',
                    desc: 'Hele aubergine · 3u hickory smoke · witte miso-glaze · sesam · lente-ui · crispy shallots',
                    gang: 'Vegetarisch',
                    cost: 2.15,
                    price: 12.50,
                    margin: 83,
                    components: ['Miso Glaze (nieuw)', 'Sesam-olie', 'Crispy Shallots'],
                });
            }
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
