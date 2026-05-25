/* ═══════════════════════════════════════════════════════════════
   FoodcostImpactModal — Pillar GP-4 (2026-05-25)
   Toont preview-impact van een component-prijswijziging op alle
   gerechten die deze component gebruiken. Apicbase-tier feature:
   Tripleseat/Caterease propageren stilzwijgend, wij maken het
   zichtbaar zodat de chef bewust kan beslissen.
   ═══════════════════════════════════════════════════════════════ */

'use client';

import { useEffect } from 'react';
import { AlertTriangle, ArrowRight, Calculator, TrendingDown, TrendingUp, X } from 'lucide-react';
import { MRButton, MREyebrow } from './atoms';
import { fmtEuro } from './helpers';

export interface FoodcostImpactRow {
    gerecht_id: string;
    naam: string;
    old_total_cost_cents: number;
    new_total_cost_cents: number;
    diff_cents: number;
    verkoopprijs_eur: number | null;
    margin_diff_pct: number | null;
}

export interface FoodcostImpactPayload {
    component: {
        id: number;
        name: string;
        old_base_cost_cents: number;
        new_base_cost_cents: number;
        base_quantity: number;
        base_unit: string;
    };
    affected_count: number;
    impacts: FoodcostImpactRow[];
    totals: {
        total_old_cost_cents: number;
        total_new_cost_cents: number;
        total_diff_cents: number;
    };
}

interface Props {
    open: boolean;
    payload: FoodcostImpactPayload | null;
    onClose: () => void;
    /* Aangeroepen wanneer user "Doorvoeren" klikt. Parent doet de daadwerkelijke
       PATCH naar /api/components/[id] + recompute downstream. */
    onConfirm: () => Promise<void> | void;
    /* Loading-state tijdens commit (PATCH in flight). */
    committing?: boolean;
}

function centsToEuro(c: number): string {
    return fmtEuro(c / 100);
}

export function FoodcostImpactModal({ open, payload, onClose, onConfirm, committing = false }: Props) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !committing) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose, committing]);

    if (!open || !payload) return null;

    const { component, affected_count, impacts, totals } = payload;
    const totalDiffCents = totals.total_diff_cents;
    const isIncrease = totalDiffCents > 0;
    const top5 = impacts.slice(0, 5);
    const restCount = Math.max(0, impacts.length - 5);

    /* Max abs diff voor relative bar-width — geeft visuele schaal aan. */
    const maxAbsDiff = Math.max(...impacts.map(i => Math.abs(i.diff_cents)), 1);

    return (
        <div className="mr-modal-scrim" onClick={committing ? undefined : onClose} role="presentation">
            <div
                className="mr-bedenker-modal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="foodcost-modal-title"
                style={{ width: 620 }}
            >
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Calculator size={20} color={isIncrease ? 'var(--amber, #f59e0b)' : 'var(--green, #22c55e)'} />
                            <div>
                                <h3 id="foodcost-modal-title" style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, margin: 0 }}>
                                    Prijswijziging effect
                                </h3>
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                                    {component.name}: {centsToEuro(component.old_base_cost_cents)} → {centsToEuro(component.new_base_cost_cents)} per {component.base_quantity}{component.base_unit}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            disabled={committing}
                            aria-label="Sluit"
                            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: committing ? 'not-allowed' : 'pointer', opacity: committing ? 0.5 : 1 }}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Summary */}
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                    <div className="mr-detail-stat">
                        <MREyebrow>Geraakte gerechten</MREyebrow>
                        <div style={{ marginTop: 6, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500 }}>{affected_count}</div>
                    </div>
                    <div className="mr-detail-stat">
                        <MREyebrow>Totale impact</MREyebrow>
                        <div style={{
                            marginTop: 6, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500,
                            color: isIncrease ? 'var(--amber, #f59e0b)' : 'var(--green, #22c55e)',
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                            {isIncrease ? '+' : ''}{centsToEuro(totalDiffCents)}
                        </div>
                    </div>
                    <div className="mr-detail-stat">
                        <MREyebrow>Component-impact</MREyebrow>
                        <div style={{ marginTop: 6, fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isIncrease ? <TrendingUp size={14} color="var(--amber, #f59e0b)" /> : <TrendingDown size={14} color="var(--green, #22c55e)" />}
                            <span>{isIncrease ? 'Marge daalt' : 'Marge stijgt'}</span>
                        </div>
                    </div>
                </div>

                {/* Top-5 impacts */}
                <div style={{ padding: '16px 24px', maxHeight: 320, overflowY: 'auto' }}>
                    <MREyebrow style={{ marginBottom: 10 }}>
                        Top {top5.length} grootste impact{restCount > 0 ? ` (+ ${restCount} meer)` : ''}
                    </MREyebrow>
                    {top5.length === 0 ? (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                            Geen gerechten gebruiken deze component nog.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {top5.map((row) => {
                                const isUp = row.diff_cents > 0;
                                const barPct = Math.min(100, (Math.abs(row.diff_cents) / maxAbsDiff) * 100);
                                return (
                                    <div
                                        key={row.gerecht_id}
                                        style={{
                                            padding: '10px 12px', borderRadius: 8,
                                            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.naam}</span>
                                            <span style={{
                                                fontSize: 12, fontWeight: 600,
                                                color: isUp ? 'var(--amber, #f59e0b)' : 'var(--green, #22c55e)',
                                                fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                                            }}>
                                                {isUp ? '+' : ''}{centsToEuro(row.diff_cents)}
                                                {row.margin_diff_pct != null && (
                                                    <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.8 }}>
                                                        ({row.margin_diff_pct > 0 ? '+' : ''}{row.margin_diff_pct}% marge)
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                        {/* Mini-sparkline: relative bar */}
                                        <div style={{ marginTop: 6, height: 3, background: 'rgba(255,255,255,.04)', borderRadius: 2, overflow: 'hidden' }}>
                                            <div
                                                style={{
                                                    height: '100%',
                                                    width: `${barPct}%`,
                                                    background: isUp ? 'var(--amber, #f59e0b)' : 'var(--green, #22c55e)',
                                                    transition: 'width .3s',
                                                }}
                                            />
                                        </div>
                                        <div style={{ marginTop: 4, fontSize: 10, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Component-kost: {centsToEuro(row.old_total_cost_cents)} → {centsToEuro(row.new_total_cost_cents)}</span>
                                            {row.verkoopprijs_eur != null && <span>Verkoop: {fmtEuro(row.verkoopprijs_eur)}</span>}
                                        </div>
                                    </div>
                                );
                            })}
                            {restCount > 0 && (
                                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)', textAlign: 'center', fontStyle: 'italic' }}>
                                    + {restCount} kleinere impacts (samen {centsToEuro(impacts.slice(5).reduce((s, i) => s + i.diff_cents, 0))})
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Warning bij grote impact */}
                {Math.abs(totalDiffCents) > 1000 && (
                    <div style={{
                        margin: '0 24px 16px', padding: '10px 12px', borderRadius: 8,
                        background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.25)',
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        fontSize: 12, color: 'var(--text)',
                    }}>
                        <AlertTriangle size={14} color="var(--amber, #f59e0b)" style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>
                            Significante impact ({centsToEuro(Math.abs(totalDiffCents))}). Overweeg verkoopprijzen
                            te herzien — de marge-shift is automatisch maar verkoopprijzen passen we niet aan.
                        </span>
                    </div>
                )}

                {/* Footer acties */}
                <div style={{
                    padding: '16px 24px', borderTop: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                }}>
                    <MRButton variant="ghost" onClick={onClose} disabled={committing}>
                        Annuleren
                    </MRButton>
                    <MRButton
                        variant="primary"
                        icon={<ArrowRight size={14} />}
                        onClick={onConfirm}
                        disabled={committing}
                    >
                        {committing ? 'Bezig met opslaan…' : `Doorvoeren${affected_count > 0 ? ` (${affected_count} gerechten)` : ''}`}
                    </MRButton>
                </div>
            </div>
        </div>
    );
}
