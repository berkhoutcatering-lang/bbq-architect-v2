'use client';

/**
 * InkooplijstButton — Pillar #4 (Inkooplijst-uit-event)
 *
 * Genereert per-leverancier concept_inkoop_orders rijen vanuit een event.
 * Roept Server Action generateInkooplijstFromEvent aan en toont per-supplier
 * count + total. Bij succes: link naar /inkoop voor PDF/UBL-export.
 */

import { useState, useTransition } from 'react';
import { ShoppingCart, Check, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import {
    generateInkooplijstFromEvent,
    type GenerateInkooplijstResult,
} from '@/app/price-intelligence/_actions';

interface Props {
    eventId: number;
    accentColor?: string;
}

export default function InkooplijstButton({ eventId, accentColor }: Props) {
    const [isPending, startTransition] = useTransition();
    const [result, setResult] = useState<GenerateInkooplijstResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    function trigger() {
        setError(null);
        startTransition(async () => {
            const res = await generateInkooplijstFromEvent({
                eventId,
                splitMode: 'default-supplier',
            });
            if (res.error) {
                setError(res.error);
                setResult(null);
            } else if (res.data) {
                setResult(res.data);
            }
        });
    }

    const color = accentColor ?? 'var(--color-accent-gold, #d97706)';

    if (result) {
        return (
            <div
                style={{
                    padding: 12,
                    borderRadius: 10,
                    background: '#16a34a14',
                    border: '1px solid #16a34a40',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#16a34a', fontWeight: 700, marginBottom: 6 }}>
                    <Check size={14} />
                    Inkooplijst gegenereerd
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {result.perSupplier.map((s) => (
                        <li
                            key={s.concept_order_id}
                            style={{
                                fontSize: 12,
                                display: 'grid',
                                gridTemplateColumns: '1fr auto auto',
                                gap: 8,
                                padding: '4px 0',
                            }}
                        >
                            <span style={{ fontWeight: 600 }}>{s.leverancier_naam}</span>
                            <span style={{ color: 'var(--muted, #94a3b8)' }}>{s.line_count} regels</span>
                            <span style={{ fontWeight: 600 }}>€ {s.total_incl.toFixed(2)}</span>
                        </li>
                    ))}
                </ul>
                <Link
                    href="/inkoop"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        color: color,
                        textDecoration: 'none',
                    }}
                >
                    Open in /inkoop voor PDF/UBL →
                </Link>
            </div>
        );
    }

    if (error) {
        return (
            <div
                style={{
                    padding: 12,
                    borderRadius: 10,
                    background: '#7f1d1d22',
                    border: '1px solid #7f1d1d40',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#fca5a5' }}>
                    <AlertCircle size={14} />
                    {error}
                </div>
                <button
                    type="button"
                    onClick={trigger}
                    style={{
                        marginTop: 8,
                        padding: '5px 10px',
                        background: 'transparent',
                        border: '1px solid #7f1d1d',
                        borderRadius: 4,
                        color: '#fca5a5',
                        cursor: 'pointer',
                        fontSize: 11,
                    }}
                >
                    Opnieuw proberen
                </button>
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={trigger}
            disabled={isPending}
            style={{
                width: '100%',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                fontWeight: 600,
                padding: '10px 12px',
                background: `${color}10`,
                border: `1px solid ${color}40`,
                borderRadius: 8,
                color: 'var(--text, #fff)',
                cursor: isPending ? 'progress' : 'pointer',
                opacity: isPending ? 0.7 : 1,
            }}
        >
            {isPending ? (
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color }} />
            ) : (
                <ShoppingCart size={14} style={{ color }} />
            )}
            {isPending ? 'Inkooplijst aan het samenstellen…' : 'Inkooplijst genereren'}
        </button>
    );
}
