'use client';

/**
 * MarktPulseWidget — Pillar #5 (Markt-Pulse cross-tenant trend, opt-in).
 *
 * Op /financien dashboard. Roept get_market_pulse RPC aan. Bij niet-opted-in
 * (RPC returneert lege rijen): toont opt-in-CTA met opt-in toggle.
 *
 * Hard rule: k-anonymity ≥ 5 (HAVING in materialized view). Geen absolute
 * prijzen tonen — alleen delta-pct. Geen leverancier-identificatie.
 */

import { useEffect, useState, useTransition } from 'react';
import { TrendingUp, TrendingDown, Lock, Info, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { setMarketPulseOptIn } from '@/app/price-intelligence/_actions';

interface MarktPulseRow {
    bucket_id: number;
    cut_groep: string | null;
    soort: string | null;
    avg_price_now: number;
    avg_price_30d: number;
    delta_pct_30d: number | null;
    participant_min: number;
}

export default function MarktPulseWidget() {
    const { organization } = useOrg();
    const [rows, setRows] = useState<MarktPulseRow[]>([]);
    const [optedIn, setOptedIn] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        let cancelled = false;
        async function load() {
            if (!organization?.id) return;
            const optIn = Boolean(
                (organization.feature_flags as Record<string, unknown> | undefined)?.market_pulse_opt_in
            );
            setOptedIn(optIn);
            if (!optIn) {
                setRows([]);
                setLoading(false);
                return;
            }
            const { data } = await supabase.rpc('get_market_pulse', { p_org_id: organization.id });
            if (cancelled) return;
            setRows((data ?? []) as MarktPulseRow[]);
            setLoading(false);
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [organization?.id, organization?.feature_flags]);

    function toggle(newValue: boolean) {
        startTransition(async () => {
            const res = await setMarketPulseOptIn({ optIn: newValue });
            if (!res.error) {
                setOptedIn(newValue);
                if (newValue) {
                    // Reload data
                    const { data } = await supabase.rpc('get_market_pulse', {
                        p_org_id: organization?.id,
                    });
                    setRows((data ?? []) as MarktPulseRow[]);
                } else {
                    setRows([]);
                }
            }
        });
    }

    return (
        <section
            style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 20,
                marginBottom: 30,
            }}
        >
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Markt-Pulse</h3>
                        <span
                            style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: 'var(--color-accent-gold, #d97706)',
                                color: '#fff',
                                letterSpacing: 0.5,
                                textTransform: 'uppercase',
                            }}
                        >
                            Pro
                        </span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, marginBottom: 0 }}>
                        Anonieme cross-tenant prijs-deltas per cut · k ≥ 5 deelnemers per rij
                    </p>
                </div>

                {optedIn !== null && (
                    <button
                        type="button"
                        onClick={() => toggle(!optedIn)}
                        disabled={isPending}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '6px 10px',
                            background: optedIn ? '#16a34a14' : 'transparent',
                            border: `1px solid ${optedIn ? '#16a34a40' : 'var(--border)'}`,
                            borderRadius: 4,
                            color: optedIn ? '#16a34a' : 'var(--muted)',
                            cursor: isPending ? 'progress' : 'pointer',
                        }}
                    >
                        {optedIn ? <Eye size={11} /> : <Lock size={11} />}
                        {optedIn ? 'Meedoen' : 'Niet meedoen'}
                    </button>
                )}
            </header>

            {loading && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    Laden…
                </div>
            )}

            {!loading && optedIn === false && (
                <div
                    style={{
                        padding: 20,
                        background: 'rgba(0,0,0,0.15)',
                        borderRadius: 8,
                        textAlign: 'center',
                    }}
                >
                    <Lock size={24} style={{ color: 'var(--muted)', margin: '0 auto 12px', display: 'block' }} />
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Doe mee om Markt-Pulse te zien</div>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5, maxWidth: 460, margin: '6px auto 12px' }}>
                        Jouw goedgekeurde prijs-mutations gaan anoniem in een aggregate (k ≥ 5).
                        Geen leveranciers identificeerbaar, geen absolute getallen.
                        Je kunt op elk moment uitstappen.
                    </p>
                    <button
                        type="button"
                        onClick={() => toggle(true)}
                        disabled={isPending}
                        style={{
                            padding: '8px 16px',
                            background: 'var(--color-accent-gold, #d97706)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: isPending ? 'progress' : 'pointer',
                        }}
                    >
                        Activeren
                    </button>
                </div>
            )}

            {!loading && optedIn === true && rows.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    <Info size={16} style={{ margin: '0 auto 6px', display: 'block' }} />
                    Nog niet genoeg deelnemers per cut om data te tonen (k ≥ 5 vereist).
                    Komt vanzelf wanneer meer organisaties meedoen.
                </div>
            )}

            {!loading && optedIn === true && rows.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {rows.slice(0, 8).map((r) => (
                        <PulseRow key={r.bucket_id} row={r} />
                    ))}
                </ul>
            )}
        </section>
    );
}

function PulseRow({ row }: { row: MarktPulseRow }) {
    const delta = Number(row.delta_pct_30d ?? 0);
    const isUp = delta > 0;
    const intensity = Math.min(Math.abs(delta), 30); // cap 30%
    const barWidthPct = (intensity / 30) * 100;
    const color = isUp ? '#dc2626' : '#16a34a';
    const Icon = isUp ? TrendingUp : TrendingDown;
    const label = [row.soort, row.cut_groep].filter(Boolean).join(' · ') || `Bucket #${row.bucket_id}`;

    return (
        <li
            style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 100px',
                gap: 10,
                alignItems: 'center',
                padding: '8px 12px',
                background: 'rgba(0,0,0,0.12)',
                borderRadius: 6,
            }}
        >
            <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{label}</div>
            <div
                style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                }}
            >
                <Icon size={12} />
                {isUp ? '+' : ''}
                {delta.toFixed(1)}%
            </div>
            <div
                style={{
                    height: 8,
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 4,
                    overflow: 'hidden',
                    position: 'relative',
                }}
                title={`≥ ${row.participant_min} deelnemers`}
            >
                <div
                    style={{
                        height: '100%',
                        width: `${barWidthPct}%`,
                        background: color,
                        opacity: 0.7,
                        marginLeft: isUp ? '50%' : `${50 - barWidthPct / 2}%`,
                    }}
                />
            </div>
        </li>
    );
}
