'use client';
/* KiaScenarioModal — Bucket J P0.8
   Drie KIA-scenario's zij-aan-zij Brex-style. Server-side calc via kia.ts —
   geen AI. Disclaimer pink banner permanent.

   Pillar #1 (Server-truth): bedragen komen van /api/financien/kia-scenario.
   Pillar #3 (Boekhouder-beslist): chip onder elke scenario-card. */

import { useEffect, useState, useCallback } from 'react';
import { X, Sparkles, Send, Info, Check, ShieldCheck } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ScenarioResponse {
    label: string;
    description: string;
    investment_amount: number;
    kia_aftrek: number;
    bracket: string;
    indicative_tax_saving: number;
    extra_investment: number;
    extra_tax_saving: number;
    message: string;
}

interface KiaApiResponse {
    kia_aftrek: number;
    bracket_hit: string;
    bracket_label: string;
    indicative_tax_saving: number;
    message: string;
    scenarios: ScenarioResponse[];
}

interface Props {
    open: boolean;
    onClose: () => void;
    /** Huidige cumulatieve investeringsbedrag (default uit context). */
    initialAmount?: number;
    /** Optioneel: callback wanneer scenario doorgestuurd wordt naar boekhouder. */
    onSendToBookkeeper?: (scenario: ScenarioResponse) => void;
}

function euro(n: number): string {
    return '€' + Math.round(n).toLocaleString('nl-NL');
}

export default function KiaScenarioModal({ open, onClose, initialAmount = 0, onSendToBookkeeper }: Props) {
    const [data, setData] = useState<KiaApiResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const dialogRef = useFocusTrap(open);

    const fetchScenarios = useCallback(async (amount: number) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/financien/kia-scenario', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ investment_amount: amount }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${res.status}`);
            }
            const body = await res.json();
            setData(body);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) fetchScenarios(initialAmount);
    }, [open, initialAmount, fetchScenarios]);

    useEffect(() => {
        if (!open) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <>
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
                    backdropFilter: 'blur(6px)', zIndex: 9998,
                }}
            />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="kia-modal-title"
                style={{
                    position: 'fixed', top: '50%', left: '50%',
                    transform: 'translate(-50%,-50%)', width: 960,
                    maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
                    background: 'var(--bg-elevated, #16161a)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-2xl, 18px)', zIndex: 9999,
                    boxShadow: '0 32px 80px rgba(0,0,0,.6)',
                }}
                data-testid="kia-scenario-modal"
            >
                <div style={{ padding: '20px 24px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                background: 'rgba(167,139,250,.12)', border: '1px solid rgba(167,139,250,.3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Sparkles size={16} color="var(--purple)" />
                            </div>
                            <div>
                                <div id="kia-modal-title" style={{ fontSize: 18, fontWeight: 600 }}>Kan ik investeren?</div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>KIA Scenario&apos;s 2026</div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            aria-label="Sluiten"
                            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 8, minWidth: 44, minHeight: 44 }}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Current status banner */}
                    {data && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                            marginBottom: 16, background: 'rgba(130,130,130,.05)',
                            border: '1px solid var(--border)', borderRadius: 10, fontSize: 13,
                        }}>
                            <Sparkles size={14} color="var(--muted)" />
                            <span style={{ color: 'var(--muted)' }}>
                                Huidige investering: <strong style={{ color: 'var(--text)' }}>{euro(initialAmount)}</strong>
                                {' '}— bracket <strong style={{ color: 'var(--text)' }}>{data.bracket_label}</strong>
                                {' '}→ aftrek <strong style={{ color: 'var(--purple)' }}>{euro(data.kia_aftrek)}</strong>
                            </span>
                        </div>
                    )}

                    {/* Loading / Error */}
                    {loading && (
                        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                            Scenario&apos;s berekenen…
                        </div>
                    )}
                    {error && (
                        <div style={{ padding: '16px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 10, color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>
                            Fout: {error}
                        </div>
                    )}

                    {/* 3 Scenario cards */}
                    {data && !loading && (
                        <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                            gap: 14, marginBottom: 16,
                        }}>
                            {data.scenarios.map((sc, idx) => {
                                const isMax = idx === 1;
                                return (
                                    <div
                                        key={idx}
                                        data-testid={`kia-scenario-${idx}`}
                                        style={{
                                            background: isMax ? 'rgba(167,139,250,.06)' : 'var(--card, rgba(255,255,255,.02))',
                                            border: `1px solid ${isMax ? 'rgba(167,139,250,.25)' : 'var(--border)'}`,
                                            borderRadius: 'var(--radius-xl, 14px)',
                                            padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 12,
                                            position: 'relative',
                                        }}
                                    >
                                        <div style={{
                                            fontSize: 10, fontWeight: 700, letterSpacing: '.12em',
                                            textTransform: 'uppercase',
                                            color: isMax ? 'var(--purple)' : 'var(--muted)',
                                        }}>
                                            {sc.label}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sc.description}</div>

                                        <div>
                                            <div style={{
                                                fontSize: 10, color: 'var(--muted)', letterSpacing: '.08em',
                                                textTransform: 'uppercase', fontWeight: 600, marginBottom: 4,
                                            }}>
                                                KIA Aftrek
                                            </div>
                                            <div style={{
                                                fontFamily: 'var(--font-mono, ui-monospace)', fontSize: 26, fontWeight: 700,
                                                color: isMax ? 'var(--purple)' : 'var(--text)',
                                                fontVariantNumeric: 'tabular-nums',
                                            }}>
                                                {euro(sc.kia_aftrek)}
                                            </div>
                                        </div>

                                        <div style={{
                                            padding: '8px 12px', background: 'rgba(34,197,94,.06)',
                                            border: '1px solid rgba(34,197,94,.15)', borderRadius: 8,
                                        }}>
                                            <div style={{
                                                fontSize: 10, color: 'var(--muted)', fontWeight: 600,
                                                letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 2,
                                            }}>
                                                Indicatief bespaard (37%)
                                            </div>
                                            <div style={{
                                                fontFamily: 'var(--font-mono, ui-monospace)', fontSize: 16, fontWeight: 700,
                                                color: 'var(--green)', fontVariantNumeric: 'tabular-nums',
                                            }}>
                                                {euro(sc.indicative_tax_saving)}
                                            </div>
                                        </div>

                                        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                                            {sc.message}
                                        </div>

                                        {sc.extra_investment > 0 && (
                                            <div style={{ fontSize: 11, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Info size={12} /> Nog {euro(sc.extra_investment)} extra investeren
                                            </div>
                                        )}

                                        {idx === 0 && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
                                                <Check size={12} color="var(--green)" /> Huidige situatie
                                            </div>
                                        )}

                                        {/* Pillar #3 — Boekhouder-beslist-chip permanent */}
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: 'var(--muted)', background: 'rgba(130,130,130,.08)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px', alignSelf: 'flex-start' }}>
                                            <ShieldCheck size={10} /> Boekhouder beslist
                                        </div>

                                        <div style={{ marginTop: 'auto', paddingTop: 4 }}>
                                            <button
                                                data-testid={`kia-send-${idx}`}
                                                onClick={() => onSendToBookkeeper?.(sc)}
                                                style={{
                                                    width: '100%', minHeight: 44,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                    padding: '10px 14px', borderRadius: 10,
                                                    background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.25)',
                                                    color: 'var(--purple)', fontSize: 12, fontWeight: 600,
                                                    cursor: 'pointer', fontFamily: 'inherit', transition: '.15s',
                                                }}
                                            >
                                                <Send size={12} /> Stuur naar boekhouder
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Permanent disclaimer */}
                    <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
                        background: 'rgba(244,114,182,.06)', border: '1px solid rgba(244,114,182,.18)',
                        borderRadius: 10,
                    }}>
                        <Info size={14} color="#f472b6" style={{ marginTop: 1, flexShrink: 0 }} />
                        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                            Indicaties op basis van{' '}
                            <a
                                href="https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/winst/inkomstenbelasting/veranderingen-inkomstenbelasting-2026/investeringsaftrek-2026/kleinschaligheidsinvesteringsaftrek-2026"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#f472b6', textDecoration: 'underline' }}
                            >
                                KIA-tabel 2026
                            </a>
                            {' '}(Belastingdienst). Geen fiscaal advies — boekhouder verifieert. Belasting-besparing op default 37% IB-tarief — werkelijke besparing hangt af van je hele winst-positie.
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
