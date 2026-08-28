/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, ChefHat, Send, Volume2, VolumeX, Minimize2, Maximize2, Loader2, X } from 'lucide-react';

const GOLD = '#c4a35a';
const BRAND = '#FFBF00';

/*
 * AI Chef Assistant — open AI-platform side-dock
 * ──────────────────────────────────────────────
 * Default: docked rechter zijbalk over volledige hoogte (380px breed).
 * Persistent chat-historie, grote tekstinput, voice optie, quick-prompts.
 * Minimize → kleine bubble rechtsonder die je weer kan openen.
 *
 * Auto-refresh: elke 60s nieuwe directive op basis van event-context.
 * Chat: vrije vragen aan Rook met server roundtrip naar /api/chef-coach.
 */

export interface ChefContext {
    now: string;
    /* Event-level info */
    eventTitle?: string;
    eventVenue?: string;
    eventGuests?: number;
    /* Active course */
    activeCourseId?: string;
    activeCourseTitle?: string;
    activeCourseStart?: string;
    activeCourseStatus?: string;
    activeCourseDescription?: string;
    /* Volgende */
    minsUntilNextCourse?: number;
    nextCourseTitle?: string;
    /* Voortgang */
    misePctDone?: number;
    miseRemaining?: { label: string; critical?: boolean }[];
    coursesProgress?: { num: number; title: string; status: string; servedPortions?: number; totalPortions?: number }[];
    /* Smoker */
    smoker?: { item: string; temp: number; target: number; etaMinutes: number };
    /* Allergie-detail per tafel — Rook moet weten wélke tafel wat heeft */
    allergies?: { person: string; issue: string; severity: string; table?: number; allergens?: string[] }[];
    /* View-context: hub / board / detail / wrapup */
    currentView?: string;
}

interface ChefDirective {
    directive: string;
    severity: 'praise' | 'normal' | 'urgent' | 'critical';
    actionLabel?: string | null;
    context?: string | null;
    generatedAt: string;
}

interface ChatMsg {
    role: 'rook' | 'pitmaster';
    text: string;
    severity?: ChefDirective['severity'];
    actionLabel?: string | null;
    ts: string;
}

const SEVERITY_COLORS = {
    praise: { bg: 'rgba(34,197,94,.12)', border: 'rgba(34,197,94,.4)', accent: '#22c55e', label: 'STRAK' },
    normal: { bg: `${GOLD}1a`, border: `${GOLD}40`, accent: GOLD, label: 'COACH' },
    urgent: { bg: `${BRAND}1a`, border: `${BRAND}66`, accent: BRAND, label: 'NU DOEN' },
    critical: { bg: 'rgba(239,68,68,.12)', border: 'rgba(239,68,68,.5)', accent: 'var(--red)', label: 'KRITISCH' },
};

const QUICK_PROMPTS = [
    'Wat moet er nu?',
    'Loop ik op tijd?',
    'Wat komt na deze gang?',
    'Geef me een kort moraal-boost',
    'Hoe staan we ervoor?',
];

export default function AIChefAssistant({
    context,
    refreshIntervalMs = 60_000,
    enabled = true,
    onDockChange,
    onDirective,
    dockSignal,
    hideLauncher = false,
}: {
    context: ChefContext;
    refreshIntervalMs?: number;
    enabled?: boolean;
    onDockChange?: (docked: boolean) => void;
    /** Laatste directive naar buiten — voor de V2 directive-strip op het bord. */
    onDirective?: (d: { text: string; severity: 'praise' | 'normal' | 'urgent' | 'critical'; generatedAt?: string }) => void;
    /** Verhoog dit getal om het paneel extern te openen (strip-tap op het bord). */
    dockSignal?: number;
    /** Geen zwevende bubble als het paneel dicht is — de V2-strip vervangt hem. */
    hideLauncher?: boolean;
}) {
    // Default: open op desktop, dicht op mobile (Rook is dan een floating bubble
    // die je antikt, opent als bottom-sheet ipv de hele viewport te kapen).
    const [docked, setDocked] = useState(() => {
        if (typeof window === 'undefined') return true;
        return window.innerWidth >= 768;
    });
    const [directive, setDirective] = useState<ChefDirective | null>(null);
    const [loading, setLoading] = useState(false);
    const [chatLog, setChatLog] = useState<ChatMsg[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [voiceOn, setVoiceOn] = useState(false);
    const [voiceSupported, setVoiceSupported] = useState(false);
    const lastSpokenRef = useRef<string | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    /* Persist mode + chat-log in localStorage */
    useEffect(() => {
        try {
            const s = typeof window !== 'undefined' ? localStorage.getItem('rook_assistant_v1') : null;
            if (s) {
                const p = JSON.parse(s);
                if (typeof p.docked === 'boolean') setDocked(p.docked);
                if (Array.isArray(p.chatLog)) setChatLog(p.chatLog.slice(-30));   /* houd laatste 30 berichten */
            }
        } catch { /* */ }
    }, []);
    useEffect(() => {
        try { localStorage.setItem('rook_assistant_v1', JSON.stringify({ docked, chatLog })); } catch { /* */ }
        onDockChange?.(docked);
    }, [docked, chatLog, onDockChange]);

    /* Voice support detect */
    useEffect(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) setVoiceSupported(true);
    }, []);

    /* Extern open-signaal (V2 directive-strip op het bord). */
    useEffect(() => {
        if (dockSignal && dockSignal > 0) setDocked(true);
    }, [dockSignal]);

    /* Auto-scroll chat */
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [chatLog, directive]);

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
                onDirective?.({ text: d.directive, severity: d.severity, generatedAt: d.generatedAt });
                if (userQuestion) {
                    setChatLog(prev => [
                        ...prev,
                        { role: 'pitmaster', text: userQuestion, ts: new Date().toISOString() },
                        { role: 'rook', text: body.directive, severity: d.severity, actionLabel: d.actionLabel, ts: body.generatedAt },
                    ]);
                } else {
                    /* Auto-refresh: log alleen als directive nieuw is */
                    if (body.directive !== lastSpokenRef.current) {
                        setChatLog(prev => [
                            ...prev,
                            { role: 'rook', text: body.directive, severity: d.severity, actionLabel: d.actionLabel, ts: body.generatedAt },
                        ]);
                    }
                }
                if (voiceOn && voiceSupported && body.directive !== lastSpokenRef.current) {
                    speakDutch(body.directive);
                    lastSpokenRef.current = body.directive;
                }
            }
        } catch { /* */ }
        setLoading(false);
    }, [context, enabled, voiceOn, voiceSupported, onDirective]);

    /* Initial + interval.
       Elke tik is een volledige AI-aanroep via /api/chef-coach. Een service van
       vijf uur met het scherm aan gaf zo ~300 aanroepen per open scherm — ook
       als de tablet allang op zwart stond of in een andere app. Daarom slaan we
       een tik over zolang het tabblad verborgen is, en halen we bij terugkomst
       meteen een verse directive op. Voor wie wél naar het scherm kijkt
       verandert er niets. */
    useEffect(() => {
        if (!enabled) return;
        fetchDirective();

        /* Elke ophaal is een AI-aanroep, dus ook bij terugkomst op het tabblad
           houden we minstens het normale interval aan. Anders levert wisselen
           tussen apps op de tablet een aanroep per wissel op. */
        let laatsteOphaal = Date.now();
        const tick = () => {
            if (document.visibilityState === 'hidden') return;
            laatsteOphaal = Date.now();
            fetchDirective();
        };
        const interval = setInterval(tick, refreshIntervalMs);

        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            if (Date.now() - laatsteOphaal < refreshIntervalMs) return;
            laatsteOphaal = Date.now();
            fetchDirective();
        };
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, refreshIntervalMs, context.activeCourseId, context.misePctDone]);

    if (!enabled) return null;
    const c = directive ? SEVERITY_COLORS[directive.severity] : SEVERITY_COLORS.normal;

    /* ── MINIMIZED: floating bubble (V2-bord vervangt hem door de strip) ── */
    if (!docked) {
        if (hideLauncher) return null;
        return (
            <button onClick={() => setDocked(true)} title="Open Rook" style={{
                position: 'fixed', bottom: 24, right: 24, zIndex: 9000,
                width: 64, height: 64, borderRadius: 18, border: 'none',
                background: `linear-gradient(135deg, ${c.accent}, ${c.accent}80)`,
                cursor: 'pointer', boxShadow: `0 12px 30px rgba(0,0,0,.5), 0 0 24px ${c.accent}66`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <ChefHat size={28} style={{ color: '#000' }} />
                {loading && (
                    <div style={{
                        position: 'absolute', inset: -3, borderRadius: 21,
                        border: `2px solid ${c.accent}`, borderTopColor: 'transparent',
                        animation: 'spin 1s linear infinite',
                    }} />
                )}
                {(directive?.severity === 'urgent' || directive?.severity === 'critical') && (
                    <span style={{
                        position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: '50%',
                        background: c.accent, boxShadow: `0 0 12px ${c.accent}`, animation: 'pulse-prep 1.2s infinite',
                    }} />
                )}
            </button>
        );
    }

    /* ── DOCKED: open AI-platform side panel (mobile: full-screen) ── */
    return (
        <aside className="rook-assistant-aside" style={{
            zIndex: 8500,
            display: 'flex', flexDirection: 'column',
            background: 'linear-gradient(180deg, #15151a, #0d0d10)',
            borderLeft: `1px solid ${c.border}`,
            boxShadow: '-8px 0 40px rgba(0,0,0,.4)',
        }}>
            {/* Header */}
            <div style={{
                padding: '14px 16px', borderBottom: `1px solid ${c.border}`,
                background: `linear-gradient(135deg, ${c.bg}, transparent)`,
                display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 12, alignItems: 'center',
                flexShrink: 0,
            }}>
                <div style={{
                    width: 40, height: 40, borderRadius: 11, position: 'relative',
                    background: `linear-gradient(135deg, ${c.accent}, ${c.accent}80)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 0 14px ${c.accent}66`,
                }}>
                    <ChefHat size={20} style={{ color: '#000' }} />
                    {loading && (
                        <div style={{
                            position: 'absolute', inset: -3, borderRadius: 14,
                            border: `2px solid ${c.accent}`, borderTopColor: 'transparent',
                            animation: 'spin 1s linear infinite',
                        }} />
                    )}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 9, letterSpacing: '.25em', fontWeight: 700, color: c.accent }}>ROOK · PITMASTER COACH</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: loading ? BRAND : '#22c55e', animation: loading ? 'pulse-prep 1s infinite' : undefined }} />
                        {loading ? 'Aan het kijken…' : 'Online · klaar voor je vraag'}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    {voiceSupported && (
                        <button onClick={() => setVoiceOn(v => !v)} title={voiceOn ? 'Stem uit' : 'Stem aan'} style={iconBtnStyle(voiceOn ? c.accent : 'var(--muted)')}>
                            {voiceOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
                        </button>
                    )}
                    <button onClick={() => setDocked(false)} title="Verberg" style={iconBtnStyle()}>
                        <Minimize2 size={14} />
                    </button>
                </div>
            </div>

            {/* Actuele directive (always pinned) */}
            {directive && (
                <div style={{
                    padding: '14px 16px', background: c.bg, borderBottom: '1px solid var(--border)',
                    flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <Sparkles size={11} style={{ color: c.accent }} />
                        <span style={{ fontSize: 9, letterSpacing: '.2em', fontWeight: 700, color: c.accent }}>{c.label}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--muted-light)' }}>nu</span>
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.45, fontWeight: 500 }}>
                        {directive.directive}
                    </div>
                    {directive.context && (
                        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                            {directive.context}
                        </div>
                    )}
                    {directive.actionLabel && (
                        <div style={{
                            marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 4,
                            background: `${c.accent}22`, color: c.accent, fontSize: 10, fontWeight: 700, letterSpacing: '.1em',
                        }}>
                            {directive.actionLabel.toUpperCase()}
                        </div>
                    )}
                </div>
            )}

            {/* Chat scroll */}
            <div ref={scrollRef} style={{
                flex: 1, overflowY: 'auto', padding: '14px 16px',
                display: 'flex', flexDirection: 'column', gap: 10,
            }}>
                {chatLog.length === 0 && !directive && (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: 12, lineHeight: 1.6 }}>
                        <ChefHat size={32} style={{ color: 'var(--muted-light)', marginBottom: 12 }} />
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 300, color: 'var(--text)', marginBottom: 6 }}>Rook luistert mee</div>
                        <div>Stel een vraag, of laat me elke minuut zelf met een tip komen op basis van wat er gebeurt.</div>
                    </div>
                )}
                {chatLog.length > 0 && (
                    <div style={{ fontSize: 9, letterSpacing: '.18em', fontWeight: 700, color: 'var(--muted-light)', marginBottom: 4 }}>
                        EERDERE BERICHTEN · {chatLog.length}
                    </div>
                )}
                {chatLog.map((m, i) => {
                    const sc = m.severity ? SEVERITY_COLORS[m.severity] : SEVERITY_COLORS.normal;
                    return (
                        <div key={i} style={{
                            alignSelf: m.role === 'pitmaster' ? 'flex-end' : 'flex-start',
                            maxWidth: '90%',
                            padding: '10px 12px',
                            borderRadius: m.role === 'pitmaster' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                            background: m.role === 'pitmaster' ? 'rgba(255,255,255,.05)' : sc.bg,
                            border: m.role === 'pitmaster' ? '1px solid var(--border)' : `1px solid ${sc.border}`,
                            fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5,
                        }}>
                            {m.role === 'rook' && (
                                <div style={{ fontSize: 8, letterSpacing: '.2em', fontWeight: 700, color: sc.accent, marginBottom: 4 }}>
                                    ROOK · {sc.label}
                                </div>
                            )}
                            <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                            {m.actionLabel && (
                                <div style={{
                                    marginTop: 6, display: 'inline-flex', padding: '2px 7px', borderRadius: 4,
                                    background: `${sc.accent}22`, color: sc.accent, fontSize: 9, fontWeight: 700, letterSpacing: '.1em',
                                }}>{m.actionLabel.toUpperCase()}</div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Quick prompts */}
            <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ fontSize: 9, letterSpacing: '.18em', fontWeight: 700, color: 'var(--muted-light)', marginBottom: 6 }}>SNELLE VRAGEN</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {QUICK_PROMPTS.map(q => (
                        <button key={q} onClick={() => fetchDirective(q)} disabled={loading} style={{
                            padding: '5px 10px', borderRadius: 999, fontSize: 10.5, color: 'var(--text)',
                            background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', cursor: 'pointer',
                            transition: '.12s',
                        }}
                            onMouseEnter={e => e.currentTarget.style.background = `${c.accent}1f`}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.04)'}>
                            {q}
                        </button>
                    ))}
                    {chatLog.length > 0 && (
                        <button onClick={() => setChatLog([])} title="Chat wissen" style={{
                            padding: '5px 10px', borderRadius: 999, fontSize: 10.5,
                            color: 'var(--muted)', background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                            <X size={10} /> Wis chat
                        </button>
                    )}
                </div>
            </div>

            {/* Input */}
            <div style={{
                padding: '12px 14px', borderTop: '1px solid var(--border)',
                background: 'rgba(0,0,0,.3)', display: 'flex', gap: 6, flexShrink: 0,
            }}>
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
                        flex: 1, padding: '10px 12px', borderRadius: 8,
                        background: 'var(--color-bg-deep)', border: '1px solid var(--border)',
                        color: 'var(--text)', fontSize: 13, outline: 'none',
                    }}
                />
                <button
                    onClick={() => { if (chatInput.trim()) { fetchDirective(chatInput); setChatInput(''); } }}
                    disabled={!chatInput.trim() || loading}
                    style={{
                        padding: '10px 14px', borderRadius: 8,
                        background: chatInput.trim() && !loading ? `linear-gradient(180deg, ${c.accent}, ${c.accent}99)` : 'var(--muted-light)',
                        color: '#000', border: 'none',
                        cursor: chatInput.trim() && !loading ? 'pointer' : 'not-allowed',
                        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
                    }}
                >
                    {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                </button>
            </div>
        </aside>
    );
}

const iconBtnStyle = (color = 'var(--muted)'): React.CSSProperties => ({
    width: 30, height: 30, borderRadius: 7,
    background: 'rgba(0,0,0,.3)', border: '1px solid var(--border)',
    color, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
});

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
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
    } catch { /* */ }
}

/* Maximize-knop voor andere pagina's wanneer Rook minimized is */
export function ChefMaximizeButton({ onMaximize }: { onMaximize: () => void }) {
    return (
        <button onClick={onMaximize} title="Open Rook" style={iconBtnStyle()}>
            <Maximize2 size={14} />
        </button>
    );
}
