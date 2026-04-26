/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, ChefHat, X, Send, Volume2, VolumeX, Mic } from 'lucide-react';

const GOLD = '#c4a35a';
const BRAND = '#FFBF00';

/*
 * AI Chef Assistant — persistent floating coach voor Service KDS
 * ─────────────────────────────────────────────────────────────
 * Altijd zichtbaar onderin rechts. Geeft directives op basis van event-state.
 * Periodieke auto-refresh: elke 60s een nieuwe directive op basis van context.
 * Click-to-expand: chat-interface om vragen te stellen aan de chef.
 * Optioneel: voice-output via Web Speech API (browser-native, gratis).
 */

export interface ChefContext {
    now: string;
    activeCourseId?: string;
    activeCourseTitle?: string;
    activeCourseStart?: string;
    activeCourseStatus?: string;
    minsUntilNextCourse?: number;
    nextCourseTitle?: string;
    misePctDone?: number;
    miseRemaining?: { label: string; critical?: boolean }[];
    smoker?: { item: string; temp: number; target: number; etaMinutes: number };
    allergies?: { person: string; issue: string; severity: string }[];
}

interface ChefDirective {
    directive: string;
    severity: 'praise' | 'normal' | 'urgent' | 'critical';
    actionLabel?: string | null;
    context?: string | null;
    generatedAt: string;
}

const SEVERITY_COLORS = {
    praise: { bg: 'rgba(34,197,94,.12)', border: 'rgba(34,197,94,.4)', accent: '#22c55e', label: 'STRAK' },
    normal: { bg: `${GOLD}1a`, border: `${GOLD}40`, accent: GOLD, label: 'COACH' },
    urgent: { bg: `${BRAND}1a`, border: `${BRAND}66`, accent: BRAND, label: 'NU DOEN' },
    critical: { bg: 'rgba(239,68,68,.12)', border: 'rgba(239,68,68,.5)', accent: 'var(--red)', label: 'KRITISCH' },
};

export default function AIChefAssistant({
    context,
    refreshIntervalMs = 60_000,
    enabled = true,
}: {
    context: ChefContext;
    refreshIntervalMs?: number;
    enabled?: boolean;
}) {
    const [directive, setDirective] = useState<ChefDirective | null>(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [chatLog, setChatLog] = useState<{ role: 'chef' | 'user'; text: string; ts: string }[]>([]);
    const [voiceOn, setVoiceOn] = useState(false);
    const [voiceSupported, setVoiceSupported] = useState(false);
    const lastSpokenRef = useRef<string | null>(null);

    /* Detect voice support (client-side only) */
    useEffect(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            setVoiceSupported(true);
        }
    }, []);

    const fetchDirective = useCallback(async (userQuestion?: string) => {
        if (!enabled) return;
        setLoading(true);
        try {
            const res = await fetch('/api/chef-coach', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...context, userQuestion }),
            });
            const body = await res.json();
            if (body.success) {
                const d: ChefDirective = {
                    directive: body.directive,
                    severity: body.severity || 'normal',
                    actionLabel: body.actionLabel,
                    context: body.context,
                    generatedAt: body.generatedAt,
                };
                setDirective(d);
                if (userQuestion) {
                    setChatLog(prev => [
                        ...prev,
                        { role: 'user', text: userQuestion, ts: new Date().toISOString() },
                        { role: 'chef', text: body.directive, ts: body.generatedAt },
                    ]);
                }
                /* Voice */
                if (voiceOn && voiceSupported && body.directive !== lastSpokenRef.current) {
                    speakDutch(body.directive);
                    lastSpokenRef.current = body.directive;
                }
            }
        } catch { /* silent — chef offline maar UI overleeft */ }
        setLoading(false);
    }, [context, enabled, voiceOn, voiceSupported]);

    /* Initial + interval refresh */
    useEffect(() => {
        if (!enabled) return;
        fetchDirective();
        const interval = setInterval(() => fetchDirective(), refreshIntervalMs);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, refreshIntervalMs, context.activeCourseId, context.misePctDone]);

    if (!enabled) return null;

    const c = directive ? SEVERITY_COLORS[directive.severity] : SEVERITY_COLORS.normal;
    const isUrgent = directive && (directive.severity === 'urgent' || directive.severity === 'critical');

    /* ── Compact mode: floating bubble ── */
    if (!expanded) {
        return (
            <div style={{
                position: 'fixed', bottom: 24, right: 24, zIndex: 9000,
                maxWidth: 380, animation: 'fadeUp .3s ease',
            }}>
                <div onClick={() => setExpanded(true)} style={{
                    display: 'grid', gridTemplateColumns: '52px 1fr', gap: 12, alignItems: 'center',
                    padding: '12px 14px', borderRadius: 16, cursor: 'pointer',
                    background: `linear-gradient(135deg, ${c.bg}, rgba(20,20,24,.95))`,
                    border: `1px solid ${c.border}`,
                    boxShadow: `0 16px 40px rgba(0,0,0,.5), 0 0 ${isUrgent ? 30 : 16}px ${c.accent}33`,
                    backdropFilter: 'blur(12px)',
                    transition: 'transform .2s',
                }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>

                    {/* Chef avatar */}
                    <div style={{
                        width: 52, height: 52, borderRadius: 14, position: 'relative',
                        background: `linear-gradient(135deg, ${c.accent}, ${c.accent}80)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: `0 0 20px ${c.accent}66`,
                    }}>
                        <ChefHat size={26} style={{ color: '#000' }} />
                        {loading && (
                            <div style={{
                                position: 'absolute', inset: -2, borderRadius: 16,
                                border: `2px solid ${c.accent}`, borderTopColor: 'transparent',
                                animation: 'spin 1s linear infinite',
                            }} />
                        )}
                        {isUrgent && (
                            <div style={{
                                position: 'absolute', top: -3, right: -3, width: 14, height: 14, borderRadius: '50%',
                                background: c.accent, boxShadow: `0 0 12px ${c.accent}`,
                                animation: 'pulse-prep 1.2s infinite',
                            }} />
                        )}
                    </div>

                    {/* Speech bubble */}
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 9, letterSpacing: '.2em', fontWeight: 700, color: c.accent, marginBottom: 3 }}>
                            ROOK · {c.label}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', lineHeight: 1.35, marginBottom: 4 }}>
                            {directive?.directive || 'Pitmaster aan het lezen…'}
                        </div>
                        {directive?.actionLabel && (
                            <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4,
                                background: `${c.accent}22`, color: c.accent, fontSize: 10, fontWeight: 700, letterSpacing: '.1em',
                            }}>
                                {directive.actionLabel.toUpperCase()}
                            </div>
                        )}
                    </div>
                </div>

                {/* Tagline + actions onder bubble */}
                <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                    {voiceSupported && (
                        <button onClick={() => setVoiceOn(v => !v)} title={voiceOn ? 'Stem uit' : 'Stem aan'} style={iconBtnStyle()}>
                            {voiceOn ? <Volume2 size={12} /> : <VolumeX size={12} />}
                        </button>
                    )}
                    <button onClick={() => fetchDirective()} title="Vraag opnieuw" style={iconBtnStyle()} disabled={loading}>
                        <Sparkles size={12} />
                    </button>
                    <button onClick={() => setExpanded(true)} title="Open chat" style={iconBtnStyle()}>
                        <Mic size={12} />
                    </button>
                </div>
            </div>
        );
    }

    /* ── Expanded mode: full chat panel ── */
    return (
        <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9000,
            width: 420, maxHeight: '70vh',
            display: 'flex', flexDirection: 'column',
            borderRadius: 18, overflow: 'hidden',
            background: 'linear-gradient(180deg, #1a1a1e, #0e0e10)',
            border: `1px solid ${c.border}`,
            boxShadow: '0 30px 80px rgba(0,0,0,.5)',
        }}>
            {/* Header */}
            <div style={{
                padding: 16, display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 12, alignItems: 'center',
                borderBottom: `1px solid ${c.border}`,
                background: `linear-gradient(135deg, ${c.bg}, transparent)`,
            }}>
                <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: `linear-gradient(135deg, ${c.accent}, ${c.accent}80)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 0 14px ${c.accent}66`,
                }}>
                    <ChefHat size={20} style={{ color: '#000' }} />
                </div>
                <div>
                    <div style={{ fontSize: 9, letterSpacing: '.25em', fontWeight: 700, color: c.accent }}>ROOK · PITMASTER COACH</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                        {loading ? 'Ik kijk wat er nu gebeurt…' : 'Klaar voor je vraag'}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    {voiceSupported && (
                        <button onClick={() => setVoiceOn(v => !v)} style={iconBtnStyle()}>
                            {voiceOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
                        </button>
                    )}
                    <button onClick={() => setExpanded(false)} style={iconBtnStyle()}>
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Current directive permanent zichtbaar bovenin chat-area */}
            {directive && (
                <div style={{ padding: '12px 16px', background: c.bg, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 9, letterSpacing: '.2em', fontWeight: 700, color: c.accent, marginBottom: 4 }}>
                        ACTUELE DIRECTIVE
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.45 }}>{directive.directive}</div>
                    {directive.context && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
                            {directive.context}
                        </div>
                    )}
                </div>
            )}

            {/* Chat scroll-area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 200 }}>
                {chatLog.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)', fontSize: 12 }}>
                        Stel een vraag — Rook denkt mee. <br />
                        <span style={{ fontSize: 10 }}>Bijvoorbeeld: "Brisket loopt achter, wat nu?"</span>
                    </div>
                )}
                {chatLog.map((m, i) => (
                    <div key={i} style={{
                        alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        padding: '8px 12px',
                        borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: m.role === 'user' ? 'rgba(255,255,255,.05)' : `${c.accent}14`,
                        border: m.role === 'user' ? '1px solid var(--border)' : `1px solid ${c.accent}33`,
                        fontSize: 13, color: 'var(--text)', lineHeight: 1.45,
                    }}>
                        {m.role === 'chef' && <div style={{ fontSize: 9, letterSpacing: '.18em', fontWeight: 700, color: c.accent, marginBottom: 3 }}>ROOK</div>}
                        {m.text}
                    </div>
                ))}
            </div>

            {/* Quick prompts */}
            <div style={{ padding: '6px 16px', display: 'flex', flexWrap: 'wrap', gap: 4, borderTop: '1px solid var(--border)' }}>
                {['Wat moet er nu?', 'Loop ik op tijd?', 'Wat komt na deze gang?'].map(q => (
                    <button key={q} onClick={() => fetchDirective(q)} disabled={loading} style={{
                        padding: '4px 10px', borderRadius: 999, fontSize: 10, color: 'var(--muted)',
                        background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', cursor: 'pointer',
                    }}>
                        {q}
                    </button>
                ))}
            </div>

            {/* Input */}
            <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
                <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && chatInput.trim()) {
                            fetchDirective(chatInput);
                            setChatInput('');
                        }
                    }}
                    placeholder="Vraag aan Rook…"
                    style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8,
                        background: 'var(--color-bg-deep)', border: '1px solid var(--border)',
                        color: 'var(--text)', fontSize: 12, outline: 'none',
                    }}
                />
                <button
                    onClick={() => { if (chatInput.trim()) { fetchDirective(chatInput); setChatInput(''); } }}
                    disabled={!chatInput.trim() || loading}
                    style={{
                        padding: '8px 14px', borderRadius: 8,
                        background: chatInput.trim() && !loading ? `linear-gradient(180deg, ${c.accent}, ${c.accent}99)` : 'var(--muted-light)',
                        color: '#000', border: 'none', cursor: chatInput.trim() && !loading ? 'pointer' : 'not-allowed',
                        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
                    }}
                >
                    <Send size={12} />
                </button>
            </div>
        </div>
    );
}

const iconBtnStyle = (): React.CSSProperties => ({
    width: 28, height: 28, borderRadius: 7,
    background: 'rgba(0,0,0,.4)', border: '1px solid var(--border)',
    color: 'var(--muted)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
});

/* Web Speech API — Dutch female voice (closest to "Rook" persoon) */
function speakDutch(text: string) {
    try {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'nl-NL';
        u.rate = 1.05;
        u.pitch = 0.95;
        const voices = window.speechSynthesis.getVoices();
        const nl = voices.find(v => v.lang.startsWith('nl'));
        if (nl) u.voice = nl;
        window.speechSynthesis.cancel();  /* stop voorgaande */
        window.speechSynthesis.speak(u);
    } catch { /* fail silent */ }
}
