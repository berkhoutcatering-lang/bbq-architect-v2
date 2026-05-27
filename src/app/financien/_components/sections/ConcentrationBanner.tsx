'use client';
/* ConcentrationBanner — Pillar #4 (Raise / Performance)
   >30% omzet uit één klant = waarschuwing met diversificatie-advies. KvK MKB-Risico-Index 2025 drempel. */

import { useMemo } from 'react';
import { AlertTriangle, MessageCircle } from 'lucide-react';
import { computeConcentration, type FactuurMin } from '@/lib/financeAnalytics';

interface Props {
    facturen: FactuurMin[];
}

export default function ConcentrationBanner({ facturen }: Props) {
    const conc = useMemo(() => computeConcentration(facturen), [facturen]);

    if (!conc.warning || !conc.top_client) return null;

    function askChat() {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent('open-chat-panel', {
            detail: {
                page: '/financien',
                prompt: `${conc.top_client_pct}% van mijn omzet komt uit ${conc.top_client}. Hoe verdeel ik mijn klantenbestand beter? Welke segmenten in catering blijven onderbenut?`,
            },
        }));
    }

    return (
        <div
            data-testid="concentration-banner"
            style={{
                background: 'linear-gradient(135deg, rgba(239,68,68,.08), rgba(239,68,68,.02))',
                border: '1px solid rgba(239,68,68,.25)',
                borderRadius: 14,
                padding: '16px 20px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
            }}
        >
            <div
                style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
            >
                <AlertTriangle size={18} color="var(--red)" />
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>
                    Klant-concentratie boven 30%
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>
                    <strong>{conc.top_client_pct}%</strong> van je YTD-omzet komt uit <strong>{conc.top_client}</strong> (€{conc.top_client_omzet.toLocaleString('nl-NL')}).
                    Bij wegvallen van deze klant zakt je omzet hard. KvK MKB-Risico-Index 2025 markeert &gt;30% als verhoogd risico.
                </div>
                {conc.top3.length > 1 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {conc.top3.map((c, i) => (
                            <span
                                key={i}
                                style={{
                                    fontSize: 11,
                                    padding: '3px 8px',
                                    borderRadius: 999,
                                    background: i === 0 ? 'rgba(239,68,68,.1)' : 'rgba(130,130,130,.08)',
                                    border: `1px solid ${i === 0 ? 'rgba(239,68,68,.25)' : 'var(--border)'}`,
                                    color: i === 0 ? 'var(--red)' : 'var(--muted)',
                                    fontWeight: 500,
                                }}
                            >
                                {c.naam}: {c.pct}%
                            </span>
                        ))}
                    </div>
                )}
            </div>
            <button
                data-testid="concentration-ask-ai"
                onClick={askChat}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 8, minHeight: 36,
                    background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.25)',
                    color: 'var(--purple)', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                }}
            >
                <MessageCircle size={12} /> Vraag AI om advies
            </button>
        </div>
    );
}
