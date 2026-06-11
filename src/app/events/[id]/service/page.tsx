/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
    ArrowLeft, Play, Check, Clock, Flame, CheckCircle, Award, AlertTriangle,
    Sparkles, BookOpen, Users, Leaf, ListChecks, Package, Grid3x3, ShieldCheck, Camera,
    Palette, HandPlatter, Undo2, Brush, Trash2, Edit3, Loader2, Download, X,
} from 'lucide-react';
import type { ServiceEvent, Course, CourseStatus, CourseItem } from './_types/service';
import { buildServiceDirectives } from './_lib/serviceDirectives';
import AIChefAssistant, { type ChefContext } from '@/components/service/AIChefAssistant';
import ServiceTabBar from '@/components/service/ServiceTabBar';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { dbEventToServiceEvent } from '@/lib/serviceData';
import { computeTableZones, type TableZoneInfo } from '@/lib/floorPlanZones';
import { generateActieplan, type ActieplanResult } from '@/lib/actieplan';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useIsPhone } from '@/hooks/useIsMobile';
import type { DbEvent, DbCourse, DbEventAllergy, FloorPlan, ServiceZone, FloorPlanGuest } from '@/types';

const GOLD = '#c4a35a';
const BRAND = '#FFBF00';

/* ═══════════════════════════════════════════════════════════════════
   STATE: deep-clone event op selectie + persist mutaties in localStorage
   ═══════════════════════════════════════════════════════════════════ */

type View = 'hub' | 'board' | 'detail' | 'wrapup';

/* ═══════════════════════════════════════════════════════════════════
   VOORRAAD AFTREK — bij course/item "served" trekken we het verbruik
   af via de gedeelde inventoryDeduction helper. Best-effort: service-
   flow blokkeert nooit op stock-fail, maar via `onError` wordt de
   pitmaster geattendeerd zodat hij voorraad handmatig kan corrigeren.
   Voorheen faalde dit volledig stil — stock liep stilletjes scheef.
   ═══════════════════════════════════════════════════════════════════ */
async function deductCourseFromInventory(
    course: Course,
    portionsServed: number,
    eventTitle: string,
    onError?: (msg: string) => void,
): Promise<void> {
    try {
        if (portionsServed <= 0 || !course.mise || course.mise.length === 0) return;
        const totalPortions = course.items.reduce((a, i) => a + (i.count || 0), 0) || 1;
        const fraction = portionsServed / totalPortions;

        const { supabase } = await import('@/lib/supabase');
        const { parseQty, deductFromInventory } = await import('@/lib/inventoryDeduction');
        const { data: inv, error: invErr } = await supabase
            .from('inventory')
            .select('id, naam, current_stock, unit, organization_id');
        if (invErr) {
            throw new Error('Voorraad-query mislukt: ' + invErr.message);
        }
        if (!inv) return;

        const lines = course.mise
            .map(m => {
                const parsed = parseQty(m.qty);
                if (!parsed) return null;
                return {
                    name: m.item,
                    qty: parsed.qty * fraction,
                    note: `Service ${eventTitle} · gang #${course.num}: ${course.title}`,
                };
            })
            .filter((x): x is { name: string; qty: number; note: string } => x !== null);

        await deductFromInventory(lines, inv as any);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'onbekende fout';
        console.error('[SERVICE] inventory-deduction failed for ' + course.title + ':', msg);
        if (onError) {
            onError('Voorraad-aftrek mislukt voor gang ' + course.title + ' — controleer voorraad handmatig (' + msg + ')');
        }
    }
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
   BOARD — Kanban (queued / active / ready / served)
   ═══════════════════════════════════════════════════════════════════ */
function ServiceModeBoard({ event, eventDbId, tableZones, onOpenCourse, onAdvanceStatus, onBack, onWrapup, rookOffset }: {
    event: ServiceEvent;
    eventDbId: number;
    tableZones: Record<number, TableZoneInfo>;
    onOpenCourse: (cid: string) => void;
    onAdvanceStatus: (cid: string) => void;
    onBack: () => void;
    onWrapup: () => void;
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
                {totalDone >= Math.ceil(event.courses.length / 2) && (
                    <button onClick={onWrapup} style={{
                        padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                        background: progressPct === 100 ? `linear-gradient(180deg, ${BRAND}, #d97706)` : 'transparent',
                        color: progressPct === 100 ? '#0f0f0f' : BRAND,
                        border: progressPct === 100 ? 'none' : `1px solid ${BRAND}66`,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                        boxShadow: progressPct === 100 ? `0 0 14px ${BRAND}66` : 'none',
                    }}>
                        <Brush size={13} /> {progressPct === 100 ? 'Service afronden' : 'Wrap-up'}
                    </button>
                )}
            </div>

            {/* Tab-switcher Gangen ⇄ Plattegrond — stond eerst alléén op de
                plattegrond-pagina, waardoor die vanaf het bord onvindbaar was. */}
            <div style={{ marginRight: rookOffset, borderBottom: '1px solid var(--border)', background: 'var(--color-bg-elevated)' }}>
                <ServiceTabBar eventId={eventDbId} activeTab="gangen" />
            </div>

            <ServiceAIBar event={event} />

            <div style={{ flex: 1, padding: '20px 22px', overflow: 'auto', marginRight: rookOffset }}>
                <HelpNote title="Zo werkt het bord" tone="amber">
                    <strong style={{ color: BRAND }}>Kolommen:</strong> elke gang doorloopt 4 fases — Wachtend → Bezig → Klaar → Geserveerd.<br />
                    <strong style={{ color: BRAND }}>Knop op de card:</strong> tap "Start" / "Markeer klaar" / "Klaar voor uitgifte" om snel door te schuiven.<br />
                    <strong style={{ color: BRAND }}>Card tappen:</strong> opent fullscreen bereidingswijze.<br />
                    <strong style={{ color: BRAND }}>Per-tafel grid:</strong> oranje = bezig, groen = klaar. <span style={{ color: '#f87171' }}>Rode rand = allergie/dieet.</span>
                </HelpNote>
                <div className="kds-board-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, alignContent: 'start' }}>
                    <Column title="Wachtend" Icon={Clock} tone="gray" courses={queued} event={event} tableZones={tableZones} onOpenCourse={onOpenCourse} onAdvanceStatus={onAdvanceStatus} />
                    <Column title="In bereiding" Icon={Flame} tone="amber" courses={active} event={event} tableZones={tableZones} onOpenCourse={onOpenCourse} onAdvanceStatus={onAdvanceStatus} />
                    <Column title="Klaar voor uitgifte" Icon={CheckCircle} tone="green" courses={ready} event={event} tableZones={tableZones} onOpenCourse={onOpenCourse} onAdvanceStatus={onAdvanceStatus} />
                    <Column title="Geserveerd" Icon={Award} tone="muted" courses={served} event={event} tableZones={tableZones} onOpenCourse={onOpenCourse} onAdvanceStatus={onAdvanceStatus} />
                </div>
            </div>
        </div>
    );
}

function ServiceAIBar({ event }: { event: ServiceEvent | null }) {
    /* P0.5 — directives uit real event-data (course-aiNotes + allergie-tabel + status),
       niet meer uit hardcoded mock-array. Lege state = bar verbergen. */
    const directives = useMemo(() => buildServiceDirectives(event), [event]);
    const [activeIdx, setActiveIdx] = useState(0);
    useEffect(() => {
        if (directives.length === 0) return;
        const t = setInterval(() => setActiveIdx(i => (i + 1) % directives.length), 6000);
        return () => clearInterval(t);
    }, [directives.length]);
    /* Reset index als directives korter worden (bv. een directive resolved). */
    useEffect(() => {
        if (activeIdx >= directives.length) setActiveIdx(0);
    }, [activeIdx, directives.length]);
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

function Column({ title, Icon, tone, courses, event, tableZones, onOpenCourse, onAdvanceStatus }: {
    title: string; Icon: any; tone: 'gray' | 'amber' | 'green' | 'muted';
    courses: Course[]; event: ServiceEvent; tableZones: Record<number, TableZoneInfo>;
    onOpenCourse: (cid: string) => void; onAdvanceStatus: (cid: string) => void;
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
                    <CourseCard key={course.id} course={course} event={event} tableZones={tableZones} onOpen={() => onOpenCourse(course.id)} onAdvance={() => onAdvanceStatus(course.id)} />
                ))}
            </div>
        </div>
    );
}

function CourseCard({ course, event, tableZones, onOpen, onAdvance }: { course: Course; event: ServiceEvent; tableZones: Record<number, TableZoneInfo>; onOpen: () => void; onAdvance: () => void }) {
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
            {/* Echte gerecht-foto (via gerecht_ids/naam-match) — emoji is fallback. */}
            <div style={{ height: 70, background: course.fotoUrl ? `url(${course.fotoUrl}) center/cover no-repeat` : course.imgGradient, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {!course.fotoUrl && <div style={{ fontSize: 34 }}>{course.emoji}</div>}
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
                                <div key={item.id} title={`Tafel ${item.table} · ${item.count}p${tableZones[item.table] ? ' · ' + tableZones[item.table].name : ''}${item.special ? ' · ' + item.special : ''}`} style={{
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
                        {course.status === 'ready' && <><HandPlatter size={12} />Klaar voor uitgifte</>}
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
function ServiceModeDetail({ event, courseId, tableZones, onBack, onAdvance, onToggleItem, onApplyActieplan, rookOffset }: {
    event: ServiceEvent; courseId: string;
    tableZones: Record<number, TableZoneInfo>;
    onBack: () => void; onAdvance: () => void; onToggleItem: (cid: string, iid: string) => void;
    onApplyActieplan: (result: ActieplanResult) => Promise<void>;
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
            {/* Hero header — gerecht-foto met donkere gradient; gradient-only als fallback */}
            <div style={{ position: 'relative', minHeight: 260, background: course.fotoUrl ? `linear-gradient(180deg, rgba(8,6,4,.30), rgba(8,6,4,.78)), url(${course.fotoUrl}) center/cover no-repeat` : course.imgGradient, padding: '24px 30px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden' }}>
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
                    {!course.fotoUrl && <div style={{ fontSize: 86, marginBottom: 4, lineHeight: 1, opacity: 0.9, filter: 'drop-shadow(0 4px 20px rgba(0,0,0,.5))' }}>{course.emoji}</div>}
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
                    {course.status === 'ready' && <><HandPlatter size={14} />Klaar voor uitgifte</>}
                    {course.status === 'served' && <><Undo2 size={14} />Recall</>}
                </button>
            </div>

            <div style={{ flex: 1, padding: '22px 30px', overflow: 'auto' }}>
                {tab === 'steps' && <StepsView course={course} completedSteps={completedSteps} toggleStep={toggleStep} onApplyActieplan={onApplyActieplan} />}
                {tab === 'mise' && <MiseView course={course} />}
                {tab === 'tables' && <TablesView course={course} tableZones={tableZones} onToggleItem={onToggleItem} />}
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

function StepsView({ course, completedSteps, toggleStep, onApplyActieplan }: { course: Course; completedSteps: Record<number, boolean>; toggleStep: (n: number) => void; onApplyActieplan: (result: ActieplanResult) => Promise<void> }) {
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
                        <ActieplanGeneratorBlock course={course} onApply={onApplyActieplan} />
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
                    <div style={{ background: course.fotoUrl ? `url(${course.fotoUrl}) center/cover no-repeat` : course.imgGradient, borderRadius: 14, height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
                        {!course.fotoUrl && <div style={{ fontSize: 100, opacity: 0.4, filter: 'drop-shadow(0 8px 30px rgba(0,0,0,.6))' }}>{course.emoji}</div>}
                        <div style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(0,0,0,.6)', padding: '5px 10px', borderRadius: 6, fontSize: 10.5, color: 'rgba(255,255,255,.8)' }}>
                            {course.fotoUrl ? `Plating-referentie · ${(course.gerechten || []).find(g => g.fotoUrl === course.fotoUrl)?.naam || course.title}` : 'Plating-foto referentie'}
                        </div>
                    </div>
                    {(course.gerechten || []).some(g => g.serviceTip) && (
                        <div style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <HandPlatter size={13} style={{ color: BRAND }} /> Service-tips uit het menu
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text)', lineHeight: 1.7 }}>
                                {(course.gerechten || []).filter(g => g.serviceTip).map((g, i) => <li key={i}><strong>{g.naam}:</strong> {g.serviceTip}</li>)}
                            </ul>
                        </div>
                    )}
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

/**
 * Actieplan-generator — lege gang? Eén knop bouwt het stappenplan
 * deterministisch uit de receptuur (componenten → battle-plan →
 * bereidingswijze), hoeveelheden geschaald naar dit event. Het resultaat
 * is een VOORSTEL: pas na "Gebruik dit actieplan" wordt het opgeslagen.
 */
function ActieplanGeneratorBlock({ course, onApply }: { course: Course; onApply: (result: ActieplanResult) => Promise<void> }) {
    const showToast = useToast();
    const [busy, setBusy] = useState(false);
    const [applying, setApplying] = useState(false);
    const [proposal, setProposal] = useState<ActieplanResult | null>(null);

    async function generate() {
        setBusy(true);
        try {
            const { supabase } = await import('@/lib/supabase');
            const result = await generateActieplan(supabase, {
                gerechtIds: (course.gerechten || []).map(g => g.id).filter((x): x is string => !!x),
                dishNames: course.description.split(',').map(s => s.trim()).filter(Boolean),
                portions: course.items.reduce((a, i) => a + (i.count || 0), 0),
            });
            if (result.steps.length === 0) {
                showToast(result.sources[0] || 'Geen receptuur gevonden voor deze gang.', 'warning');
                return;
            }
            setProposal(result);
        } catch (e) {
            showToast('Actieplan genereren mislukt: ' + (e instanceof Error ? e.message : 'onbekende fout'), 'error');
        } finally {
            setBusy(false);
        }
    }

    if (!proposal) {
        return (
            <div style={{ padding: 26, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 10 }}>
                <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, marginBottom: 14, maxWidth: 460, margin: '0 auto 14px' }}>
                    Geen stappen voor deze gang. Bouw het actieplan uit de receptuur van je gerechten —
                    componenten en hoeveelheden worden geschaald naar dit event.
                </div>
                <button onClick={generate} disabled={busy} style={{
                    padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    background: busy ? 'var(--color-bg-deep)' : BRAND, color: busy ? 'var(--muted)' : '#0f0f0f',
                    border: 'none', cursor: busy ? 'default' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44,
                }}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {busy ? 'Receptuur ophalen…' : 'Actieplan opbouwen uit receptuur'}
                </button>
            </div>
        );
    }

    return (
        <div style={{ border: `1px solid ${BRAND}40`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: `${BRAND}0d`, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: BRAND, marginBottom: 4 }}>Voorstel · {proposal.steps.length} stappen</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{proposal.sources.join(' · ')}</div>
            </div>
            <div style={{ maxHeight: 340, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {proposal.steps.map(s => (
                    <div key={s.n} style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '8px 10px', background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}>
                        <span style={{ color: BRAND, fontWeight: 700, minWidth: 20, fontVariantNumeric: 'tabular-nums' }}>{s.n}</span>
                        <span style={{ flex: 1, lineHeight: 1.45 }}>
                            <span style={{ fontWeight: 600 }}>{s.action}</span>
                            {s.detail && <span style={{ color: 'var(--muted)' }}> — {s.detail}</span>}
                        </span>
                    </div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border)' }}>
                <button
                    onClick={async () => { setApplying(true); try { await onApply(proposal); } finally { setApplying(false); } }}
                    disabled={applying}
                    style={{ flex: 1, padding: '12px', borderRadius: 8, fontWeight: 700, fontSize: 13, background: BRAND, color: '#0f0f0f', border: 'none', cursor: 'pointer', minHeight: 44 }}
                >
                    {applying ? 'Opslaan…' : `Gebruik dit actieplan (${proposal.steps.length} stappen)`}
                </button>
                <button
                    onClick={() => setProposal(null)}
                    disabled={applying}
                    style={{ padding: '12px 16px', borderRadius: 8, fontSize: 13, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', minHeight: 44 }}
                >
                    Annuleer
                </button>
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

function TablesView({ course, tableZones, onToggleItem }: { course: Course; tableZones: Record<number, TableZoneInfo>; onToggleItem: (cid: string, iid: string) => void }) {
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
                            {/* Zone uit de plattegrond ("achterin · glutenvrij") — icoon + label, niet alleen kleur. */}
                            {tableZones[item.table] && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: tableZones[item.table].color || BRAND, flexShrink: 0 }} />
                                    <span>{tableZones[item.table].name}</span>
                                </div>
                            )}
                            <div style={{ fontSize: 11.5, color: colors.text, fontWeight: 600, marginBottom: item.special ? 6 : 8 }}>{colors.label}</div>
                            {item.special && (
                                <div style={{ fontSize: 11, color: 'var(--red)', background: 'rgba(220,38,38,.1)', padding: '6px 8px', borderRadius: 6, marginBottom: 8, lineHeight: 1.4 }}>
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
   WRAPUP — opruim-checklist + feedback dump + AI rewrite + PDF rapport
   ═══════════════════════════════════════════════════════════════════ */
const CLEANUP_DEFAULT = [
    { id: 'cl-1', label: 'Smokers uit + dom afgekoeld', critical: true },
    { id: 'cl-2', label: 'Bain-maries leeg + schoonmaken', critical: false },
    { id: 'cl-3', label: 'Cambros leeg + spoelen', critical: false },
    { id: 'cl-4', label: 'Snijplanken + slicers wassen', critical: false },
    { id: 'cl-5', label: 'Service-line afbreken', critical: false },
    { id: 'cl-6', label: 'Inox / GN-trays inpakken', critical: false },
    { id: 'cl-7', label: 'Restanten apart (waste-tracking)', critical: false },
    { id: 'cl-8', label: 'Vuil → afvalcontainer locatie', critical: false },
    { id: 'cl-9', label: 'Catering-truck inladen', critical: true },
    { id: 'cl-10', label: 'Locatie eind-check (vergeet niets)', critical: true },
    { id: 'cl-11', label: 'Smoker-as koud in metalen bak', critical: true },
    { id: 'cl-12', label: 'Klant bedanken + verlaten', critical: false },
];

interface FeedbackResult {
    polishedNarrative: string;
    keyPoints: string[];
    sentiment: 'positive' | 'mixed' | 'negative';
    actionables: string[];
}

function ServiceModeWrapup({ event, onBackToBoard, rookOffset }: { event: ServiceEvent; onBackToBoard: () => void; rookOffset: number }) {
    const [cleanupState, setCleanupState] = useState<Record<string, boolean>>({});
    const [rawNotes, setRawNotes] = useState('');
    const [aiResult, setAiResult] = useState<FeedbackResult | null>(null);
    const [aiBusy, setAiBusy] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    /* Persist per event-id */
    const wrapupKey = `service_wrapup_${event.id}`;
    useEffect(() => {
        try {
            const s = localStorage.getItem(wrapupKey);
            if (s) {
                const p = JSON.parse(s);
                setCleanupState(p.cleanupState || {});
                setRawNotes(p.rawNotes || '');
                setAiResult(p.aiResult || null);
            }
        } catch { /* */ }
    }, [wrapupKey]);
    useEffect(() => {
        try { localStorage.setItem(wrapupKey, JSON.stringify({ cleanupState, rawNotes, aiResult })); } catch { /* */ }
    }, [wrapupKey, cleanupState, rawNotes, aiResult]);

    const decoratedCl = CLEANUP_DEFAULT.map(c => ({ ...c, done: cleanupState[c.id] || false }));
    const clDone = decoratedCl.filter(c => c.done).length;
    const clPct = Math.round((clDone / decoratedCl.length) * 100);
    const toggleCleanup = (id: string) => setCleanupState(s => ({ ...s, [id]: !s[id] }));

    async function rewriteFeedback() {
        if (rawNotes.trim().length < 10) {
            setAiError('Schrijf eerst een paar zinnen — anders heeft Rook niks om mee te werken.');
            return;
        }
        setAiBusy(true); setAiError(null);
        try {
            const res = await fetch('/api/service-feedback-rewrite', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rawNotes,
                    eventContext: {
                        title: event.title, date: event.date, guests: event.guests,
                        menu: event.courses.map(c => c.title).join(' · '),
                    },
                }),
            });
            const body = await res.json();
            if (!res.ok || !body.success) setAiError(body.error || 'AI-fout');
            else setAiResult({
                polishedNarrative: body.polishedNarrative, keyPoints: body.keyPoints,
                sentiment: body.sentiment, actionables: body.actionables,
            });
        } catch (e: any) {
            setAiError(e?.message || 'Kon Rook niet bereiken');
        }
        setAiBusy(false);
    }

    async function generatePDF() {
        const { default: jsPDF } = await import('jspdf');
        const autoTable = (await import('jspdf-autotable')).default;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        /* COVER */
        doc.setFillColor(18, 18, 20); doc.rect(0, 0, 210, 50, 'F');
        doc.setTextColor(196, 163, 90); doc.setFontSize(11);
        doc.text('SERVICE RAPPORT', 14, 18);
        doc.setTextColor(255, 255, 255); doc.setFontSize(22);
        doc.text(event.title, 14, 30);
        doc.setTextColor(180, 180, 180); doc.setFontSize(10);
        doc.text(`${event.date} · ${event.guests} gasten · ${event.venue}`, 14, 38);
        doc.text(`Service start ${event.startTime}`, 14, 44);

        let y = 62;

        /* MENU */
        doc.setTextColor(40, 40, 40); doc.setFontSize(13); doc.setFont('helvetica', 'bold');
        doc.text('Menu uitgevoerd', 14, y); y += 6;
        autoTable(doc, {
            startY: y,
            head: [['Gang', 'Status', 'Portions', 'Beschrijving']],
            body: event.courses.map(c => {
                const portions = c.items.reduce((a, i) => a + (i.count || 0), 0);
                const served = c.items.filter(i => i.served).reduce((a, i) => a + (i.count || 0), 0);
                return [
                    `${c.num}. ${c.title}`,
                    c.status === 'served' ? 'Geserveerd' : c.status === 'ready' ? 'Klaar' : c.status === 'active' ? 'Bezig' : 'Wachtend',
                    `${served}/${portions}`,
                    c.description,
                ];
            }),
            theme: 'striped',
            headStyles: { fillColor: [196, 163, 90], textColor: [255, 255, 255], fontSize: 9 },
            bodyStyles: { fontSize: 9 },
            columnStyles: { 3: { cellWidth: 80 } },
            margin: { left: 14, right: 14 },
        });
        y = (doc as any).lastAutoTable.finalY + 8;

        /* TEMPO + WASTE */
        const totalPortions = event.courses.reduce((a, c) => a + c.items.reduce((b, i) => b + (i.count || 0), 0), 0);
        const servedTotal = event.courses.reduce((a, c) => a + c.items.filter(i => i.served).reduce((b, i) => b + (i.count || 0), 0), 0);
        const completionPct = totalPortions ? Math.round((servedTotal / totalPortions) * 100) : 0;

        doc.setFontSize(13); doc.setFont('helvetica', 'bold');
        doc.text('Tempo & uitvoering', 14, y); y += 6;
        autoTable(doc, {
            startY: y,
            head: [['Metriek', 'Waarde']],
            body: [
                ['Aantal gangen', String(event.courses.length)],
                ['Totaal portions', String(totalPortions)],
                ['Geserveerd', `${servedTotal} (${completionPct}%)`],
                ['Opruim-completion', `${clDone}/${decoratedCl.length} (${clPct}%)`],
                ['Allergieën', event.allergyTable.map(a => `${a.name} (T${a.table}) — ${a.note}`).join('; ') || 'geen'],
                ['Team', event.staff.join(', ')],
            ],
            theme: 'striped',
            headStyles: { fillColor: [196, 163, 90], textColor: [255, 255, 255], fontSize: 9 },
            bodyStyles: { fontSize: 9 },
            margin: { left: 14, right: 14 },
        });
        y = (doc as any).lastAutoTable.finalY + 8;

        /* FEEDBACK */
        if (aiResult) {
            if (y > 240) { doc.addPage(); y = 20; }
            doc.setFontSize(13); doc.setFont('helvetica', 'bold');
            doc.text('Pitmaster-evaluatie', 14, y); y += 6;
            doc.setFontSize(10); doc.setFont('helvetica', 'normal');
            const wrapped = doc.splitTextToSize(aiResult.polishedNarrative, 180);
            doc.text(wrapped, 14, y); y += wrapped.length * 5 + 6;

            if (aiResult.keyPoints?.length) {
                doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
                doc.text('Kernpunten', 14, y); y += 5;
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
                aiResult.keyPoints.forEach(kp => {
                    if (y > 275) { doc.addPage(); y = 20; }
                    const lines = doc.splitTextToSize('• ' + kp, 180);
                    doc.text(lines, 18, y); y += lines.length * 5;
                });
                y += 4;
            }
            if (aiResult.actionables?.length) {
                if (y > 250) { doc.addPage(); y = 20; }
                doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
                doc.text('Volgende keer', 14, y); y += 5;
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
                aiResult.actionables.forEach(a => {
                    if (y > 275) { doc.addPage(); y = 20; }
                    const lines = doc.splitTextToSize('→ ' + a, 180);
                    doc.text(lines, 18, y); y += lines.length * 5;
                });
            }
        }

        if (rawNotes.trim()) {
            doc.addPage(); y = 20;
            doc.setFontSize(13); doc.setFont('helvetica', 'bold');
            doc.text('Bijlage: ruwe notities pitmaster', 14, y); y += 8;
            doc.setFontSize(9); doc.setFont('helvetica', 'normal');
            const lines = doc.splitTextToSize(rawNotes, 180);
            doc.text(lines, 14, y);
        }

        const pageCount = (doc as any).internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8); doc.setTextColor(148, 148, 148);
            doc.text(`Hop & Bites · BBQ Architect · ${new Date().toLocaleString('nl-NL')} · pagina ${i}/${pageCount}`, 14, 290);
        }
        doc.save(`service-rapport-${event.id}-${new Date().toISOString().slice(0, 10)}.pdf`);
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', marginRight: rookOffset }}>
            {/* Top bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 28px', background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                <button onClick={onBackToBoard} style={{
                    background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)',
                    padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13,
                }}>
                    <ArrowLeft size={14} /> Terug naar bord
                </button>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 600 }}>
                        <Brush size={18} style={{ color: GOLD }} /> Service afronden — {event.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Opruim-checklist · feedback · PDF rapport</div>
                </div>
            </div>

            <div style={{ flex: 1, padding: '20px 28px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* CLEANUP CHECKLIST */}
                <div style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Brush size={14} style={{ color: GOLD }} />
                                <span style={{ fontSize: 11, letterSpacing: '.18em', color: 'var(--muted-light)', fontWeight: 700, textTransform: 'uppercase' }}>Opruim-checklist</span>
                            </div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontSize: 18, marginTop: 4 }}>{clDone}/{decoratedCl.length} klaar</div>
                        </div>
                        <div style={{ width: 60, height: 60, position: 'relative' }}>
                            <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                                <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,.06)" strokeWidth="8" fill="none" />
                                <circle cx="50" cy="50" r="40" stroke={GOLD} strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={`${clPct * 2.51} 251`} />
                            </svg>
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>{clPct}%</div>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 6 }}>
                        {decoratedCl.map(item => (
                            <div key={item.id} onClick={() => toggleCleanup(item.id)} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                background: item.done ? 'rgba(34,197,94,.05)' : 'rgba(255,255,255,.02)',
                                border: `1px solid ${item.critical && !item.done ? 'rgba(239,68,68,.2)' : 'rgba(255,255,255,.04)'}`,
                            }}>
                                <div style={{
                                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                                    background: item.done ? 'var(--green)' : 'transparent',
                                    border: `1.5px solid ${item.done ? 'var(--green)' : item.critical ? 'var(--red)' : 'var(--border)'}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {item.done && <Check size={14} style={{ color: '#000' }} />}
                                </div>
                                <span style={{ fontSize: 13, color: item.done ? 'var(--muted)' : 'var(--text)', textDecoration: item.done ? 'line-through' : 'none', flex: 1, lineHeight: 1.4 }}>{item.label}</span>
                                {item.critical && !item.done && <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,.1)', color: 'var(--red)', fontWeight: 700, letterSpacing: '.1em' }}>!</span>}
                            </div>
                        ))}
                    </div>
                </div>

                {/* FEEDBACK DUMP */}
                <div style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Edit3 size={14} style={{ color: GOLD }} />
                            <span style={{ fontSize: 11, letterSpacing: '.18em', color: 'var(--muted-light)', fontWeight: 700, textTransform: 'uppercase' }}>Feedback dump · ruw</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {rawNotes && (
                                <button onClick={() => { setRawNotes(''); setAiResult(null); }} style={{
                                    padding: '6px 10px', borderRadius: 7, fontSize: 11, color: 'var(--muted)',
                                    background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer',
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                }}>
                                    <Trash2 size={11} /> Wissen
                                </button>
                            )}
                            <button onClick={rewriteFeedback} disabled={aiBusy || rawNotes.trim().length < 10} style={{
                                padding: '6px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                                background: aiBusy ? 'var(--muted-light)' : `linear-gradient(180deg, ${GOLD}, #9e781c)`,
                                color: '#000', border: 'none', cursor: aiBusy ? 'not-allowed' : 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                opacity: rawNotes.trim().length < 10 ? 0.5 : 1,
                            }}>
                                {aiBusy ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                                {aiBusy ? 'Rook schrijft…' : 'Rook schrijft uit'}
                            </button>
                        </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
                        Gooi alles erin wat je nog kwijt wilt — losse zinnen, complimenten, frustraties. Rook leest mee en schrijft het netjes uit voor in het rapport.
                    </div>
                    <textarea
                        value={rawNotes}
                        onChange={e => setRawNotes(e.target.value)}
                        rows={6}
                        placeholder='Bv: "tempo gang 4 te traag, brisket strak, klant blij — vooral met short ribs, mac & cheese hadden we 8kg over, satay-portie voor maaike T3 ging goed, smoker 1 stookte rommelig, team had te weinig handen tijdens piek"'
                        style={{
                            width: '100%', padding: 14, borderRadius: 10,
                            background: 'var(--color-bg-deep)', border: '1px solid var(--border)',
                            color: 'var(--text)', fontSize: 13, lineHeight: 1.6,
                            outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                        }}
                    />
                    {aiError && (
                        <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', color: 'var(--red)', fontSize: 12 }}>
                            {aiError}
                        </div>
                    )}
                </div>

                {/* AI UITGESCHREVEN */}
                {aiResult && (
                    <div style={{ background: 'var(--color-bg-elevated)', border: `1px solid ${GOLD}40`, borderRadius: 14, padding: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <Sparkles size={14} style={{ color: GOLD }} />
                            <span style={{ fontSize: 11, letterSpacing: '.18em', color: GOLD, fontWeight: 700, textTransform: 'uppercase' }}>Rook · uitgeschreven</span>
                            <span style={{
                                padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.15em',
                                background: aiResult.sentiment === 'positive' ? 'rgba(34,197,94,.15)' : aiResult.sentiment === 'mixed' ? `${BRAND}1a` : 'rgba(239,68,68,.15)',
                                color: aiResult.sentiment === 'positive' ? 'var(--green)' : aiResult.sentiment === 'mixed' ? BRAND : 'var(--red)',
                            }}>{(aiResult.sentiment || 'mixed').toUpperCase()}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, marginBottom: 14 }}>{aiResult.polishedNarrative}</div>
                        {aiResult.keyPoints?.length > 0 && (
                            <>
                                <span style={{ fontSize: 11, letterSpacing: '.18em', color: 'var(--muted-light)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Kernpunten</span>
                                <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 12, color: 'var(--text)', lineHeight: 1.7, marginBottom: 12 }}>
                                    {aiResult.keyPoints.map((p, i) => <li key={i}>{p}</li>)}
                                </ul>
                            </>
                        )}
                        {aiResult.actionables?.length > 0 && (
                            <div style={{ padding: 12, borderRadius: 10, background: `${BRAND}0d`, border: `1px solid ${BRAND}33` }}>
                                <span style={{ fontSize: 11, letterSpacing: '.18em', color: BRAND, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Actionables · volgende keer</span>
                                <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>
                                    {aiResult.actionables.map((a, i) => <li key={i}>{a}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* PDF EXPORT */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button onClick={generatePDF} style={{
                        padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                        background: `linear-gradient(180deg, ${GOLD}, #9e781c)`, color: '#000', border: 'none', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        boxShadow: `0 0 16px ${GOLD}33`,
                    }}>
                        <Download size={16} /> Service-rapport als PDF
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN — KDS Service Mode (per-event, fullscreen)
   URL: /events/[id]/service?fullscreen=1
   ═══════════════════════════════════════════════════════════════════ */
export default function ServiceMode() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlEventId = parseInt(String(params.id), 10);
    const isFullscreenMode = searchParams.get('fullscreen') === '1';

    const { isFullscreen, enterFullscreen, exitFullscreen } = useFullscreen();
    useWakeLock(isFullscreenMode);

    const showToast = useToast();

    const [view, setView] = useState<Exclude<View, 'hub'>>('board');
    const [courseId, setCourseId] = useState<string | null>(null);
    const [eventState, setEventState] = useState<ServiceEvent | null>(null);
    // Op phone start Rook NIET docked — anders covert hij het hele scherm voor de board zichtbaar wordt.
    const [rookDocked, setRookDocked] = useState(true);
    const isPhone = useIsPhone();
    useEffect(() => {
        if (isPhone) setRookDocked(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* DB-bronnen: events met bijbehorende courses + allergies + gerechten. */
    const { data: dbEvents } = useSupabase<DbEvent>('events', []);
    const { data: dbCourses } = useSupabase<DbCourse>('courses', []);
    const { data: dbAllergies } = useSupabase<DbEventAllergy>('event_allergies', []);
    const { data: dbGerechten, loading: gerechtenLoading } = useSupabase<{
        id: string; naam: string; allergenen?: string[];
        foto_url?: string | null; service_image?: string | null; service_tip?: string | null;
    }>('gerechten', []);

    /* Plattegrond-data → zone-labels per tafel ("achterin · glutenvrij"). */
    const { data: dbFloorPlans } = useSupabase<FloorPlan>('floor_plans', []);
    const { data: dbZones } = useSupabase<ServiceZone>('service_zones', []);
    const { data: dbPins } = useSupabase<FloorPlanGuest>('floor_plan_guests', []);

    const tableZones = useMemo<Record<number, TableZoneInfo>>(() => {
        const fp = dbFloorPlans.find(f => f.event_id === urlEventId);
        if (!fp) return {};
        const zones = dbZones.filter(z => z.floor_plan_id === fp.id);
        if (zones.length === 0) return {};
        const pins = dbPins.filter(p => p.event_id === urlEventId);
        const allergies = dbAllergies.filter(a => a.event_id === urlEventId);
        return computeTableZones(fp.canvas_json, zones, pins, allergies);
    }, [dbFloorPlans, dbZones, dbPins, dbAllergies, urlEventId]);

    /* Build het ServiceEvent voor het event in de URL.
       Geen mock-fallback hier — als courses ontbreken, tonen we een lege state
       met directe link terug naar de event-hub om gangen te koppelen. */
    const dbEvent = useMemo(() => {
        return dbEvents.find(e => e.id === urlEventId) || null;
    }, [dbEvents, urlEventId]);

    const builtEvent = useMemo(() => {
        if (!dbEvent) return null;
        return dbEventToServiceEvent(dbEvent, dbCourses, dbAllergies, dbGerechten);
    }, [dbEvent, dbCourses, dbAllergies, dbGerechten]);

    /* Sync builtEvent → eventState (deep-clone zodat optimistic updates lokaal blijven).
       Gate op gerechtenLoading: de state wordt maar één keer geseed, en zonder
       deze gate verloor je de race met de gerechten-fetch — bord stond dan
       zonder foto's/service-tips/allergie-flags vastgeklikt. */
    useEffect(() => {
        if (builtEvent && !eventState && !gerechtenLoading) {
            setEventState(JSON.parse(JSON.stringify(builtEvent)));
        }
        /* eslint-disable-next-line react-hooks/exhaustive-deps */
    }, [builtEvent, gerechtenLoading]);

    /* Auto-enter fullscreen bij ?fullscreen=1 */
    useEffect(() => {
        if (isFullscreenMode && !isFullscreen) {
            enterFullscreen().catch(() => { /* user denied */ });
        }
    }, [isFullscreenMode, isFullscreen, enterFullscreen]);

    /* ESC = exit fullscreen + terug naar hub */
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape' && isFullscreenMode) {
                exitFullscreen();
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isFullscreenMode, exitFullscreen]);

    function handleExitToHub() {
        if (confirm('Service Mode afsluiten? Voortgang blijft bewaard.')) {
            exitFullscreen();
            router.push(`/events/${urlEventId}/hub`);
        }
    }

    function openCourse(cid: string) {
        setCourseId(cid);
        setView('detail');
    }

    function advanceStatus(cid: string) {
        setEventState(state => {
            if (!state) return state;
            const next = {
                ...state,
                courses: state.courses.map(c => {
                    if (c.id !== cid) return c;
                    const order: CourseStatus[] = ['queued', 'active', 'ready', 'served'];
                    const idx = order.indexOf(c.status);
                    const newStatus: CourseStatus = c.status === 'served' ? 'ready' : order[Math.min(idx + 1, order.length - 1)];
                    /* Voorraad-aftrek wanneer een gang nu server-status krijgt */
                    if (newStatus === 'served' && c.status !== 'served') {
                        const totalPortions = c.items.reduce((a, i) => a + (i.count || 0), 0);
                        const alreadyServed = c.items.filter(i => i.served).reduce((a, i) => a + (i.count || 0), 0);
                        const newlyServed = totalPortions - alreadyServed;   /* portions die met deze advance "served" worden */
                        if (newlyServed > 0) {
                            void deductCourseFromInventory(c, newlyServed, state.title, (msg) => showToast(msg, 'warning'));
                        }
                    }
                    return { ...c, status: newStatus };
                }),
            };
            return next;
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
                            if (i.ready) {
                                /* Item van ready → served: trek dat aandeel af van voorraad */
                                void deductCourseFromInventory(c, i.count || 0, state.title, (msg) => showToast(msg, 'warning'));
                                return { ...i, served: true };
                            }
                            if (i.inProgress) return { ...i, inProgress: false, ready: true };
                            return { ...i, inProgress: true };
                        }),
                    };
                }),
            };
        });
    }

    /* Actieplan-voorstel bevestigd → persist naar courses.steps (+plating
       als de gang er nog geen had) en werk de lokale state bij. */
    async function applyActieplan(courseUiId: string, result: ActieplanResult) {
        const dbId = parseInt(courseUiId.replace('c_', ''), 10);
        const target = eventState?.courses.find(c => c.id === courseUiId);
        const fillPlating = !!target && target.plating.length === 0 && result.plating.length > 0;
        if (Number.isFinite(dbId)) {
            const { supabase } = await import('@/lib/supabase');
            const patch: Record<string, unknown> = { steps: result.steps };
            if (fillPlating) patch.plating = result.plating;
            const { error } = await supabase.from('courses').update(patch).eq('id', dbId);
            if (error) {
                showToast('Actieplan opslaan mislukt: ' + error.message, 'error');
                return;
            }
        }
        setEventState(state => state ? ({
            ...state,
            courses: state.courses.map(c => c.id === courseUiId
                ? { ...c, steps: result.steps, plating: fillPlating ? result.plating : c.plating }
                : c),
        }) : state);
        showToast(`Actieplan toegevoegd — ${result.steps.length} stappen.`, 'success');
    }

    /* Build chef context for AI — rijk aan info zodat Rook precies weet wat er speelt */
    const chefContext = useMemo<ChefContext>(() => {
        const now = new Date().toTimeString().slice(0, 5);
        if (!eventState) return { now, currentView: view };

        const active = eventState.courses.filter(c => c.status === 'active');
        const queued = eventState.courses.filter(c => c.status === 'queued');
        const current = view === 'detail' && courseId ? eventState.courses.find(c => c.id === courseId) : active[0] || queued[0];
        const idxOfCurrent = current ? eventState.courses.indexOf(current) : -1;
        const next = idxOfCurrent >= 0 && idxOfCurrent < eventState.courses.length - 1 ? eventState.courses[idxOfCurrent + 1] : undefined;

        /* Course-progress array */
        const coursesProgress = eventState.courses.map(c => {
            const total = c.items.reduce((a, i) => a + (i.count || 0), 0);
            const served = c.items.filter(i => i.served).reduce((a, i) => a + (i.count || 0), 0);
            return { num: c.num, title: c.title, status: c.status, servedPortions: served, totalPortions: total };
        });

        /* Mins to next course */
        const minsToNext = next ? (() => {
            const [eh, em] = eventState.startTime.split(':').map(Number);
            const eventStartMin = eh * 60 + em;
            const nextStartMin = eventStartMin + next.serveTime;
            const [nh, nm] = now.split(':').map(Number);
            const nowMin = nh * 60 + nm;
            return nextStartMin - nowMin;
        })() : undefined;

        return {
            now,
            currentView: view,
            eventTitle: eventState.title,
            eventVenue: eventState.venue,
            eventGuests: eventState.guests,
            activeCourseId: current?.id,
            activeCourseTitle: current?.title,
            activeCourseStart: current ? `${eventState.startTime} +${current.serveTime}m` : undefined,
            activeCourseStatus: current?.status,
            activeCourseDescription: current?.description,
            minsUntilNextCourse: minsToNext !== undefined && minsToNext > 0 ? minsToNext : undefined,
            nextCourseTitle: next?.title,
            misePctDone: undefined,
            miseRemaining: current?.mise.map(m => ({ label: `${m.item} (${m.qty})`, critical: false })),
            coursesProgress,
            allergies: eventState.allergyTable.map(a => ({
                table: a.table,
                person: a.name,
                issue: a.note,
                allergens: a.allergens,
                severity: a.allergens.includes('N') || a.allergens.includes('VE') ? 'critical' : 'must',
            })),
        };
    }, [eventState, courseId, view]);

    // Op phone (<768) docken we Rook NIET — hij staat als overlay/sheet
    // op z-index, anders neemt hij 380px breedte in op een 375px scherm.
    const rookOffset = isPhone ? 0 : (rookDocked ? 380 : 0);

    /* Loading state: dbEvents nog niet ingeladen */
    if (!dbEvents.length && !dbEvent) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: 'var(--muted)', fontSize: 14 }}>Laden…</div>
            </div>
        );
    }

    /* Event niet gevonden */
    if (!dbEvent) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
                <div style={{ fontSize: 18, fontWeight: 600 }}>Event niet gevonden</div>
                <p style={{ color: 'var(--muted)', textAlign: 'center', maxWidth: 400 }}>Dit event bestaat niet of je hebt geen toegang.</p>
                <button onClick={() => router.push('/events')} style={{
                    padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                    background: BRAND, color: '#0f0f0f', border: 'none', cursor: 'pointer',
                }}>Terug naar events</button>
            </div>
        );
    }

    /* Geen courses voor dit event — toon directe link naar event-hub om gangen te koppelen */
    if (!eventState && (!builtEvent || builtEvent.courses.length === 0)) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
                <div style={{ fontSize: 28 }}>🍽️</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>Nog geen gangen voor dit event</div>
                <p style={{ color: 'var(--muted)', textAlign: 'center', maxWidth: 480, lineHeight: 1.6 }}>
                    Service Mode draait op de gangen die je in de Event Hub hebt gekoppeld.
                    Voeg eerst een menu toe of koppel gangen — daarna start je de service.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => { exitFullscreen(); router.push(`/events/${urlEventId}/hub`); }} style={{
                        padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                        background: BRAND, color: '#0f0f0f', border: 'none', cursor: 'pointer',
                    }}>Open Event Hub</button>
                    <button onClick={() => { exitFullscreen(); router.push('/events'); }} style={{
                        padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                        background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer',
                    }}>Alle events</button>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* Exit-fullscreen knop — altijd zichtbaar als we in fullscreen-mode draaien */}
            {isFullscreenMode && (
                <button onClick={handleExitToHub} title="Sluit Service Mode" style={{
                    position: 'fixed', top: 14, right: 14, zIndex: 1000,
                    width: 40, height: 40, borderRadius: 10,
                    background: 'rgba(0,0,0,.7)', border: '1px solid rgba(255,255,255,.15)',
                    color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(8px)',
                }}>
                    <X size={18} />
                </button>
            )}

            {view === 'board' && eventState && (
                <ServiceModeBoard
                    event={eventState}
                    eventDbId={urlEventId}
                    tableZones={tableZones}
                    onOpenCourse={openCourse}
                    onAdvanceStatus={advanceStatus}
                    onBack={handleExitToHub}
                    onWrapup={() => setView('wrapup')}
                    rookOffset={rookOffset}
                />
            )}

            {view === 'wrapup' && eventState && (
                <ServiceModeWrapup event={eventState} onBackToBoard={() => setView('board')} rookOffset={rookOffset} />
            )}

            {view === 'detail' && eventState && courseId && (
                <ServiceModeDetail
                    event={eventState}
                    courseId={courseId}
                    tableZones={tableZones}
                    onBack={() => setView('board')}
                    onAdvance={() => advanceStatus(courseId)}
                    onToggleItem={toggleItem}
                    onApplyActieplan={(result) => applyActieplan(courseId, result)}
                    rookOffset={rookOffset}
                />
            )}

            {/* Persistent AI Chef Rook — over alle views */}
            <AIChefAssistant context={chefContext} onDockChange={setRookDocked} />
        </>
    );
}
