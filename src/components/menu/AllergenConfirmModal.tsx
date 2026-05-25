/* ═══════════════════════════════════════════════════════════════
   AllergenConfirmModal — Bevestig/verwerp AI-gedetecteerde allergenen
   Bucket C P0-4. Wordt geopend door _client.tsx na saveGerecht als
   er ai_suggested=true AND confirmed_at IS NULL rijen zijn.
   Banner blijft als fallback wanneer modal is gesloten.
   ═══════════════════════════════════════════════════════════════ */

'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldCheck, X, Check } from 'lucide-react';
import { MRButton } from './atoms';

export interface AllergenRow {
    /* Unieke key per chip — kan allergen_code + source-id zijn. */
    id: string;
    /* Display naam, bv "Gluten", "Lactose". */
    allergen: string;
    /* Optioneel: waarom AI dit dacht (component-bron + gerecht). */
    source?: string;
    /* AI-confidence 0..100. */
    confidence?: number;
}

interface Props {
    open: boolean;
    onClose: () => void;
    rows: AllergenRow[];
    /* Wordt aangeroepen met arrays van bevestigde + verworpen ID's
       zodra de gebruiker op "Klaar" klikt. Server-action regelt
       confirmed_at SET / DELETE. */
    onSubmit: (decisions: { confirmed: string[]; rejected: string[] }) => Promise<void> | void;
}

export function AllergenConfirmModal({ open, onClose, rows, onSubmit }: Props) {
    const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
    const [rejected, setRejected] = useState<Set<string>>(new Set());
    const [submitting, setSubmitting] = useState(false);

    /* Reset bij open/sluit */
    useEffect(() => {
        if (open) {
            setConfirmed(new Set());
            setRejected(new Set());
            setSubmitting(false);
        }
    }, [open]);

    /* Escape sluit modal */
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const total = rows.length;
    const done = confirmed.size + rejected.size;
    const allDone = total > 0 && done === total;

    const toggleConfirm = (id: string) => {
        setConfirmed((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
        setRejected((p) => { const n = new Set(p); n.delete(id); return n; });
    };
    const toggleReject = (id: string) => {
        setRejected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
        setConfirmed((p) => { const n = new Set(p); n.delete(id); return n; });
    };

    const handleSubmit = async (confirmAll = false) => {
        setSubmitting(true);
        try {
            const finalConfirmed = confirmAll
                ? rows.filter((r) => !rejected.has(r.id)).map((r) => r.id)
                : Array.from(confirmed);
            await onSubmit({ confirmed: finalConfirmed, rejected: Array.from(rejected) });
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mr-modal-scrim" onClick={onClose} role="presentation">
            <div
                className="mr-allergen-modal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="allergen-modal-title"
            >
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <ShieldCheck size={20} color="var(--amber, #f59e0b)" />
                            <h3 id="allergen-modal-title" style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, margin: 0 }}>
                                AI detecteerde {total} {total === 1 ? 'allergeen' : 'allergenen'}
                            </h3>
                        </div>
                        <button
                            onClick={onClose}
                            aria-label="Sluit"
                            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
                        >
                            <X size={18} />
                        </button>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 0' }}>
                        Bevestig of verwerp elk gedetecteerd allergeen. Cascading vanuit gekoppelde componenten.
                    </p>

                    {/* Progress */}
                    <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
                            <span>{done} van {total} beoordeeld</span>
                            <span style={{ fontWeight: 600, color: allDone ? 'var(--green, #22c55e)' : 'var(--text)' }}>
                                {total > 0 ? Math.round((done / total) * 100) : 0}%
                            </span>
                        </div>
                        <div style={{ height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 3, overflow: 'hidden' }}>
                            <div
                                style={{
                                    height: '100%',
                                    width: `${total > 0 ? (done / total) * 100 : 0}%`,
                                    background: allDone ? 'var(--green, #22c55e)' : 'var(--brand)',
                                    borderRadius: 3,
                                    transition: 'width .3s',
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Chips */}
                <div style={{ padding: '16px 24px', maxHeight: 360, overflowY: 'auto' }}>
                    {rows.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                            Geen openstaande AI-suggesties.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {rows.map((row) => {
                                const isConf = confirmed.has(row.id);
                                const isRej = rejected.has(row.id);
                                return (
                                    <div
                                        key={row.id}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            padding: '12px 16px', borderRadius: 10,
                                            background: isConf ? 'rgba(34,197,94,.05)' : isRej ? 'rgba(239,68,68,.05)' : 'var(--bg-subtle)',
                                            border: `1px solid ${isConf ? 'rgba(34,197,94,.25)' : isRej ? 'rgba(239,68,68,.25)' : 'var(--border)'}`,
                                            transition: 'all .2s',
                                        }}
                                    >
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 8,
                                            background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                        }}>
                                            <AlertTriangle size={16} color="#fbbf24" />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: '#fbbf24' }}>{row.allergen}</div>
                                            {row.source && (
                                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{row.source}</div>
                                            )}
                                            {row.confidence != null && (
                                                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                                                    Confidence: {row.confidence}%
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                            <button
                                                onClick={() => toggleConfirm(row.id)}
                                                style={{
                                                    padding: '6px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                                                    cursor: 'pointer', border: '1px solid', fontFamily: 'var(--font-sans)',
                                                    background: isConf ? 'rgba(34,197,94,.15)' : 'transparent',
                                                    borderColor: isConf ? 'rgba(34,197,94,.3)' : 'var(--border)',
                                                    color: isConf ? 'var(--green, #22c55e)' : 'var(--text)',
                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                }}
                                            >
                                                <Check size={12} /> Bevestig
                                            </button>
                                            <button
                                                onClick={() => toggleReject(row.id)}
                                                style={{
                                                    padding: '6px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                                                    cursor: 'pointer', border: '1px solid', fontFamily: 'var(--font-sans)',
                                                    background: isRej ? 'rgba(239,68,68,.15)' : 'transparent',
                                                    borderColor: isRej ? 'rgba(239,68,68,.3)' : 'var(--border)',
                                                    color: isRej ? 'var(--red, #ef4444)' : 'var(--text)',
                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                }}
                                            >
                                                <X size={12} /> Verwerp
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px', borderTop: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                }}>
                    <MRButton variant="ghost" onClick={onClose}>Later beoordelen</MRButton>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <MRButton variant="ghost" onClick={() => handleSubmit(false)} disabled={submitting || done === 0}>
                            Mijn keuzes opslaan
                        </MRButton>
                        <MRButton
                            variant="primary"
                            icon={<CheckCircle2 size={14} />}
                            onClick={() => handleSubmit(true)}
                            disabled={submitting}
                        >
                            Bevestig alles
                        </MRButton>
                    </div>
                </div>
            </div>
        </div>
    );
}
