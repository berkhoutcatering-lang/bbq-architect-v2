'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
    Sparkles, X, Loader2, AlertCircle, TrendingUp, AlertTriangle, Info, ChevronRight, RefreshCw,
} from 'lucide-react';

interface Insight {
    titel: string;
    observatie: string;
    suggestie: string;
    severity: 'info' | 'kans' | 'risico';
    link?: string;
}

interface InsightsResponse {
    insights: Insight[];
    aggregaat?: Record<string, unknown>;
    model?: string;
    ms?: number;
}

const SEVERITY_META: Record<Insight['severity'], { color: string; bg: string; Icon: typeof Info; label: string }> = {
    info:   { color: '#60a5fa', bg: 'rgba(96,165,250,.10)', Icon: Info,           label: 'Info' },
    kans:   { color: '#10b981', bg: 'rgba(16,185,129,.10)', Icon: TrendingUp,     label: 'Kans' },
    risico: { color: '#f59e0b', bg: 'rgba(245,158,11,.10)', Icon: AlertTriangle, label: 'Risico' },
};

/* Floating "Vraag financien-coach" knop + drawer rechts. Drawer toont 4-6
   AI-inzichten over de afgelopen 90 dagen — patronen, gaten, kansen.
   Inzichten zijn pattern-spotting, NIET fiscaal advies (zie disclaimer). */
export default function FinancienAiDrawer() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [insights, setInsights] = useState<Insight[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

    async function fetchInsights() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/financien/insights', { method: 'POST' });
            const body = await res.json() as InsightsResponse | { error: string };
            if (!res.ok || 'error' in body) {
                setError('error' in body ? body.error : 'Onbekende fout');
                return;
            }
            setInsights(body.insights);
            setLastFetchedAt(new Date());
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    function openDrawer() {
        setOpen(true);
        if (!insights) fetchInsights();
    }

    return (
        <>
            {/* Floating CTA — bottom right, niet over BottomNav heen op mobile */}
            <button
                type="button"
                onClick={openDrawer}
                aria-label="Open financien-coach"
                style={{
                    position: 'fixed',
                    right: 24,
                    bottom: 'calc(var(--bottom-nav-h, 0px) + 24px)',
                    padding: '12px 18px',
                    borderRadius: 999,
                    background: 'linear-gradient(135deg, #FFBF00, #c4a35a)',
                    color: '#000',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 12px 24px rgba(0,0,0,.35), 0 0 0 1px rgba(255,191,0,.4)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    zIndex: 90,
                }}
            >
                <Sparkles size={14} /> Vraag financien-coach
            </button>

            {open && (
                <>
                    <div
                        onClick={() => setOpen(false)}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 9998 }}
                        aria-hidden
                    />
                    <aside
                        role="dialog"
                        aria-label="Financien-coach"
                        style={{
                            position: 'fixed', right: 0, top: 0, height: '100vh',
                            width: 580, maxWidth: '100vw',
                            background: 'var(--color-bg-elevated, #1a1a1d)',
                            borderLeft: '1px solid var(--border)',
                            zIndex: 9999,
                            boxShadow: '-20px 0 40px rgba(0,0,0,.4)',
                            display: 'flex', flexDirection: 'column',
                            overflowY: 'auto',
                        }}
                    >
                        <header style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: 'linear-gradient(135deg, rgba(255,191,0,.20), rgba(196,163,90,.15))',
                                    color: '#FFBF00',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}><Sparkles size={16} /></div>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 17, fontWeight: 400, color: 'var(--text)' }}>
                                        Financien-coach
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                        Patronen, gaten en kansen — laatste 90 dagen
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={fetchInsights} disabled={loading} aria-label="Opnieuw scannen" style={iconBtnStyle}>
                                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                </button>
                                <button onClick={() => setOpen(false)} aria-label="Sluiten" style={iconBtnStyle}>
                                    <X size={14} />
                                </button>
                            </div>
                        </header>

                        <div style={{ padding: '14px 22px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {loading && !insights && (
                                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                    <Loader2 size={20} className="animate-spin" color="#FFBF00" />
                                    <div style={{ fontSize: 13 }}>AI scant 90 dagen aan data…</div>
                                </div>
                            )}

                            {error && (
                                <div role="alert" style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', color: '#ef4444', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <AlertCircle size={14} /> {error}
                                </div>
                            )}

                            {insights && insights.length === 0 && (
                                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                                    AI vond geen opvallende patronen. Werk je administratie verder bij en probeer over een tijdje opnieuw.
                                </div>
                            )}

                            {insights && insights.length > 0 && insights.map((it, i) => {
                                const meta = SEVERITY_META[it.severity];
                                const card = (
                                    <div style={{
                                        padding: 14, borderRadius: 12,
                                        background: meta.bg,
                                        border: `1px solid ${meta.color}33`,
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <meta.Icon size={14} color={meta.color} />
                                            <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '.1em' }}>
                                                {meta.label}
                                            </span>
                                            {it.link && <ChevronRight size={14} color="var(--muted-light)" style={{ marginLeft: 'auto' }} />}
                                        </div>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6, lineHeight: 1.35 }}>
                                            {it.titel}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--muted-light)', lineHeight: 1.5, marginBottom: 8 }}>
                                            {it.observatie}
                                        </div>
                                        {it.suggestie && (
                                            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, fontStyle: 'italic', paddingTop: 8, borderTop: '1px solid rgba(130,130,130,.1)' }}>
                                                💡 {it.suggestie}
                                            </div>
                                        )}
                                    </div>
                                );
                                return it.link ? (
                                    <Link key={i} href={it.link} style={{ textDecoration: 'none', color: 'inherit' }} onClick={() => setOpen(false)}>
                                        {card}
                                    </Link>
                                ) : (
                                    <div key={i}>{card}</div>
                                );
                            })}

                            {insights && lastFetchedAt && (
                                <div style={{ paddingTop: 14, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted-light)', lineHeight: 1.5 }}>
                                    <strong style={{ color: 'var(--muted)' }}>Disclaimer:</strong> dit zijn pattern-observaties uit je eigen data — geen fiscaal advies, geen aangifte-aanbevelingen. Voor BTW, KIA, investeringsaftrek en aangiften: overleg met je boekhouder.
                                    <div style={{ marginTop: 6, fontSize: 10 }}>
                                        Laatst gescand: {lastFetchedAt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </aside>
                </>
            )}
        </>
    );
}

const iconBtnStyle: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 8,
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--muted)', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
