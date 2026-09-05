'use client';

import { Sparkles, X, Loader2 } from 'lucide-react';
import type { Gerecht } from '@/types';

import { formatEur } from '@/lib/format';

interface Props {
    gangNaam: string;
    loading: boolean;
    error?: string;
    suggesties: Array<{ gerecht_id: string; redenering: string }>;
    gerechtById: Map<string, Gerecht>;
    onClose: () => void;
    onAccept: (gerechtId: string) => void;
}

export default function AiSuggestionsSheet({ gangNaam, loading, error, suggesties, gerechtById, onClose, onAccept }: Props) {
    return (
        <div className="mr-modal-scrim" onClick={onClose} role="presentation">
            <div onClick={e => e.stopPropagation()} style={{
                position: 'fixed', right: 0, top: 0, bottom: 0, width: '95%', maxWidth: 480,
                background: 'var(--surface)', borderLeft: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column',
            }}>
                <div style={{
                    padding: 14, borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <Sparkles size={16} color="var(--brand, #c4a35a)" />
                    <h3 style={{ margin: 0, flex: 1, fontSize: 15 }}>AI-voorstellen voor {gangNaam}</h3>
                    <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
                        <X size={16} />
                    </button>
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
                    {loading && (
                        <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                            <Loader2 size={20} className="animate-spin" /> Voorstellen ophalen…
                        </div>
                    )}
                    {error && (
                        <div style={{ padding: 14, background: 'rgba(220,50,47,.07)', border: '1px solid rgba(220,50,47,.25)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}>
                            Kon geen voorstellen ophalen: {error}
                        </div>
                    )}
                    {!loading && !error && suggesties.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 13 }}>
                            Geen voorstellen — voeg eerst meer gerechten toe aan je bibliotheek.
                        </div>
                    )}
                    {suggesties.map(s => {
                        const g = gerechtById.get(s.gerecht_id);
                        const prijs = g ? Number(g.verkoopprijs ?? 0) : 0;
                        return (
                            <div key={s.gerecht_id} style={{
                                padding: 12, marginBottom: 10, border: '1px solid var(--border)',
                                borderRadius: 8,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                    <h4 style={{ margin: 0, fontSize: 14, flex: 1 }}>{g?.naam ?? '(onbekend gerecht)'}</h4>
                                    {g && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{formatEur(prijs)} p.p.</span>}
                                </div>
                                {s.redenering && (
                                    <p style={{ marginTop: 6, marginBottom: 8, fontSize: 12, color: 'var(--muted)' }}>{s.redenering}</p>
                                )}
                                <button
                                    type="button"
                                    onClick={() => onAccept(s.gerecht_id)}
                                    disabled={!g}
                                    style={{
                                        padding: '6px 10px', border: 'none', borderRadius: 4,
                                        background: g ? 'var(--brand, #c4a35a)' : 'var(--muted)',
                                        color: '#1a1a1e', cursor: g ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600,
                                    }}
                                >
                                    Voeg toe
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
