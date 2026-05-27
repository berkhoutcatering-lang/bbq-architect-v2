'use client';
/* FinanceSummaryStrip — Bucket J P0.1
   Sticky strip bovenaan /financien. Reads finance_copilot_daily_summary cached row.
   Conditional render: alleen als !dismissed && summary_md is not null.
   Dismiss persist in localStorage + finance_copilot_dismissed_at.

   Design: Claude Design AISummaryStrip (purple gradient + denk-zin + 4 chips). */

import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

interface Chip {
    label: string;
    prompt: string;
    action: 'kia_modal' | 'send_bookkeeper' | 'chat';
    icon?: string;
}

interface DailySummary {
    date: string;
    summary_md: string;
    chips_json: Chip[];
    generated_at: string;
}

interface Props {
    onChipClick?: (chip: Chip) => void;
}

const LS_KEY = 'finance_copilot_dismissed_at';
const DISMISS_TTL_HOURS = 18; /* dag-snapshot is dagelijks, 18u TTL voorkomt mid-day herhaling. */

function isDismissedRecently(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const ts = localStorage.getItem(LS_KEY);
        if (!ts) return false;
        const age = Date.now() - new Date(ts).getTime();
        return age < DISMISS_TTL_HOURS * 3600_000;
    } catch {
        return false;
    }
}

export default function FinanceSummaryStrip({ onChipClick }: Props) {
    const initialDismissed = isDismissedRecently();
    const [summary, setSummary] = useState<DailySummary | null>(null);
    const [dismissed, setDismissed] = useState<boolean>(initialDismissed);
    const [loading, setLoading] = useState<boolean>(!initialDismissed);

    useEffect(() => {
        if (dismissed) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/financien/summary', { method: 'GET' });
                if (!res.ok) {
                    if (!cancelled) setLoading(false);
                    return;
                }
                const body = await res.json();
                if (!cancelled) {
                    setSummary(body.summary || null);
                    setLoading(false);
                }
            } catch {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [dismissed]);

    function handleDismiss() {
        try {
            localStorage.setItem(LS_KEY, new Date().toISOString());
        } catch { /* private-mode: dismiss is alleen sessie */ }
        setDismissed(true);
    }

    if (loading) return null;
    if (dismissed) return null;
    if (!summary || !summary.summary_md) return null;

    const chips: Chip[] = Array.isArray(summary.chips_json) ? summary.chips_json : [];

    return (
        <div
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 30,
                marginBottom: 16,
                background: 'linear-gradient(135deg, rgba(167,139,250,.06), rgba(167,139,250,.02))',
                border: '1px solid rgba(167,139,250,.15)',
                borderRadius: 'var(--radius-xl, 14px)',
                padding: '14px 18px 12px',
                animation: 'fadeIn 0.4s ease-out',
            }}
            data-testid="finance-summary-strip"
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                <div
                    style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 1,
                        background: 'rgba(167,139,250,.15)', border: '1px solid rgba(167,139,250,.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    <Sparkles size={14} color="var(--purple)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                        style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: '.12em',
                            textTransform: 'uppercase', color: 'var(--purple)', marginBottom: 4,
                        }}
                    >
                        Ik denk mee
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.55 }}>
                        {summary.summary_md}
                    </div>
                </div>
                <button
                    onClick={handleDismiss}
                    aria-label="Sluiten"
                    style={{
                        background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer',
                        padding: 4, minWidth: 28, minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    <X size={14} />
                </button>
            </div>

            {chips.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginLeft: 40 }}>
                    {chips.map((chip, i) => (
                        <button
                            key={i}
                            onClick={() => onChipClick?.(chip)}
                            data-testid={`finance-chip-${chip.action}`}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px', borderRadius: 999, minHeight: 32,
                                background: chip.action === 'kia_modal' ? 'rgba(167,139,250,.12)' : 'rgba(255,255,255,.04)',
                                border: `1px solid ${chip.action === 'kia_modal' ? 'rgba(167,139,250,.3)' : 'var(--border)'}`,
                                color: chip.action === 'kia_modal' ? 'var(--purple)' : 'var(--text)',
                                fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                                transition: '.15s',
                            }}
                        >
                            {chip.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
