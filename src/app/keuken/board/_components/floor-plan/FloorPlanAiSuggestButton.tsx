'use client';

/**
 * FloorPlanAiSuggestButton — UI voor /api/floor-plan/ai-suggest (S3.3).
 *
 * Toont een mini-modal waarin Sam headcount + event-type + venue-context
 * invult. AI levert een lijst CanvasShape's die als "voorstel-laag" worden
 * geappend aan het bestaande canvas via updateShapes. Sam kan dan slepen,
 * verwijderen of accepteren via de standaard save-flow.
 */

import { useState } from 'react';
import { Sparkles, X, Wand2, Loader2 } from 'lucide-react';
import { useToast } from '@/components/Toast';
import type { CanvasShape, ShapeKind } from './CanvasShapes';

interface AiShape {
    id: string;
    kind: ShapeKind;
    x_pct: number;
    y_pct: number;
    w_pct: number;
    h_pct: number;
    rotation?: number;
    label?: string;
}

interface Props {
    eventId?: number;
    defaultHeadcount?: number;
    /** Callback om de gesuggereerde shapes aan het canvas toe te voegen. */
    onApply: (shapes: AiShape[]) => void;
}

const GOLD = '#c4a35a';

export default function FloorPlanAiSuggestButton({ eventId, defaultHeadcount, onApply }: Props) {
    const [open, setOpen] = useState(false);
    const [headcount, setHeadcount] = useState(defaultHeadcount || 40);
    const [eventType, setEventType] = useState('BBQ');
    const [venueNote, setVenueNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState<{ shapes: AiShape[]; reasoning: string } | null>(null);
    const showToast = useToast();

    async function run() {
        if (!Number.isFinite(headcount) || headcount <= 0) {
            showToast('Aantal gasten > 0 verplicht', 'warning');
            return;
        }
        setLoading(true);
        setPreview(null);
        try {
            const res = await fetch('/api/floor-plan/ai-suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId, headcount, eventType, venueNote }),
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(data?.error || 'AI fout', 'error');
                return;
            }
            const shapes: AiShape[] = Array.isArray(data.shapes) ? data.shapes : [];
            if (shapes.length === 0) {
                showToast('AI gaf geen layout — probeer een andere prompt', 'warning');
                return;
            }
            setPreview({ shapes, reasoning: data.reasoning || '' });
        } catch (e: any) {
            showToast('Netwerk-fout: ' + (e?.message || ''), 'error');
        } finally {
            setLoading(false);
        }
    }

    function apply() {
        if (!preview) return;
        onApply(preview.shapes);
        showToast(`${preview.shapes.length} shapes toegevoegd — sleep ze op hun plek of save`, 'success');
        setOpen(false);
        setPreview(null);
    }

    return (
        <>
            <button
                type="button"
                onClick={function () { setOpen(true); }}
                className="prep-canvas-tool"
                title="AI-layout suggestie"
                style={{ color: GOLD }}
            >
                <Sparkles size={20} />
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="AI Floor-plan suggestie"
                    onClick={function () { setOpen(false); }}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9100,
                        background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
                    }}
                >
                    <div
                        onClick={function (e) { e.stopPropagation(); }}
                        style={{
                            width: 'min(560px, 96vw)', maxHeight: '90vh',
                            background: 'var(--card-solid, #15151a)',
                            border: '1px solid var(--border, #2a2a30)',
                            borderRadius: 16, overflow: 'hidden',
                            display: 'flex', flexDirection: 'column',
                        }}
                    >
                        <div style={{
                            padding: '16px 20px', borderBottom: '1px solid var(--border, #2a2a30)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Sparkles size={16} style={{ color: GOLD }} />
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>AI Floor-plan voorstel</div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Geen auto-save — review eerst, dan sleep of accepteer.</div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={function () { setOpen(false); }}
                                aria-label="Sluit"
                                style={{
                                    background: 'transparent', border: 'none', color: 'var(--muted)',
                                    cursor: 'pointer', padding: 8, minWidth: 44, minHeight: 44,
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ padding: 20, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <Field label="Aantal gasten">
                                <input
                                    type="number"
                                    min={1}
                                    max={500}
                                    value={headcount}
                                    onChange={function (e) { setHeadcount(parseInt(e.target.value, 10) || 0); }}
                                    style={inputStyle}
                                />
                            </Field>
                            <Field label="Event-type">
                                <select
                                    value={eventType}
                                    onChange={function (e) { setEventType(e.target.value); }}
                                    style={inputStyle}
                                >
                                    <option>BBQ</option>
                                    <option>Bruiloft</option>
                                    <option>Verjaardag</option>
                                    <option>Zakelijk borrel</option>
                                    <option>Festival</option>
                                    <option>Family-style buffet</option>
                                </select>
                            </Field>
                            <Field label="Locatie-context (optioneel)">
                                <textarea
                                    rows={3}
                                    value={venueNote}
                                    onChange={function (e) { setVenueNote(e.target.value); }}
                                    placeholder="Bv. tuin 15x20m, ingang noord, hoge bomen aan oostkant"
                                    style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
                                />
                            </Field>

                            {preview && (
                                <div style={{
                                    padding: 12, borderRadius: 10,
                                    background: 'rgba(196,163,90,.05)',
                                    border: '1px solid rgba(196,163,90,.25)',
                                }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 8 }}>
                                        Voorstel — {preview.shapes.length} shape{preview.shapes.length === 1 ? '' : 's'}
                                    </div>
                                    {preview.reasoning && (
                                        <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, margin: 0, marginBottom: 8 }}>
                                            {preview.reasoning}
                                        </p>
                                    )}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        {preview.shapes.slice(0, 12).map(function (s, i) {
                                            return (
                                                <span key={i} style={{
                                                    fontSize: 10, padding: '2px 6px', borderRadius: 4,
                                                    background: 'rgba(255,255,255,.04)',
                                                    border: '1px solid var(--border)',
                                                    color: 'var(--muted)',
                                                }}>
                                                    {s.label || s.kind}
                                                </span>
                                            );
                                        })}
                                        {preview.shapes.length > 12 && (
                                            <span style={{ fontSize: 10, color: 'var(--muted)' }}>+{preview.shapes.length - 12} meer</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{
                            padding: 16, borderTop: '1px solid var(--border, #2a2a30)',
                            display: 'flex', gap: 8, justifyContent: 'flex-end',
                        }}>
                            <button
                                type="button"
                                onClick={function () { setOpen(false); }}
                                style={{
                                    padding: '10px 16px', borderRadius: 8, minHeight: 44,
                                    background: 'transparent', color: 'var(--text)',
                                    border: '1px solid var(--border)', fontSize: 12, fontWeight: 600,
                                }}
                            >
                                Annuleren
                            </button>
                            {preview ? (
                                <button
                                    type="button"
                                    onClick={apply}
                                    style={{
                                        padding: '10px 16px', borderRadius: 8, minHeight: 44,
                                        background: GOLD, color: '#000', border: 'none',
                                        fontSize: 12, fontWeight: 700,
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                    }}
                                >
                                    <Wand2 size={14} /> Plaats op canvas
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={run}
                                    disabled={loading}
                                    style={{
                                        padding: '10px 16px', borderRadius: 8, minHeight: 44,
                                        background: GOLD, color: '#000', border: 'none',
                                        fontSize: 12, fontWeight: 700,
                                        opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                    }}
                                >
                                    {loading ? <><Loader2 size={14} className="spin" /> Denkt na...</> : <><Sparkles size={14} /> Genereer</>}
                                </button>
                            )}
                        </div>

                        <style>{`
                            .spin { animation: spin 1s linear infinite; }
                            @keyframes spin { to { transform: rotate(360deg); } }
                        `}</style>
                    </div>
                </div>
            )}
        </>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    background: 'var(--bg, #0a0a0d)', color: 'var(--text)',
    border: '1px solid var(--border)', fontSize: 13, outline: 'none',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>{label}</span>
            {children}
        </label>
    );
}
