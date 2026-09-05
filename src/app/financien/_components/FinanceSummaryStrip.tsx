'use client';
/* Pitmaster Copilot-card — design-system build (Tool 09).
   Vervangt de paarse summary-strip: brand-goud, model-pill, "prefix
   gecached"-pill, AI-budget-meter (som ai_usage deze maand t.o.v. Pro
   soft-cap) en de BTW-disclaimer. Data-contract ongewijzigd: GET
   /api/financien/summary levert summary_md + chips_json; chips blijven
   de actie-laag (kia_modal / send_bookkeeper / chat). */

import { useEffect, useState } from 'react';
import { Sparkles, X, Zap, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

import { formatEur } from '@/lib/format';

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
const DISMISS_TTL_HOURS = 18;
const SOFT_CAP_EUR = 15; /* Pro-tier soft-cap — meter-referentie, hard-cap zit server-side. */

function isDismissedRecently(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const ts = localStorage.getItem(LS_KEY);
        if (!ts) return false;
        return Date.now() - new Date(ts).getTime() < DISMISS_TTL_HOURS * 3600_000;
    } catch {
        return false;
    }
}

export default function FinanceSummaryStrip({ onChipClick }: Props) {
    const initialDismissed = isDismissedRecently();
    const [summary, setSummary] = useState<DailySummary | null>(null);
    const [dismissed, setDismissed] = useState<boolean>(initialDismissed);
    const [loading, setLoading] = useState<boolean>(!initialDismissed);
    const [aiSpend, setAiSpend] = useState<number | null>(null);

    useEffect(() => {
        if (dismissed) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/financien/summary', { method: 'GET' });
                if (!res.ok) { if (!cancelled) setLoading(false); return; }
                const body = await res.json();
                if (!cancelled) { setSummary(body.summary || null); setLoading(false); }
            } catch {
                if (!cancelled) setLoading(false);
            }
        })();
        /* AI-budget deze maand: som ai_usage.cost_eur_cents (RLS org-scoped). */
        (async () => {
            try {
                const start = new Date();
                start.setDate(1); start.setHours(0, 0, 0, 0);
                const { data } = await supabase
                    .from('ai_usage')
                    .select('cost_eur_cents')
                    .gte('created_at', start.toISOString());
                if (!cancelled && data) {
                    setAiSpend(data.reduce((s, r: { cost_eur_cents?: number | null }) => s + (r.cost_eur_cents || 0), 0) / 100);
                }
            } catch { /* meter is optioneel — card werkt zonder */ }
        })();
        return () => { cancelled = true; };
    }, [dismissed]);

    function handleDismiss() {
        try { localStorage.setItem(LS_KEY, new Date().toISOString()); } catch { /* */ }
        setDismissed(true);
    }

    if (loading || dismissed || !summary || !summary.summary_md) return null;

    const chips: Chip[] = Array.isArray(summary.chips_json) ? summary.chips_json : [];
    const spendPct = aiSpend != null ? Math.min(100, (aiSpend / SOFT_CAP_EUR) * 100) : 0;

    return (
        <div
            style={{
                position: 'sticky', top: 0, zIndex: 30, marginBottom: 16,
                background: 'linear-gradient(150deg, rgba(255,191,0,.07), rgba(196,163,90,.03) 60%, transparent)',
                border: '1px solid rgba(255,191,0,.18)',
                borderRadius: 'var(--radius-xl, 14px)',
                padding: '14px 18px 12px',
                animation: 'fadeIn 0.4s ease-out',
            }}
            data-testid="finance-summary-strip"
        >
            {/* kop: identiteit + telemetrie + budget-meter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{
                    width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                    background: 'rgba(255,191,0,.14)', border: '1px solid rgba(255,191,0,.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Sparkles size={15} color="var(--brand)" />
                </div>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Pitmaster Copilot</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(255,191,0,.10)', border: '1px solid rgba(255,191,0,.25)', color: 'var(--brand)' }}>
                    Claude Sonnet
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--muted)', padding: '3px 8px', borderRadius: 999, border: '1px solid var(--border)' }}>
                    <Zap size={10} color="var(--brand-gold, var(--brand))" /> prefix gecached
                </span>

                {aiSpend != null && (
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', flexDirection: 'column', gap: 3, minWidth: 130 }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)' }}>
                            <span style={{ textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700 }}>AI-budget</span>
                            <span className="mono">{formatEur(aiSpend)} / {formatEur(SOFT_CAP_EUR)}</span>
                        </span>
                        <span style={{ height: 3, borderRadius: 2, background: 'rgba(130,130,130,.2)', overflow: 'hidden' }}>
                            <span style={{ display: 'block', height: '100%', width: spendPct + '%', borderRadius: 2, background: spendPct > 80 ? 'var(--amber)' : 'var(--brand)' }} />
                        </span>
                    </span>
                )}

                <button onClick={handleDismiss} aria-label="Sluiten"
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4, minWidth: 28, minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: aiSpend == null ? 'auto' : 0 }}>
                    <X size={14} />
                </button>
            </div>

            {/* het inzicht zelf */}
            <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, marginBottom: chips.length > 0 ? 12 : 8 }}>
                {summary.summary_md}
            </div>

            {/* actie-chips (server-side bepaald) */}
            {chips.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                    {chips.map((chip, i) => {
                        const primary = i === 0;
                        return (
                            <button key={i} onClick={() => onChipClick?.(chip)} data-testid={`finance-chip-${chip.action}`}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: primary ? '8px 15px' : '6px 12px', borderRadius: 999, minHeight: 32,
                                    background: primary ? 'var(--brand)' : 'rgba(255,255,255,.04)',
                                    border: primary ? '1px solid var(--brand)' : '1px solid var(--border)',
                                    color: primary ? '#0a0a0c' : 'var(--text)',
                                    fontSize: 12, fontWeight: primary ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', transition: '.15s',
                                }}>
                                {primary && <Sparkles size={12} color="#0a0a0c" />}
                                {chip.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* BTW-disclaimer — hard rule zichtbaar gemaakt */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', borderTop: '1px solid rgba(130,130,130,.12)', paddingTop: 9 }}>
                <ShieldCheck size={12} color="var(--muted)" />
                BTW-vragen verwijst de Copilot altijd door naar de boekhouding — hij rekent nooit zelf btw uit.
            </div>
        </div>
    );
}
