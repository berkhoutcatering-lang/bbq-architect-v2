'use client';

/**
 * MarginDriftBanner — Pillar #2 (Margin-Drift alerts op open offertes)
 *
 * Verschijnt op /offertes wanneer er open margin-alerts zijn voor open
 * (niet-getekende) offertes. Toont count + grootste impact + CTA naar
 * de detail-drawer per alert.
 *
 * Data komt uit offerte_margin_alerts (RLS: per org). Snooze + dismiss
 * via Server Actions snoozeMarginAlert / resolveMarginAlert.
 */

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, X, TrendingDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { snoozeMarginAlert, resolveMarginAlert } from '@/app/price-intelligence/_actions';
import { formatPercent } from '@/lib/format';

interface AlertRow {
    id: number;
    offerte_id: number;
    delta_cents: number;
    delta_pct: number;
    affected_gerechten: any[];
    created_at: string;
    snoozed_until: string | null;
    offerte_nummer?: string | null;
    offerte_client?: string | null;
}

export default function MarginDriftBanner() {
    const [alerts, setAlerts] = useState<AlertRow[]>([]);
    const [expanded, setExpanded] = useState(false);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        let cancelled = false;
        async function load() {
            const { data, error } = await supabase
                .from('offerte_margin_alerts')
                .select(
                    'id, offerte_id, delta_cents, delta_pct, affected_gerechten, created_at, snoozed_until, offertes!inner(nummer, client_naam)'
                )
                .eq('status', 'open')
                .order('delta_cents', { ascending: true }) // grootste neg-impact eerst
                .limit(50);
            if (cancelled) return;
            if (error) {
                console.warn('[MarginDriftBanner] load failed:', error.message);
                setAlerts([]);
                return;
            }
            const enriched = (data ?? []).map((r: any) => ({
                ...r,
                offerte_nummer: r.offertes?.nummer,
                offerte_client: r.offertes?.client_naam,
            }));
            setAlerts(enriched);
        }
        load();
        return () => {
            cancelled = true;
        };
    }, []);

    if (alerts.length === 0) return null;

    const totalImpactCents = alerts.reduce((s, a) => s + (a.delta_cents ?? 0), 0);
    const worst = alerts[0];

    return (
        <div
            role="status"
            style={{
                background: 'linear-gradient(90deg, #7f1d1d22 0%, #b45309 100%)',
                border: '1px solid #b45309',
                borderRadius: 12,
                padding: '14px 18px',
                marginBottom: 16,
                color: '#fff',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <AlertTriangle size={20} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                        Marge gewijzigd op {alerts.length} {alerts.length === 1 ? 'open offerte' : 'open offertes'}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                        Totale impact: € {(totalImpactCents / 100).toFixed(2)} · ergste:{' '}
                        {worst?.offerte_nummer ?? `Offerte ${worst?.offerte_id}`} ({formatPercent(worst?.delta_pct)})
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setExpanded((e) => !e)}
                    style={{
                        background: 'rgba(255,255,255,0.18)',
                        border: 'none',
                        color: '#fff',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    {expanded ? 'Verberg' : 'Bekijk alle'}
                </button>
            </div>

            {expanded && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {alerts.map((a) => (
                        <li
                            key={a.id}
                            style={{
                                background: 'rgba(0,0,0,0.18)',
                                padding: '10px 12px',
                                borderRadius: 6,
                                display: 'grid',
                                gridTemplateColumns: '1fr 100px 80px 80px',
                                gap: 12,
                                alignItems: 'center',
                            }}
                        >
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {a.offerte_nummer ?? `Offerte ${a.offerte_id}`}
                                    {a.offerte_client && <span style={{ opacity: 0.7, fontWeight: 400 }}> · {a.offerte_client}</span>}
                                </div>
                                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <TrendingDown size={11} />€ {(a.delta_cents / 100).toFixed(2)} · {formatPercent(a.delta_pct)}
                                </div>
                            </div>
                            <Link
                                href={`/offertes?open=${a.offerte_id}`}
                                style={{
                                    fontSize: 12,
                                    color: '#fff',
                                    textDecoration: 'underline',
                                    textAlign: 'center',
                                }}
                            >
                                Bekijk
                            </Link>
                            <button
                                type="button"
                                aria-label="Snooze 7 dagen"
                                disabled={isPending}
                                onClick={() =>
                                    startTransition(async () => {
                                        const res = await snoozeMarginAlert({ alertId: a.id, days: 7 });
                                        if (!res.error) setAlerts((prev) => prev.filter((x) => x.id !== a.id));
                                    })
                                }
                                style={{
                                    fontSize: 11,
                                    background: 'rgba(255,255,255,0.15)',
                                    border: 'none',
                                    color: '#fff',
                                    padding: '5px 8px',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    justifyContent: 'center',
                                }}
                            >
                                <Clock size={11} />
                                7d
                            </button>
                            <button
                                type="button"
                                aria-label="Negeer"
                                disabled={isPending}
                                onClick={() =>
                                    startTransition(async () => {
                                        const res = await resolveMarginAlert({ alertId: a.id, status: 'dismissed' });
                                        if (!res.error) setAlerts((prev) => prev.filter((x) => x.id !== a.id));
                                    })
                                }
                                style={{
                                    fontSize: 11,
                                    background: 'rgba(255,255,255,0.15)',
                                    border: 'none',
                                    color: '#fff',
                                    padding: '5px 8px',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    justifyContent: 'center',
                                }}
                            >
                                <X size={11} />
                                Negeer
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
