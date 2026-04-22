/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';

/*
 * Reminder op dashboard: signaleert per (leverancier × categorie)
 * of prijslijsten te lang niet zijn bijgewerkt. Elke categorie heeft
 * een eigen tempo gebaseerd op hoe snel prijzen realistisch veranderen.
 */

/* Threshold in dagen per categorie. Keys zijn genormaliseerd (lowercase, geen accenten). */
const CATEGORY_THRESHOLDS: Record<string, { days: number; label: string; emoji: string }> = {
    agf: { days: 14, label: 'elke 2 wkn', emoji: '🥬' },
    groenten: { days: 14, label: 'elke 2 wkn', emoji: '🥬' },
    fruit: { days: 14, label: 'elke 2 wkn', emoji: '🍎' },
    vis: { days: 21, label: 'elke 3 wkn', emoji: '🐟' },
    vlees: { days: 28, label: 'elke 4 wkn', emoji: '🥩' },
    brood: { days: 28, label: 'elke 4 wkn', emoji: '🍞' },
    kruiden: { days: 42, label: 'elke 6 wkn', emoji: '🌿' },
    sauzen: { days: 42, label: 'elke 6 wkn', emoji: '🍯' },
    kaas: { days: 60, label: 'elke 8 wkn', emoji: '🧀' },
    zuivel: { days: 90, label: 'per kwartaal', emoji: '🥛' },
    dranken: { days: 90, label: 'per kwartaal', emoji: '🍷' },
    vegan: { days: 60, label: 'elke 8 wkn', emoji: '🌱' },
    hout: { days: 180, label: '2× per jaar', emoji: '🪵' },
    verpakking: { days: 180, label: '2× per jaar', emoji: '📦' },
    overig: { days: 42, label: 'elke 6 wkn', emoji: '📦' },
};

const DEFAULT_THRESHOLD = { days: 42, label: 'elke 6 wkn', emoji: '📦' };

function normalizeCategory(c: string): string {
    return (c || '').toLowerCase().trim().replace(/[^a-z]/g, '');
}

function getThreshold(cat: string | null | undefined) {
    if (!cat) return DEFAULT_THRESHOLD;
    const key = normalizeCategory(cat);
    return CATEGORY_THRESHOLDS[key] || DEFAULT_THRESHOLD;
}

type StaleEntry = {
    leverancier: string;
    categorie: string;
    laatsteDatum: string;
    daysOld: number;
    thresholdDays: number;
    tempo: string;
    emoji: string;
    totalProducts: number;
};

export default function PriceUpdateReminder() {
    const { orgId } = useOrg();
    const [stale, setStale] = useState<StaleEntry[]>([]);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (!orgId) return;
        const hiddenUntil = sessionStorage.getItem('price_reminder_dismissed_until');
        if (hiddenUntil && parseInt(hiddenUntil) > Date.now()) {
            setDismissed(true);
            return;
        }
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from('supplier_prices')
                .select('leverancier, categorie, datum')
                .eq('organization_id', orgId);
            if (cancelled || !data) return;

            /* Aggregeer per (leverancier, categorie) combinatie */
            const byKey: Record<string, { lev: string; cat: string; latest: string; count: number }> = {};
            for (const r of data as any[]) {
                const lev = r.leverancier || 'Onbekend';
                const cat = r.categorie || 'Overig';
                const key = `${lev}|${cat}`;
                if (!byKey[key]) byKey[key] = { lev, cat, latest: '', count: 0 };
                byKey[key].count++;
                if (!byKey[key].latest || (r.datum && r.datum > byKey[key].latest)) {
                    byKey[key].latest = r.datum || byKey[key].latest;
                }
            }

            const now = Date.now();
            const staleList: StaleEntry[] = [];
            for (const entry of Object.values(byKey)) {
                if (!entry.latest) continue;
                const dateOnly = entry.latest.slice(0, 10);
                const parsed = new Date(dateOnly + 'T12:00:00');
                if (isNaN(parsed.getTime())) continue;
                const daysOld = Math.floor((now - parsed.getTime()) / 86400000);
                const threshold = getThreshold(entry.cat);
                if (daysOld >= threshold.days) {
                    staleList.push({
                        leverancier: entry.lev,
                        categorie: entry.cat,
                        laatsteDatum: entry.latest,
                        daysOld,
                        thresholdDays: threshold.days,
                        tempo: threshold.label,
                        emoji: threshold.emoji,
                        totalProducts: entry.count,
                    });
                }
            }
            /* Meest overdue eerst (verhouding daysOld / threshold) */
            staleList.sort((a, b) => (b.daysOld / b.thresholdDays) - (a.daysOld / a.thresholdDays));
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

    /* Severity based op hoe ver overdue de ergste entry is */
    const worst = stale[0];
    const ratio = worst.daysOld / worst.thresholdDays;
    const severity = ratio >= 2 ? 'high' : ratio >= 1.4 ? 'medium' : 'low';
    const severityColors = {
        high: { bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.35)', icon: 'var(--red)', label: 'HOOG' },
        medium: { bg: 'rgba(245,158,11,.08)', border: 'rgba(245,158,11,.35)', icon: 'var(--amber)', label: 'MIDDEN' },
        low: { bg: 'rgba(196,163,90,.08)', border: 'rgba(196,163,90,.35)', icon: 'var(--brand-gold, #c4a35a)', label: 'LAAG' },
    };
    const c = severityColors[severity];

    /* Groepeer per leverancier voor compactere weergave */
    const grouped: Record<string, StaleEntry[]> = {};
    for (const e of stale) {
        if (!grouped[e.leverancier]) grouped[e.leverancier] = [];
        grouped[e.leverancier].push(e);
    }
    const leverancierCount = Object.keys(grouped).length;

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
                    <div style={{ minWidth: 0, flex: 1 }}>
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
                            <strong style={{ color: 'var(--text)' }}>{stale.length}</strong> categorie{stale.length !== 1 ? 'ën' : ''}{' '}
                            bij <strong style={{ color: 'var(--text)' }}>{leverancierCount}</strong> leverancier{leverancierCount !== 1 ? 's' : ''}{' '}
                            niet meer bijgewerkt volgens tempo.
                        </div>

                        {/* Chips per (leverancier × categorie) — tot 8, dan '+N' */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                            {stale.slice(0, 8).map(s => {
                                const severityPerCat = s.daysOld >= s.thresholdDays * 2 ? 'var(--red)'
                                    : s.daysOld >= s.thresholdDays * 1.4 ? 'var(--amber)'
                                    : 'var(--brand-gold, #c4a35a)';
                                return (
                                    <span key={s.leverancier + s.categorie} style={{
                                        fontSize: 11, padding: '4px 10px', borderRadius: 100,
                                        background: 'rgba(130,130,130,.12)', color: 'var(--text)',
                                        display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 500,
                                    }}>
                                        <span style={{ fontSize: 12 }}>{s.emoji}</span>
                                        <strong style={{ fontWeight: 700 }}>{s.leverancier}</strong>
                                        <span style={{ color: 'var(--muted-light)' }}>·</span>
                                        <span style={{ color: 'var(--text)' }}>{s.categorie}</span>
                                        <span style={{ color: severityPerCat, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                            {s.daysOld}d
                                        </span>
                                        <span style={{ color: 'var(--muted-light)', fontSize: 9, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                                            ({s.tempo})
                                        </span>
                                    </span>
                                );
                            })}
                            {stale.length > 8 && (
                                <span style={{ fontSize: 11, padding: '4px 10px', color: 'var(--muted)' }}>
                                    + {stale.length - 8} meer
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
