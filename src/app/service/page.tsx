/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useMemo } from 'react';
import {
    ArrowLeft, Play, Check, Clock, Flame, CheckCircle, Award, ChevronRight, AlertTriangle,
    Sparkles, BookOpen, Users, Leaf, ListChecks, Package, Grid3x3, ShieldCheck, Camera,
    UtensilsCrossed, Palette, HandPlatter, Undo2, X,
} from 'lucide-react';
import {
    SERVICE_EVENTS, SERVICE_AI_DIRECTIVES, ALLERGENS,
    type ServiceEvent, type Course, type CourseStatus, type CourseItem,
} from './_data/serviceMockData';
import AIChefAssistant, { type ChefContext } from '@/components/service/AIChefAssistant';

const GOLD = '#c4a35a';
const BRAND = '#FFBF00';

/* ═══════════════════════════════════════════════════════════════════
   STATE: deep-clone event op selectie + persist mutaties in localStorage
   ═══════════════════════════════════════════════════════════════════ */

type View = 'hub' | 'board' | 'detail';

const STATE_KEY = 'service_mode_v4';

interface PersistedState {
    view: View;
    eventId: string | null;
    courseId: string | null;
    eventState: ServiceEvent | null;
}

function loadState(): PersistedState {
    if (typeof window === 'undefined') return { view: 'hub', eventId: null, courseId: null, eventState: null };
    try {
        const raw = localStorage.getItem(STATE_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* */ }
    return { view: 'hub', eventId: null, courseId: null, eventState: null };
}

/* ═══════════════════════════════════════════════════════════════════
   ATOMS
   ═══════════════════════════════════════════════════════════════════ */
function Pill({ tone = 'gray', children }: { tone?: 'amber' | 'gray' | 'red' | 'green' | 'blue'; children: React.ReactNode }) {
    const tones = {
        amber: { bg: `${BRAND}1f`, color: BRAND, border: `${BRAND}40` },
        gray: { bg: 'rgba(255,255,255,.05)', color: 'var(--muted)', border: 'var(--border)' },
        red: { bg: 'rgba(239,68,68,.12)', color: '#f87171', border: 'rgba(239,68,68,.3)' },
        green: { bg: 'rgba(34,197,94,.12)', color: '#34d399', border: 'rgba(34,197,94,.3)' },
        blue: { bg: 'rgba(96,165,250,.12)', color: '#60a5fa', border: 'rgba(96,165,250,.3)' },
    } as const;
    const t = tones[tone];
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999,
            background: t.bg, color: t.color, border: `1px solid ${t.border}`,
            fontSize: 11, fontWeight: 600, letterSpacing: '.04em',
        }}>{children}</span>
    );
}

function HelpNote({ title, children, tone = 'amber' }: { title: string; children: React.ReactNode; tone?: 'amber' | 'blue' | 'green' }) {
    const tones = {
        amber: { bg: `${BRAND}0d`, border: `${BRAND}40`, color: BRAND },
        blue: { bg: 'rgba(96,165,250,.08)', border: 'rgba(96,165,250,.3)', color: '#60a5fa' },
        green: { bg: 'rgba(34,197,94,.08)', border: 'rgba(34,197,94,.3)', color: '#34d399' },
    } as const;
    const t = tones[tone];
    return (
        <div style={{ padding: 14, marginBottom: 16, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.color, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <BookOpen size={13} /> {title}
            </div>
            {children}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   HUB — event picker
   ═══════════════════════════════════════════════════════════════════ */
function ServiceModeHub({ events, onPickEvent }: { events: ServiceEvent[]; onPickEvent: (id: string) => void }) {
    const liveEvent = events.find(e => e.status === 'live');
    const upcoming = events.filter(e => e.status !== 'live');

    return (
        <div style={{ padding: '32px 40px', minHeight: '100vh' }}>
            <div style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Pill tone="amber">Service Mode</Pill>
                    <Pill tone="gray">Live KDS</Pill>
                </div>
                <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 36, margin: 0, fontWeight: 200, letterSpacing: '-.02em' }}>Welk event ga je draaien?</h1>
                <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 15, lineHeight: 1.5 }}>
                    Selecteer een event om de Live KDS te starten. Menu, allergieën en gastinformatie laden automatisch in.
                </p>
            </div>

            <HelpNote title="Hoe werkt Service Mode?" tone="amber">
                <strong style={{ color: BRAND }}>Stap 1:</strong> tap een event om te starten — menu en allergieën laden automatisch.<br />
                <strong style={{ color: BRAND }}>Stap 2:</strong> op het bord zie je de gangen verdeeld over 4 kolommen (Wachtend / Bezig / Klaar / Geserveerd).<br />
                <strong style={{ color: BRAND }}>Stap 3:</strong> tap een gang voor de fullscreen bereidingswijze met stappen, mise, kwaliteits-check.<br />
                <span style={{ color: BRAND, fontWeight: 600 }}>💡 Tip:</span> houd de tablet bij de smoker — alles werkt met grote tap-targets.
            </HelpNote>

            {liveEvent && (
                <div onClick={() => onPickEvent(liveEvent.id)} style={{
                    position: 'relative', background: liveEvent.banner, borderRadius: 18,
                    border: '2px solid rgba(217,119,6,.5)', padding: 32, marginBottom: 24, cursor: 'pointer',
                    overflow: 'hidden', boxShadow: '0 12px 40px rgba(217,119,6,.18)',
                    transition: 'transform .2s, box-shadow .2s',
                }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 16px 50px rgba(217,119,6,.28)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(217,119,6,.18)'; }}
                >
                    <div style={{ position: 'absolute', top: 24, right: 24, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(220,38,38,.9)', padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: '.06em', color: '#fff' }}>
                        <span style={{ width: 8, height: 8, background: '#fff', borderRadius: '50%', animation: 'pulse-prep 1.4s infinite' }} />
                        LIVE — NU BEZIG
                    </div>

                    <div style={{ fontSize: 64, marginBottom: 16 }}>{liveEvent.hero}</div>

                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 28, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 260 }}>
                            <div style={{ color: '#fcd34d', fontSize: 12, fontWeight: 600, letterSpacing: '.08em', marginBottom: 4 }}>{liveEvent.date.toUpperCase()}</div>
                            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 32, margin: 0, fontWeight: 300, color: '#fff' }}>{liveEvent.title}</h2>
                            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 15, marginTop: 4 }}>{liveEvent.venue} · {liveEvent.package}</div>
                        </div>

                        <div style={{ display: 'flex', gap: 22 }}>
                            <Stat val={liveEvent.guests} label="Gasten" />
                            <Stat val={liveEvent.courses.length} label="Gangen" />
                            <Stat val={liveEvent.courses.filter(c => c.status === 'served').length} label="Klaar" tone="success" />
                            <Stat val={liveEvent.courses.filter(c => c.status === 'active').length} label="Bezig" tone="amber" />
                        </div>

                        <button style={{
                            background: BRAND, color: '#0f0f0f', fontWeight: 700, fontSize: 16, padding: '12px 24px',
                            borderRadius: 12, border: 'none', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                        }}>
                            <Play size={18} /> Doorgaan met service →
                        </button>
                    </div>

                    {liveEvent.allergyTable.length > 0 && (
                        <div style={{ marginTop: 22, padding: 14, background: 'rgba(0,0,0,.35)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                            <AlertTriangle size={18} style={{ color: '#fbbf24' }} />
                            <div style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,.9)' }}>
                                <strong>{liveEvent.allergyTable.length} bijzondere diëten/allergieën</strong> — automatisch gemarkeerd in alle gangen
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {[...new Set(liveEvent.allergyTable.flatMap(a => a.allergens))].map(a => (
                                    <span key={a} style={{ padding: '4px 10px', background: 'rgba(220,38,38,.25)', border: '1px solid rgba(220,38,38,.5)', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                                        {ALLERGENS[a]?.label || a}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {upcoming.length > 0 && (
                <>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase', margin: '0 0 16px' }}>Komende events</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
                        {upcoming.map(evt => (
                            <div key={evt.id} onClick={() => onPickEvent(evt.id)} style={{
                                background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: 20,
                                cursor: 'pointer', transition: 'transform .15s, border-color .15s, box-shadow .15s',
                            }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = BRAND; e.currentTarget.style.boxShadow = `0 8px 22px ${BRAND}1f`; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <div style={{ fontSize: 32 }}>{evt.hero}</div>
                                    <Pill tone="gray">{evt.type}</Pill>
                                </div>
                                <div style={{ color: BRAND, fontSize: 11, fontWeight: 600, letterSpacing: '.06em', marginBottom: 4 }}>{evt.date.toUpperCase()}</div>
                                <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 18, margin: 0, fontWeight: 400 }}>{evt.title}</h3>
                                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{evt.venue}</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                                    <SmallStat val={evt.guests} label="gasten" />
                                    <SmallStat val={evt.courses.length} label="gangen" />
                                    <SmallStat val={evt.allergyTable.length} label="diëten" />
                                </div>
                                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
                                    <span>{evt.package}</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: BRAND, fontWeight: 600 }}>
                                        Open <ChevronRight size={14} />
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <div style={{ marginTop: 28, padding: 18, background: `linear-gradient(90deg, ${BRAND}14, transparent)`, border: `1px solid ${BRAND}40`, borderRadius: 12, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 36, height: 36, background: BRAND, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Sparkles size={18} style={{ color: '#0f0f0f' }} />
                </div>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Chef AI Coach staat klaar</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                        Tijdens de service krijg je real-time advies: timing, plaats-optimalisatie, allergie-checks en kwaliteit-bewaking.
                    </div>
                </div>
            </div>
        </div>
    );
}

function Stat({ val, label, tone }: { val: number | string; label: string; tone?: 'success' | 'amber' }) {
    return (
        <div style={{ textAlign: 'center', minWidth: 60 }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 200, color: tone === 'success' ? '#34d399' : tone === 'amber' ? '#fbbf24' : '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.65)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
        </div>
    );
}
function SmallStat({ val, label }: { val: number | string; label: string }) {
    return (
        <div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 17, fontWeight: 400, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{val}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{label}</div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   BOARD — Kanban (queued / active / ready / served)
   ═══════════════════════════════════════════════════════════════════ */
function ServiceModeBoard({ event, onOpenCourse, onAdvanceStatus, onBack, rookOffset }: {
    event: ServiceEvent;
    onOpenCourse: (cid: string) => void;
    onAdvanceStatus: (cid: string) => void;
    onBack: () => void;
    rookOffset: number;
}) {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(t);
    }, []);

    const queued = event.courses.filter(c => c.status === 'queued');
    const active = event.courses.filter(c => c.status === 'active');
    const ready = event.courses.filter(c => c.status === 'ready');
    const served = event.courses.filter(c => c.status === 'served');
    const totalDone = served.length;
    const progressPct = (totalDone / event.courses.length) * 100;

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Top bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 28px', background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--border)', marginRight: rookOffset }}>
                <button onClick={onBack} style={{
                    background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)',
                    padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13,
                }}>
                    <ArrowLeft size={14} /> Terug
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{event.venue} · {event.guests}p · gestart {event.startTime}</div>
                </div>
                <div style={{ width: 220 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 5 }}>
                        <span>Voortgang</span>
                        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{totalDone}/{event.courses.length} gangen</span>
                    </div>
                    <div style={{ height: 7, background: 'rgba(255,255,255,.05)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${progressPct}%`, height: '100%', background: `linear-gradient(90deg, ${BRAND}, ${GOLD})`, transition: 'width .4s' }} />
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                        {now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>Service tijd</div>
                </div>
                <Pill tone="green">
                    <span style={{ width: 7, height: 7, background: '#34d399', borderRadius: '50%' }} /> Op schema
                </Pill>
            </div>

            <ServiceAIBar />

            <div style={{ flex: 1, padding: '20px 22px', overflow: 'auto', marginRight: rookOffset }}>
                <HelpNote title="Zo werkt het bord" tone="amber">
                    <strong style={{ color: BRAND }}>Kolommen:</strong> elke gang doorloopt 4 fases — Wachtend → Bezig → Klaar → Geserveerd.<br />
                    <strong style={{ color: BRAND }}>Knop op de card:</strong> tap "Start" / "Markeer klaar" / "Naar uitgifte" om snel door te schuiven.<br />
                    <strong style={{ color: BRAND }}>Card tappen:</strong> opent fullscreen bereidingswijze.<br />
                    <strong style={{ color: BRAND }}>Per-tafel grid:</strong> oranje = bezig, groen = klaar. <span style={{ color: '#f87171' }}>Rode rand = allergie/dieet.</span>
                </HelpNote>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, alignContent: 'start' }}>
                    <Column title="Wachtend" Icon={Clock} tone="gray" courses={queued} event={event} onOpenCourse={onOpenCourse} onAdvanceStatus={onAdvanceStatus} />
                    <Column title="In bereiding" Icon={Flame} tone="amber" courses={active} event={event} onOpenCourse={onOpenCourse} onAdvanceStatus={onAdvanceStatus} />
                    <Column title="Klaar voor uitgifte" Icon={CheckCircle} tone="green" courses={ready} event={event} onOpenCourse={onOpenCourse} onAdvanceStatus={onAdvanceStatus} />
                    <Column title="Geserveerd" Icon={Award} tone="muted" courses={served} event={event} onOpenCourse={onOpenCourse} onAdvanceStatus={onAdvanceStatus} />
                </div>
            </div>
        </div>
    );
}

function ServiceAIBar() {
    const directives = SERVICE_AI_DIRECTIVES;
    const [activeIdx, setActiveIdx] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setActiveIdx(i => (i + 1) % directives.length), 6000);
        return () => clearInterval(t);
    }, [directives.length]);
    const d = directives[activeIdx];
    if (!d) return null;
    const sevColor = d.severity === 'critical' ? '#f87171' : d.severity === 'opportunity' ? BRAND : '#60a5fa';
    const sevBg = d.severity === 'critical' ? 'rgba(239,68,68,.08)' : d.severity === 'opportunity' ? `${BRAND}14` : 'rgba(96,165,250,.08)';
    return (
        <div style={{ background: sevBg, borderBottom: `1px solid ${sevColor}40`, padding: '10px 28px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 28, height: 28, background: sevColor, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {d.severity === 'critical' ? <AlertTriangle size={14} style={{ color: '#0f0f0f' }} /> : d.severity === 'opportunity' ? <Sparkles size={14} style={{ color: '#0f0f0f' }} /> : <Clock size={14} style={{ color: '#0f0f0f' }} />}
            </div>
            <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: sevColor, marginRight: 10 }}>{d.title}</span>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{d.body}</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
                {directives.map((_, i) => (
                    <button key={i} onClick={() => setActiveIdx(i)} style={{ width: 6, height: 6, padding: 0, border: 'none', borderRadius: '50%', background: i === activeIdx ? sevColor : 'rgba(255,255,255,.2)', cursor: 'pointer' }} />
                ))}
            </div>
        </div>
    );
}

function Column({ title, Icon, tone, courses, event, onOpenCourse, onAdvanceStatus }: {
    title: string; Icon: any; tone: 'gray' | 'amber' | 'green' | 'muted';
    courses: Course[]; event: ServiceEvent; onOpenCourse: (cid: string) => void; onAdvanceStatus: (cid: string) => void;
}) {
    const toneColors = {
        gray: { border: 'var(--border)', text: 'var(--muted)', bg: 'transparent' },
        amber: { border: `${BRAND}66`, text: BRAND, bg: `${BRAND}0a` },
        green: { border: 'rgba(34,197,94,.4)', text: '#34d399', bg: 'rgba(34,197,94,.04)' },
        muted: { border: 'var(--border)', text: 'var(--muted)', bg: 'transparent' },
    }[tone];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                background: toneColors.bg, border: `1px solid ${toneColors.border}`, borderRadius: 10,
            }}>
                <Icon size={15} style={{ color: toneColors.text }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: toneColors.text, letterSpacing: '.04em', textTransform: 'uppercase' }}>{title}</span>
                <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: toneColors.text }}>{courses.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {courses.length === 0 && (
                    <div style={{ padding: 22, textAlign: 'center', color: 'var(--muted)', fontSize: 12, fontStyle: 'italic', border: '1px dashed var(--border)', borderRadius: 10 }}>geen gangen</div>
                )}
                {courses.map(course => (
                    <CourseCard key={course.id} course={course} event={event} onOpen={() => onOpenCourse(course.id)} onAdvance={() => onAdvanceStatus(course.id)} />
                ))}
            </div>
        </div>
    );
}

function CourseCard({ course, event, onOpen, onAdvance }: { course: Course; event: ServiceEvent; onOpen: () => void; onAdvance: () => void }) {
    const totalPortions = course.items.reduce((acc, i) => acc + (i.count || 0), 0);
    const allergyItems = course.items.filter(i => i.special).length;
    const isActive = course.status === 'active';
    return (
        <div onClick={onOpen} style={{
            background: 'var(--color-bg-elevated)', border: `1px solid ${isActive ? `${BRAND}66` : 'var(--border)'}`,
            borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
            boxShadow: isActive ? `0 0 0 2px ${BRAND}26` : 'none', transition: 'transform .15s, border-color .15s',
        }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
            <div style={{ height: 70, background: course.imgGradient, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 34 }}>{course.emoji}</div>
                <div style={{ position: 'absolute', top: 7, left: 7, background: 'rgba(0,0,0,.6)', padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: '.04em', color: '#fff' }}>
                    GANG {course.num}/{event.courses.length}
                </div>
                {isActive && (
                    <div style={{ position: 'absolute', top: 7, right: 7, background: 'rgba(220,38,38,.85)', padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, background: '#fff', borderRadius: '50%', animation: 'pulse-prep 1.4s infinite' }} />
                        BEZIG
                    </div>
                )}
            </div>
            <div style={{ padding: 13 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4, lineHeight: 1.25 }}>{course.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4, marginBottom: 10 }}>{course.description}</div>

                {course.aiNote && (
                    <div style={{ fontSize: 11, color: BRAND, background: `${BRAND}14`, padding: '6px 8px', borderRadius: 6, border: `1px solid ${BRAND}40`, marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <Sparkles size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ flex: 1 }}>{course.aiNote}</span>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                    <MetaTag Icon={Users}>{totalPortions}p</MetaTag>
                    <MetaTag Icon={Clock}>{course.prepTime}m prep</MetaTag>
                    {course.vegOption && <MetaTag Icon={Leaf} tone="green">veg/vegan</MetaTag>}
                    {allergyItems > 0 && <MetaTag Icon={AlertTriangle} tone="red">{allergyItems} allergie</MetaTag>}
                </div>

                {(course.status === 'active' || course.status === 'ready') && (
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Per tafel</div>
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(10, course.items.length)}, 1fr)`, gap: 3 }}>
                            {course.items.map(item => (
                                <div key={item.id} title={`Tafel ${item.table} · ${item.count}p${item.special ? ' · ' + item.special : ''}`} style={{
                                    height: 22, borderRadius: 4,
                                    background: item.served ? 'rgba(34,197,94,.4)' : item.ready ? 'rgba(34,197,94,.2)' : item.inProgress ? `${BRAND}40` : 'rgba(255,255,255,.04)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 9, fontWeight: 700,
                                    color: item.served || item.ready ? '#34d399' : item.inProgress ? BRAND : 'var(--muted)',
                                    border: item.special ? '1px solid #f87171' : 'none',
                                }}>{item.table}</div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <button onClick={(e) => { e.stopPropagation(); onAdvance(); }} style={advanceBtnStyle(course.status)}>
                        {course.status === 'queued' && <><Play size={12} />Start</>}
                        {course.status === 'active' && <><Check size={12} />Markeer klaar</>}
                        {course.status === 'ready' && <><HandPlatter size={12} />Naar uitgifte</>}
                        {course.status === 'served' && <><Undo2 size={12} />Recall</>}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onOpen(); }} style={{
                        width: 34, height: 34, background: 'var(--color-bg-deep)', border: '1px solid var(--border)', borderRadius: 8,
                        color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }} title="Bereidingswijze">
                        <BookOpen size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}

function MetaTag({ Icon, children, tone }: { Icon: any; children: React.ReactNode; tone?: 'green' | 'red' }) {
    const colors = {
        default: { bg: 'rgba(255,255,255,.05)', color: 'var(--muted)' },
        green: { bg: 'rgba(34,197,94,.1)', color: '#34d399' },
        red: { bg: 'rgba(220,38,38,.1)', color: '#f87171' },
    };
    const c = colors[tone || 'default'];
    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: c.bg, borderRadius: 6, fontSize: 10.5, color: c.color }}>
            <Icon size={11} /> {children}
        </div>
    );
}

const advanceBtnStyle = (status: CourseStatus): React.CSSProperties => {
    const base: React.CSSProperties = {
        flex: 1, padding: '10px', borderRadius: 8, fontWeight: 700, fontSize: 12,
        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        border: '1px solid var(--border)',
    };
    if (status === 'queued') return { ...base, background: 'var(--color-bg-deep)', color: 'var(--text)' };
    if (status === 'active') return { ...base, background: 'rgba(34,197,94,.15)', color: '#34d399', border: '1px solid rgba(34,197,94,.4)' };
    if (status === 'ready') return { ...base, background: BRAND, color: '#0f0f0f', border: 'none' };
    return { ...base, background: 'var(--color-bg-deep)', color: 'var(--text)' };
};

/* ═══════════════════════════════════════════════════════════════════
   DETAIL — fullscreen course (4 tabs)
   ═══════════════════════════════════════════════════════════════════ */
function ServiceModeDetail({ event, courseId, onBack, onAdvance, onToggleItem, rookOffset }: {
    event: ServiceEvent; courseId: string;
    onBack: () => void; onAdvance: () => void; onToggleItem: (cid: string, iid: string) => void;
    rookOffset: number;
}) {
    const course = event.courses.find(c => c.id === courseId);
    const [tab, setTab] = useState<'steps' | 'mise' | 'tables' | 'quality'>('steps');
    const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});

    if (!course) return null;
    const totalPortions = course.items.reduce((a, i) => a + (i.count || 0), 0);
    const servedPortions = course.items.filter(i => i.served).reduce((a, i) => a + (i.count || 0), 0);
    const stepsCompleted = Object.values(completedSteps).filter(Boolean).length;
    const stepsPct = course.steps.length ? (stepsCompleted / course.steps.length) * 100 : 0;
    const toggleStep = (n: number) => setCompletedSteps(s => ({ ...s, [n]: !s[n] }));

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', marginRight: rookOffset }}>
            {/* Hero header */}
            <div style={{ position: 'relative', minHeight: 260, background: course.imgGradient, padding: '24px 30px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={onBack} style={{
                        background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.15)', color: '#fff',
                        padding: '10px 16px', borderRadius: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
                    }}>
                        <ArrowLeft size={15} /> Terug naar bord
                    </button>
                    <div style={{ flex: 1 }} />
                    <span style={{ background: 'rgba(0,0,0,.55)', padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#fff' }}>
                        GANG {course.num} VAN {event.courses.length}
                    </span>
                    <span style={{
                        background: course.status === 'active' ? 'rgba(220,38,38,.85)' : course.status === 'ready' ? 'rgba(34,197,94,.85)' : course.status === 'served' ? 'rgba(100,116,139,.85)' : 'rgba(0,0,0,.55)',
                        padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#fff',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                        {course.status === 'active' && <span style={{ width: 7, height: 7, background: '#fff', borderRadius: '50%', animation: 'pulse-prep 1.4s infinite' }} />}
                        {course.status === 'queued' ? 'WACHTEND' : course.status === 'active' ? 'BEZIG' : course.status === 'ready' ? 'KLAAR' : 'GESERVEERD'}
                    </span>
                </div>

                <div>
                    <div style={{ fontSize: 86, marginBottom: 4, lineHeight: 1, opacity: 0.9, filter: 'drop-shadow(0 4px 20px rgba(0,0,0,.5))' }}>{course.emoji}</div>
                    <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 42, margin: 0, fontWeight: 200, color: '#fff', letterSpacing: '-.02em', lineHeight: 1.05 }}>{course.title}</h1>
                    <p style={{ fontSize: 16, color: 'rgba(255,255,255,.85)', marginTop: 6, maxWidth: 720, lineHeight: 1.4 }}>{course.description}</p>
                </div>

                <div style={{ display: 'flex', gap: 22, marginTop: 14, flexWrap: 'wrap' }}>
                    <HeroStat Icon={Users} val={`${totalPortions}p`} label="Totaal portions" />
                    <HeroStat Icon={Clock} val={`${course.prepTime}min`} label="Bereiding" />
                    <HeroStat Icon={CheckCircle} val={servedPortions} label="Geserveerd" />
                    {course.vegOption && <HeroStat Icon={Leaf} val="Veg/Vegan" label="Variant" />}
                    {course.aiNote && (
                        <div style={{ flex: 1, minWidth: 280, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(10px)', border: `1px solid ${BRAND}66`, padding: '10px 14px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                            <Sparkles size={16} style={{ color: '#fbbf24' }} />
                            <span style={{ fontSize: 13, color: '#fcd34d', fontWeight: 500 }}>{course.aiNote}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Action bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 30px', background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'inline-flex', gap: 5, background: 'var(--color-bg-deep)', padding: 4, borderRadius: 10 }}>
                    {(['steps', 'mise', 'tables', 'quality'] as const).map(t => (
                        <button key={t} onClick={() => setTab(t)} style={{
                            padding: '8px 14px', background: tab === t ? 'var(--color-bg-elevated)' : 'transparent',
                            color: tab === t ? 'var(--text)' : 'var(--muted)', border: 'none', borderRadius: 7,
                            fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}>
                            {t === 'steps' && <ListChecks size={13} />}
                            {t === 'mise' && <Package size={13} />}
                            {t === 'tables' && <Grid3x3 size={13} />}
                            {t === 'quality' && <ShieldCheck size={13} />}
                            {{ steps: 'Bereiding', mise: 'Mise en place', tables: 'Per tafel', quality: 'Kwaliteit' }[t]}
                            {t === 'steps' && course.steps.length > 0 && (
                                <span style={{ marginLeft: 4, padding: '1px 6px', background: `${BRAND}33`, color: BRAND, borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{stepsCompleted}/{course.steps.length}</span>
                            )}
                        </button>
                    ))}
                </div>
                <div style={{ flex: 1 }} />
                {tab === 'steps' && (
                    <div style={{ width: 200 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                            <span>Voortgang</span>
                            <span style={{ color: BRAND, fontWeight: 600 }}>{Math.round(stepsPct)}%</span>
                        </div>
                        <div style={{ height: 6, background: 'var(--color-bg-deep)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${stepsPct}%`, height: '100%', background: BRAND, transition: 'width .3s' }} />
                        </div>
                    </div>
                )}
                <button onClick={onAdvance} style={{
                    background: course.status === 'ready' ? BRAND : course.status === 'active' ? 'rgba(34,197,94,.2)' : 'var(--color-bg-deep)',
                    color: course.status === 'ready' ? '#0f0f0f' : course.status === 'active' ? '#34d399' : 'var(--text)',
                    border: course.status === 'ready' ? 'none' : '1px solid var(--border)',
                    padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                    {course.status === 'queued' && <><Play size={14} />Start bereiding</>}
                    {course.status === 'active' && <><Check size={14} />Markeer klaar voor uitgifte</>}
                    {course.status === 'ready' && <><HandPlatter size={14} />Naar uitgifte</>}
                    {course.status === 'served' && <><Undo2 size={14} />Recall</>}
                </button>
            </div>

            <div style={{ flex: 1, padding: '22px 30px', overflow: 'auto' }}>
                {tab === 'steps' && <StepsView course={course} completedSteps={completedSteps} toggleStep={toggleStep} />}
                {tab === 'mise' && <MiseView course={course} />}
                {tab === 'tables' && <TablesView course={course} onToggleItem={onToggleItem} />}
                {tab === 'quality' && <QualityView course={course} />}
            </div>
        </div>
    );
}

function HeroStat({ Icon, val, label }: { Icon: any; val: React.ReactNode; label: string }) {
    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(10px)', padding: '9px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)' }}>
            <Icon size={17} style={{ color: '#fcd34d' }} />
            <div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 17, fontWeight: 400, color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.65)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 2 }}>{label}</div>
            </div>
        </div>
    );
}

function StepsView({ course, completedSteps, toggleStep }: { course: Course; completedSteps: Record<number, boolean>; toggleStep: (n: number) => void }) {
    return (
        <div>
            <HelpNote title="Hoe gebruik je de bereidingswijze?" tone="amber">
                <strong style={{ color: BRAND }}>Tap een stap aan</strong> om af te vinken — de voortgangsbalk loopt mee.<br />
                Aan de rechterkant zie je <strong>plating-instructies</strong>. <span style={{ color: '#34d399' }}>Groene block = vegan/veggie variant</span>.
            </HelpNote>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 22, maxWidth: 1400, margin: '0 auto' }} className="responsive-grid">
                <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>Bereidingswijze · stap voor stap</div>
                    {course.steps.length === 0 && (
                        <div style={{ padding: 22, textAlign: 'center', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 10 }}>Geen stappen voor deze gang.</div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {course.steps.map(step => {
                            const done = !!completedSteps[step.n];
                            return (
                                <div key={step.n} onClick={() => toggleStep(step.n)} style={{
                                    background: done ? 'rgba(34,197,94,.06)' : 'var(--color-bg-elevated)',
                                    border: `1px solid ${done ? 'rgba(34,197,94,.3)' : 'var(--border)'}`,
                                    borderRadius: 12, padding: 16, cursor: 'pointer',
                                    display: 'flex', gap: 14, transition: 'all .2s',
                                }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                                        background: done ? '#34d399' : 'var(--color-bg-deep)',
                                        color: done ? '#0f0f0f' : BRAND,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 16, fontWeight: 700, border: done ? 'none' : `2px solid ${BRAND}`,
                                    }}>{done ? <Check size={18} /> : step.n}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 16, fontWeight: 600, textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.5 : 1, marginBottom: 4, lineHeight: 1.3 }}>{step.action}</div>
                                        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, opacity: done ? 0.5 : 1 }}>{step.detail}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>Plating · zo ziet hij eruit</div>
                    <div style={{ background: course.imgGradient, borderRadius: 14, height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ fontSize: 100, opacity: 0.4, filter: 'drop-shadow(0 8px 30px rgba(0,0,0,.6))' }}>{course.emoji}</div>
                        <div style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(0,0,0,.6)', padding: '5px 10px', borderRadius: 6, fontSize: 10.5, color: 'rgba(255,255,255,.8)' }}>Plating-foto referentie</div>
                    </div>
                    {course.plating.length > 0 && (
                        <div style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <Palette size={13} style={{ color: BRAND }} /> Hoe het bord eruit moet zien
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text)', lineHeight: 1.7 }}>
                                {course.plating.map((p, i) => <li key={i}>{p}</li>)}
                            </ul>
                        </div>
                    )}
                    {course.vegOption && (
                        <div style={{ marginTop: 12, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: 12, display: 'flex', gap: 10 }}>
                            <Leaf size={15} style={{ color: '#34d399', flexShrink: 0, marginTop: 1 }} />
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#34d399', marginBottom: 2, letterSpacing: '.06em' }}>VEGAN/VEGGIE VARIANT</div>
                                <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{course.vegOption}</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function MiseView({ course }: { course: Course }) {
    const [checks, setChecks] = useState<Record<number, boolean>>(() =>
        course.mise.reduce((acc, _, i) => ({ ...acc, [i]: i % 3 !== 2 }), {})
    );
    return (
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
            <HelpNote title="Mise en place check" tone="blue">
                Vink af welke ingrediënten klaar staan voor je begint. Hoeveelheden zijn berekend voor het aantal portions van deze gang.
            </HelpNote>
            <div style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'var(--color-bg-deep)' }}>
                            <th style={miseTh}>Ingrediënt</th>
                            <th style={miseTh}>Hoeveelheid</th>
                            <th style={miseTh}>Bron</th>
                            <th style={{ ...miseTh, textAlign: 'center', width: 80 }}>Klaar</th>
                        </tr>
                    </thead>
                    <tbody>
                        {course.mise.map((m, i) => (
                            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                                <td style={{ padding: '12px 16px', fontSize: 13.5, fontWeight: 600 }}>{m.item}</td>
                                <td style={{ padding: '12px 16px', fontSize: 13, color: BRAND, fontFamily: 'ui-monospace, monospace' }}>{m.qty}</td>
                                <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--muted)' }}>{m.source || '—'}</td>
                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                    <input type="checkbox" checked={!!checks[i]} onChange={() => setChecks(s => ({ ...s, [i]: !s[i] }))} style={{ width: 18, height: 18, accentColor: BRAND }} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
const miseTh: React.CSSProperties = { textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' };

function TablesView({ course, onToggleItem }: { course: Course; onToggleItem: (cid: string, iid: string) => void }) {
    return (
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <HelpNote title="Per-tafel uitgifte" tone="green">
                Per tafel zie je de status. <span style={{ color: '#f87171' }}>Rode "ALLERGIE" badge</span> = let op met deze tafel — speciale variant.
            </HelpNote>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {course.items.map(item => {
                    const status: 'served' | 'ready' | 'active' | 'queued' = item.served ? 'served' : item.ready ? 'ready' : item.inProgress ? 'active' : 'queued';
                    const colors = {
                        served: { bg: 'rgba(34,197,94,.08)', border: 'rgba(34,197,94,.3)', text: '#34d399', label: 'Geserveerd' },
                        ready: { bg: 'rgba(34,197,94,.04)', border: 'rgba(34,197,94,.2)', text: '#34d399', label: 'Klaar voor uitgifte' },
                        active: { bg: `${BRAND}10`, border: `${BRAND}66`, text: BRAND, label: 'In bereiding' },
                        queued: { bg: 'var(--color-bg-elevated)', border: 'var(--border)', text: 'var(--muted)', label: 'Wachtend' },
                    }[status];
                    return (
                        <div key={item.id} style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 13, position: 'relative' }}>
                            {item.special && (
                                <div style={{ position: 'absolute', top: 8, right: 8, background: '#dc2626', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>⚠ ALLERGIE</div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                <div style={{ width: 34, height: 34, background: BRAND, color: '#0f0f0f', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>T{item.table}</div>
                                <div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Tafel {item.table}</div>
                                    <div style={{ fontSize: 15, fontWeight: 700 }}>{item.count} pers.</div>
                                </div>
                            </div>
                            <div style={{ fontSize: 11.5, color: colors.text, fontWeight: 600, marginBottom: item.special ? 6 : 8 }}>{colors.label}</div>
                            {item.special && (
                                <div style={{ fontSize: 11, color: '#fca5a5', background: 'rgba(220,38,38,.1)', padding: '6px 8px', borderRadius: 6, marginBottom: 8, lineHeight: 1.4 }}>
                                    {item.special}
                                </div>
                            )}
                            <button onClick={() => onToggleItem(course.id, item.id)} style={{
                                width: '100%', padding: '8px',
                                background: status === 'served' ? 'transparent' : status === 'ready' ? BRAND : 'var(--color-bg-deep)',
                                color: status === 'ready' ? '#0f0f0f' : status === 'served' ? colors.text : 'var(--text)',
                                border: status === 'ready' ? 'none' : `1px solid ${colors.border}`,
                                borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}>
                                {status === 'served' ? '✓ Geserveerd' : status === 'ready' ? 'Markeer geserveerd' : status === 'active' ? 'Markeer klaar' : 'Start'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function QualityView({ course }: { course: Course }) {
    const [checks, setChecks] = useState<Record<number, boolean>>({});
    const allChecks = course.qualityChecks || [];
    const completed = Object.values(checks).filter(Boolean).length;
    const [aiReply, setAiReply] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);

    async function aiCheck() {
        setAiLoading(true);
        try {
            const res = await fetch('/api/chef-coach', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    now: new Date().toTimeString().slice(0, 5),
                    activeCourseTitle: course.title,
                    activeCourseStatus: course.status,
                    miseRemaining: course.qualityChecks.map(q => ({ label: q })),
                    userQuestion: `Geef in 3 korte bullets in het Nederlands wat je ALS LAATSTE check moet doen voordat "${course.title}" naar de gast gaat. Plating-eisen: ${course.plating.join('; ')}.`,
                }),
            });
            const body = await res.json();
            setAiReply(body.directive || body.error || 'Geen antwoord');
        } catch (e: any) {
            setAiReply('AI niet bereikbaar: ' + (e?.message || 'fout'));
        }
        setAiLoading(false);
    }

    return (
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <HelpNote title="Laatste check voor uitgifte" tone="amber">
                Loop deze checks af voordat de gerechten naar de tafel gaan. Onderaan kun je de AI om een Michelin-stijl laatste-check vragen.
            </HelpNote>
            {allChecks.length === 0 && (
                <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)' }}>Geen kwaliteitschecks gedefinieerd voor deze gang.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 22 }}>
                {allChecks.map((check, i) => {
                    const done = !!checks[i];
                    return (
                        <div key={i} onClick={() => setChecks(c => ({ ...c, [i]: !c[i] }))} style={{
                            background: done ? 'rgba(34,197,94,.06)' : 'var(--color-bg-elevated)',
                            border: `1px solid ${done ? 'rgba(34,197,94,.3)' : 'var(--border)'}`,
                            borderRadius: 12, padding: 16, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 12,
                        }}>
                            <div style={{ width: 26, height: 26, borderRadius: 8, background: done ? '#34d399' : 'var(--color-bg-deep)', border: done ? 'none' : '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {done && <Check size={15} style={{ color: '#0f0f0f' }} />}
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 600, textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}>{check}</div>
                        </div>
                    );
                })}
            </div>
            <div style={{ background: `linear-gradient(135deg, ${BRAND}14, ${BRAND}03)`, border: `1px solid ${BRAND}40`, borderRadius: 14, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 36, height: 36, background: BRAND, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Sparkles size={17} style={{ color: '#0f0f0f' }} />
                    </div>
                    <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>AI Kwaliteits-assistent</div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Laatste-check voor de gast door de pitmaster-AI</div>
                    </div>
                </div>
                <button onClick={aiCheck} disabled={aiLoading} style={{
                    width: '100%', padding: 12, background: BRAND, color: '#0f0f0f', border: 'none', borderRadius: 10,
                    fontSize: 13.5, fontWeight: 700, cursor: aiLoading ? 'not-allowed' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: aiLoading ? 0.7 : 1,
                }}>
                    <Camera size={15} /> {aiLoading ? 'AI bekijkt het bord…' : 'Vraag AI om laatste-check'}
                </button>
                {aiReply && (
                    <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--color-bg-deep)', border: `1px solid ${BRAND}40`, fontSize: 13, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {aiReply}
                    </div>
                )}
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>{completed}/{allChecks.length} checks voltooid</div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════════ */
export default function ServiceMode() {
    const [view, setView] = useState<View>('hub');
    const [eventId, setEventId] = useState<string | null>(null);
    const [courseId, setCourseId] = useState<string | null>(null);
    const [eventState, setEventState] = useState<ServiceEvent | null>(null);
    const [rookDocked, setRookDocked] = useState(true);

    /* Restore from localStorage */
    useEffect(() => {
        const s = loadState();
        setView(s.view); setEventId(s.eventId); setCourseId(s.courseId); setEventState(s.eventState);
    }, []);
    /* Persist on change */
    useEffect(() => {
        try {
            localStorage.setItem(STATE_KEY, JSON.stringify({ view, eventId, courseId, eventState }));
        } catch { /* */ }
    }, [view, eventId, courseId, eventState]);

    function pickEvent(id: string) {
        const evt = SERVICE_EVENTS.find(e => e.id === id);
        if (!evt) return;
        setEventId(id);
        setEventState(JSON.parse(JSON.stringify(evt)));
        setView('board');
    }

    function openCourse(cid: string) {
        setCourseId(cid);
        setView('detail');
    }

    function advanceStatus(cid: string) {
        setEventState(state => {
            if (!state) return state;
            return {
                ...state,
                courses: state.courses.map(c => {
                    if (c.id !== cid) return c;
                    const order: CourseStatus[] = ['queued', 'active', 'ready', 'served'];
                    const idx = order.indexOf(c.status);
                    const next: CourseStatus = c.status === 'served' ? 'ready' : order[Math.min(idx + 1, order.length - 1)];
                    return { ...c, status: next };
                }),
            };
        });
    }

    function toggleItem(cid: string, iid: string) {
        setEventState(state => {
            if (!state) return state;
            return {
                ...state,
                courses: state.courses.map(c => {
                    if (c.id !== cid) return c;
                    return {
                        ...c,
                        items: c.items.map((i: CourseItem) => {
                            if (i.id !== iid) return i;
                            if (i.served) return { ...i, served: false, ready: true };
                            if (i.ready) return { ...i, served: true };
                            if (i.inProgress) return { ...i, inProgress: false, ready: true };
                            return { ...i, inProgress: true };
                        }),
                    };
                }),
            };
        });
    }

    /* Build chef context for AI */
    const chefContext = useMemo<ChefContext>(() => {
        if (!eventState) {
            return { now: new Date().toTimeString().slice(0, 5) };
        }
        const active = eventState.courses.filter(c => c.status === 'active');
        const queued = eventState.courses.filter(c => c.status === 'queued');
        const current = view === 'detail' && courseId ? eventState.courses.find(c => c.id === courseId) : active[0] || queued[0];
        const next = current ? eventState.courses[eventState.courses.indexOf(current) + 1] : undefined;
        return {
            now: new Date().toTimeString().slice(0, 5),
            activeCourseId: current?.id,
            activeCourseTitle: current?.title,
            activeCourseStart: current ? `${eventState.startTime} +${current.serveTime}m` : undefined,
            activeCourseStatus: current?.status,
            nextCourseTitle: next?.title,
            misePctDone: undefined,
            miseRemaining: current?.mise.map(m => ({ label: `${m.item} (${m.qty})`, critical: false })),
            allergies: eventState.allergyTable.map(a => ({ person: a.name, issue: a.note, severity: a.allergens.includes('N') || a.allergens.includes('VE') ? 'critical' : 'must' })),
        };
    }, [eventState, courseId, view]);

    const rookOffset = rookDocked ? 380 : 0;

    return (
        <>
            {view === 'hub' && (
                <div style={{ marginRight: rookOffset }}>
                    <ServiceModeHub events={SERVICE_EVENTS} onPickEvent={pickEvent} />
                </div>
            )}

            {view === 'board' && eventState && (
                <ServiceModeBoard
                    event={eventState}
                    onOpenCourse={openCourse}
                    onAdvanceStatus={advanceStatus}
                    onBack={() => { setView('hub'); setEventState(null); setEventId(null); setCourseId(null); }}
                    rookOffset={rookOffset}
                />
            )}

            {view === 'detail' && eventState && courseId && (
                <ServiceModeDetail
                    event={eventState}
                    courseId={courseId}
                    onBack={() => setView('board')}
                    onAdvance={() => advanceStatus(courseId)}
                    onToggleItem={toggleItem}
                    rookOffset={rookOffset}
                />
            )}

            {/* Persistent AI Chef Rook — over alle 3 views */}
            <AIChefAssistant context={chefContext} onDockChange={setRookDocked} />
        </>
    );
}
