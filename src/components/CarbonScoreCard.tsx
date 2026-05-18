'use client';

/**
 * CarbonScoreCard — herbruikbare ESG-tile voor offerte-wizard en /q/[id].
 *
 * Pillar #2 + 2026-trend (Catering Today). Toont per-portie g CO₂e + score-grade
 * (A-D), top-3 ingredient bijdrage en lege-state als data ontbreekt.
 *
 * Server-prop: ingrediënten-lijst. Geen AI-call, alles via statische factor-
 * tabel in lib/carbonFootprint.ts.
 */

import { useMemo } from 'react';
import { Leaf } from 'lucide-react';
import { estimateCarbon, formatCarbon, SCORE_LABELS } from '@/lib/carbonFootprint';

interface CarbonIngredient {
    naam: string;
    hoeveelheid?: number;
    eenheid?: string;
}

interface Props {
    /** Lijst ingrediënten per portie (uit gerechten.ingredienten samengevoegd). */
    ingredients: CarbonIngredient[];
    /** Compact = kleine inline-pill; default = volledige card met breakdown. */
    variant?: 'compact' | 'card';
    /** Aantal gasten — als gezet, toont ook totale event-CO2e. */
    gasten?: number;
}

export default function CarbonScoreCard({ ingredients, variant = 'card', gasten }: Props) {
    const result = useMemo(function () {
        return estimateCarbon(ingredients);
    }, [ingredients]);

    if (result.matched_count === 0) {
        if (variant === 'compact') return null;
        return (
            <div style={{
                padding: '10px 14px', borderRadius: 8,
                border: '1px dashed var(--border)',
                color: 'var(--muted)', fontSize: 11,
                display: 'flex', alignItems: 'center', gap: 8,
            }}>
                <Leaf size={12} />
                Eco-score onbekend — onvoldoende ingredient-data.
            </div>
        );
    }

    const meta = SCORE_LABELS[result.score];

    if (variant === 'compact') {
        return (
            <span
                title={`${formatCarbon(result.total_g_per_pp)} per portie · ${meta.label}`}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 9px', borderRadius: 999,
                    background: meta.color + '18', color: meta.color,
                    border: '1px solid ' + meta.color + '40',
                    fontSize: 10, fontWeight: 700, letterSpacing: '.02em',
                }}
            >
                <Leaf size={10} /> Eco {result.score}
            </span>
        );
    }

    const totalEvent = gasten && gasten > 0 ? gasten * result.total_g_per_pp : null;

    return (
        <div style={{
            padding: 14, borderRadius: 12,
            background: 'linear-gradient(135deg, ' + meta.color + '10, transparent 70%)',
            border: '1px solid ' + meta.color + '35',
            display: 'flex', flexDirection: 'column', gap: 10,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: meta.color + '25', color: meta.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display, inherit)',
                    }}>
                        {result.score}
                    </div>
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.15em' }}>
                            Eco-score
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: meta.color }}>
                            {meta.label}
                        </div>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>Per portie</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCarbon(result.total_g_per_pp)}
                    </div>
                </div>
            </div>

            {totalEvent != null && (
                <div style={{
                    fontSize: 11, color: 'var(--muted)',
                    paddingTop: 8, borderTop: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <span>Totaal event ({gasten} gasten)</span>
                    <strong style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCarbon(totalEvent)}
                    </strong>
                </div>
            )}

            {result.breakdown.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.15em' }}>
                        Top bijdrage
                    </div>
                    {result.breakdown.slice(0, 3).map(function (b) {
                        const pct = result.total_g_per_pp > 0 ? (b.g_per_pp / result.total_g_per_pp) * 100 : 0;
                        return (
                            <div key={b.naam} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                fontSize: 11, color: 'var(--text)',
                            }}>
                                <span style={{ flex: 1, textTransform: 'capitalize' }}>{b.naam}</span>
                                <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(pct)}%</span>
                                <div style={{
                                    width: 60, height: 4, background: 'var(--border)', borderRadius: 999, overflow: 'hidden',
                                }}>
                                    <div style={{
                                        width: pct + '%', height: '100%',
                                        background: meta.color, borderRadius: 999,
                                    }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
