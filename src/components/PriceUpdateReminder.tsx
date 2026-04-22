/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';

/*
 * Reminder voor het dashboard: signaleert als de prijslijsten
 * ouder zijn dan 28 dagen (4 weken). AGF verdient vaker (2 wkn),
 * rest mag 6 wkn. Toont alleen als er écht actie nodig is.
 */

const STALE_DAYS_DEFAULT = 28;
const STALE_DAYS_AGF = 14; /* Groente/fruit sneller verouderd */

type SupplierStatus = {
    leverancier: string;
    laatsteDatum: string;
    daysOld: number;
    isAgf: boolean;
    totalProducts: number;
};

function isAgfSupplier(name: string): boolean {
    const n = name.toLowerCase();
    return n.includes('agf') || n.includes('groente') || n.includes('fruit');
}

export default function PriceUpdateReminder() {
    const { orgId } = useOrg();
    const [stale, setStale] = useState<SupplierStatus[]>([]);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (!orgId) return;
        /* Session-only dismiss (reset op reload zodat het niet eeuwig weg is) */
        const hiddenUntil = sessionStorage.getItem('price_reminder_dismissed_until');
        if (hiddenUntil && parseInt(hiddenUntil) > Date.now()) {
            setDismissed(true);
            return;
        }
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from('supplier_prices')
                .select('leverancier, datum')
                .eq('organization_id', orgId);
            if (cancelled || !data) return;

            const byLev: Record<string, { latestDate: string; count: number }> = {};
            for (const r of data as any[]) {
                const lev = r.leverancier || 'Onbekend';
                if (!byLev[lev]) byLev[lev] = { latestDate: '', count: 0 };
                byLev[lev].count++;
                if (!byLev[lev].latestDate || (r.datum && r.datum > byLev[lev].latestDate)) {
                    byLev[lev].latestDate = r.datum || byLev[lev].latestDate;
                }
            }

            const now = Date.now();
            const staleList: SupplierStatus[] = [];
            for (const [lev, s] of Object.entries(byLev)) {
                if (!s.latestDate) continue;
                /* Parse datum robuust: accepteer zowel 'YYYY-MM-DD' als 'YYYY-MM-DD HH:mm:ss' */
                const dateOnly = s.latestDate.slice(0, 10);
                const parsed = new Date(dateOnly + 'T12:00:00');
                if (isNaN(parsed.getTime())) continue;
                const daysOld = Math.floor((now - parsed.getTime()) / 86400000);
                const isAgf = isAgfSupplier(lev);
                const threshold = isAgf ? STALE_DAYS_AGF : STALE_DAYS_DEFAULT;
                if (daysOld >= threshold) {
                    staleList.push({
                        leverancier: lev,
                        laatsteDatum: s.latestDate,
                        daysOld,
                        isAgf,
                        totalProducts: s.count,
                    });
                }
            }
            /* Sorteer meest verouderd eerst */
            staleList.sort((a, b) => b.daysOld - a.daysOld);
            setStale(staleList);
        })();
        return () => { cancelled = true; };
    }, [orgId]);

    function dismissFor(days: number) {
        const until = Date.now() + days * 86400000;
        sessionStorage.setItem('price_reminder_dismissed_until', String(until));
        setDismissed(true);
    }

    if (dismissed || stale.length === 0) return null;

    const worst = stale[0];
    const severity = worst.daysOld >= 60 ? 'high' : worst.daysOld >= 42 ? 'medium' : 'low';
    const severityColors = {
        high: { bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.35)', icon: 'var(--red)', label: 'HOOG' },
        medium: { bg: 'rgba(245,158,11,.08)', border: 'rgba(245,158,11,.35)', icon: 'var(--amber)', label: 'MIDDEN' },
        low: { bg: 'rgba(196,163,90,.08)', border: 'rgba(196,163,90,.35)', icon: 'var(--brand-gold, #c4a35a)', label: 'LAAG' },
    };
    const c = severityColors[severity];

    return (
        <div style={{
            position: 'relative',
            padding: '16px 18px',
            borderRadius: 12,
            background: c.bg,
            border: `1px solid ${c.border}`,
            marginBottom: 16,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
                    <div style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: `color-mix(in srgb, ${c.icon} 18%, transparent)`,
                        border: `1px solid ${c.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <RefreshCw size={18} style={{ color: c.icon }} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                                Prijslijsten verouderd
                            </span>
                            <span style={{
                                fontSize: 9, padding: '2px 7px', borderRadius: 4,
                                background: `color-mix(in srgb, ${c.icon} 20%, transparent)`,
                                color: c.icon, fontWeight: 800, letterSpacing: '.1em',
                            }}>
                                PRIORITEIT: {c.label}
                            </span>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                            <strong style={{ color: 'var(--text)' }}>{stale.length}</strong> leverancier{stale.length !== 1 ? 's' : ''}{' '}
                            niet meer bijgewerkt sinds langer dan <strong style={{ color: c.icon }}>{worst.isAgf ? '2 wkn' : '4 wkn'}</strong>.
                            Update om prijsveranderingen op te vangen.
                        </div>
                        {/* Top-3 verouderde leveranciers */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                            {stale.slice(0, 4).map(s => (
                                <span key={s.leverancier} style={{
                                    fontSize: 11, padding: '4px 9px', borderRadius: 100,
                                    background: 'rgba(130,130,130,.12)', color: 'var(--text)',
                                    display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500,
                                }}>
                                    {s.isAgf && <span title="AGF verandert sneller">🥬</span>}
                                    <strong>{s.leverancier}</strong>
                                    <span style={{ color: c.icon, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                        {s.daysOld}d
                                    </span>
                                </span>
                            ))}
                            {stale.length > 4 && (
                                <span style={{ fontSize: 11, padding: '4px 9px', color: 'var(--muted)' }}>
                                    + {stale.length - 4} meer
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <button
                        onClick={() => dismissFor(3)}
                        style={{
                            padding: '8px 12px', borderRadius: 8, background: 'transparent',
                            border: '1px solid var(--border)', color: 'var(--muted)',
                            fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        }}
                        title="Verberg voor 3 dagen"
                    >
                        Later
                    </button>
                    <Link href="/price-intelligence?folder=pricelists" style={{ textDecoration: 'none' }}>
                        <button style={{
                            padding: '8px 14px', borderRadius: 8,
                            background: c.icon, color: 'var(--brand-background, #000)',
                            border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}>
                            Nu bijwerken <ArrowRight size={13} />
                        </button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
