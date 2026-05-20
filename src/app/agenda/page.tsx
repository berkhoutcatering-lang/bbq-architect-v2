'use client';
import { useState, useMemo, useEffect, type ComponentType } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSupabase } from '@/lib/useSupabase';
import { useIsPhone } from '@/hooks/useIsMobile';
import { detectAllConflicts } from '@/lib/conflictDetection';
import type { LucideProps } from 'lucide-react';
import type { Event as DbEvent, PrepTask } from '@/types';
import type { AgendaPersonal } from '@/types/database.types';
import {
    PartyPopper, ClipboardList, Users, Truck,
    ChevronLeft, ChevronRight, Filter, Grid3x3, Columns3, List as ListIcon,
    Sparkles, AlertTriangle, X, MapPin, Euro, Clock, Calendar,
    Check, RefreshCw, Plus, Pencil,
} from 'lucide-react';
import PageGuideNote from '@/components/PageGuideNote';
import ErrorCard from '@/components/ErrorCard';
import { useAgendaPersonal } from './_components/useAgendaPersonal';
import PersonalEventModal from './_components/PersonalEventModal';

const GOLD = '#c4a35a';
const BRAND = '#FFBF00';

/* ═══════════════════════════════════════════════════════════════════
   AGENDA — gevoed door echte DB events (tabel: events) + prep_tasks +
   agenda_personal. Alleen kalender-types met live data zijn zichtbaar.
   ═══════════════════════════════════════════════════════════════════ */

const NL_MONTHS = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];

type IconComponent = ComponentType<LucideProps>;

interface CalendarMeta { id: string; label: string; color: string; Icon: IconComponent; synced: boolean; source: string }

const CALENDARS: CalendarMeta[] = [
    { id: 'events', label: 'Events', color: BRAND, Icon: PartyPopper, synced: true, source: 'lokaal' },
    { id: 'prep', label: 'Prep deadlines', color: GOLD, Icon: ClipboardList, synced: true, source: 'lokaal' },
    { id: 'personal', label: 'Persoonlijk', color: '#888888', Icon: Clock, synced: true, source: 'lokaal' },
];

interface AgendaEvent {
    id: string; calId: string; day: number; start: number; duration: number; title: string;
    /* Optionele velden die de UI rendert — toegevoegd zodat ts-narrowing werkt
       zonder dat we per gebruik een cast nodig hebben. */
    client?: string;
    guests?: number;
    venue?: string;
    revenue?: number;
    package?: string;
    cuts?: string;
    target?: string;
    wood?: string;
    staff?: string[];
    supplier?: string;
    amount?: number;
    kind?: string;
    conflict?: { note?: string } | string;
    conflictNote?: string;
    notes?: string;
    isPersonal?: boolean;
    personalId?: string;
    color?: string;
    critical?: boolean;
    warning?: boolean;
    dbDate?: string;
    for?: string;
    done?: boolean;
    /* extras uit `ev(... extras)` of `personalToAgendaEvent` mogen overige
       velden hebben; we typeen dat als unknown ipv any zodat de eslint-disable
       weg kan en consumers expliciet narrowen waar nodig. */
    [key: string]: unknown;
}

const ev = (id: string, calId: string, day: number, start: number, duration: number, title: string, extras: Partial<AgendaEvent> = {}): AgendaEvent =>
    ({ id, calId, day, start, duration, title, ...extras });

/* Demo-fallback is bewust verwijderd (2026-05-08). De agenda draait altijd
   op live DB-data — events + prep_tasks van de huidige org. Lege staten
   krijgen een eerlijke "geen events nog" UI i.p.v. fake data uit maart 2025. */

/* ═══════════════════════════════════════════════════════════════════
   ATOMS
   ═══════════════════════════════════════════════════════════════════ */
function Eyebrow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--muted-light)', fontWeight: 700, textTransform: 'uppercase', ...style }}>{children}</div>;
}

function MetalCard({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
    return <div className={className} style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, ...style }}>{children}</div>;
}

const calById = (id: string) => CALENDARS.find(c => c.id === id) || CALENDARS[0];
const fmtEur = (n: number) => '€ ' + n.toLocaleString('nl-NL');

/* ═══════════════════════════════════════════════════════════════════
   HERO + KPIs + SYNC
   ═══════════════════════════════════════════════════════════════════ */
interface AgendaKpis {
    upcoming30d: number; revenuePipeline: number; revenuePipelineConfirmed: number; conflicts: number;
    freeWeekendsLeft: number; prepTasksOpen: number; isEmpty: boolean;
}
function AgendaHero({ kpis, onAiClick }: { kpis: AgendaKpis; onAiClick: () => void }) {
    return (
        <div style={{
            position: 'relative', borderRadius: 20, padding: 24,
            background: `linear-gradient(135deg, ${BRAND}0a 0%, ${GOLD}05 50%, rgba(28,28,32,.7) 100%)`,
            border: `1px solid ${GOLD}30`, overflow: 'hidden',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
                <div style={{ minWidth: 0 }}>
                    <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 200, fontSize: 34, letterSpacing: '-.015em', margin: '0 0 4px' }}>Agenda</h1>
                    <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                        {kpis.isEmpty
                            ? 'Nog geen events — maak er een aan via /events om je agenda op te bouwen'
                            : 'Live agenda · gevoed door je events + prep-taken'}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <SyncBadge live={!kpis.isEmpty} />
                    <button onClick={onAiClick} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8,
                        background: `linear-gradient(180deg, ${GOLD}, #9e781c)`, color: '#0a0a0c',
                        fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer',
                    }}>
                        <Sparkles size={14} /> AI Insights
                    </button>
                </div>
            </div>

            <div className="agenda-kpi-grid">
                <KpiTile Icon={PartyPopper} color={BRAND} label="Komende 30d" value={kpis.upcoming30d.toString()} sub="events bevestigd" />
                <KpiTile Icon={Euro} color={GOLD} label="Omzet pipeline" value={fmtEur(kpis.revenuePipeline)} sub={`${fmtEur(kpis.revenuePipelineConfirmed)} bevestigd`} />
                <KpiTile Icon={ClipboardList} color="#60a5fa" label="Prep open" value={kpis.prepTasksOpen.toString()} sub={kpis.prepTasksOpen === 0 ? 'alles klaar' : 'nog te doen'} />
                <KpiTile Icon={Calendar} color="#10b981" label="Vrije weekends" value={kpis.freeWeekendsLeft.toString()} sub="deze maand" />
                <KpiTile Icon={AlertTriangle} color="var(--red)" label="Conflicten" value={kpis.conflicts.toString()} sub={kpis.conflicts > 0 ? 'vraagt actie' : 'geen issues'} />
            </div>
        </div>
    );
}

function KpiTile({ Icon, color, label, value, sub }: { Icon: IconComponent; color: string; label: string; value: string; sub: string }) {
    return (
        <div style={{ padding: 14, borderRadius: 12, background: 'rgba(28,28,32,.6)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>{label}</span>
                <Icon size={14} style={{ color }} />
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 200, fontSize: 24, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>
        </div>
    );
}

function SyncBadge({ live }: { live: boolean }) {
    const color = live ? '#10b981' : 'var(--muted)';
    const bg = live ? 'rgba(16,185,129,.08)' : 'rgba(255,255,255,.04)';
    const bd = live ? 'rgba(16,185,129,.3)' : 'var(--border)';
    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px',
            borderRadius: 999, background: bg,
            border: `1px solid ${bd}`, fontSize: 11, color,
        }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, animation: live ? 'sync-pulse 2s infinite' : 'none' }} />
            <strong>{live ? 'Live data' : 'Leeg'}</strong>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   MONTH NAV
   ═══════════════════════════════════════════════════════════════════ */
interface MonthNavProps {
    view: string;
    setView: (v: 'month' | 'week' | 'list') => void;
    monthLabel: string;
    onPrev: () => void;
    onNext: () => void;
    onToday: () => void;
    onAddPersonal: () => void;
}
function MonthNav({ view, setView, monthLabel, onPrev, onNext, onToday, onAddPersonal }: MonthNavProps) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', background: 'rgba(28,28,32,.6)', border: '1px solid var(--border)', borderRadius: 12,
            flexWrap: 'wrap', gap: 12,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={onPrev} style={navBtnStyle()} aria-label="Vorige maand"><ChevronLeft size={16} /></button>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 300, letterSpacing: '-.01em', minWidth: 160 }}>{monthLabel}</div>
                <button onClick={onNext} style={navBtnStyle()} aria-label="Volgende maand"><ChevronRight size={16} /></button>
                <button onClick={onToday} style={navPillStyle(BRAND)}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: BRAND }} /> Vandaag
                </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={onAddPersonal} style={navPillStyle('#a78bfa')}>
                    <Plus size={11} /> Afspraak
                </button>
                <div style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: 'rgba(0,0,0,.3)', border: '1px solid var(--border)' }}>
                    <button onClick={() => setView('month')} style={viewTabStyle(view === 'month')}><Grid3x3 size={11} /> Maand</button>
                    <button disabled title="Binnenkort beschikbaar" style={{ ...viewTabStyle(false), opacity: 0.35, cursor: 'not-allowed' }}><Columns3 size={11} /> Week</button>
                    <button disabled title="Binnenkort beschikbaar" style={{ ...viewTabStyle(false), opacity: 0.35, cursor: 'not-allowed' }}><ListIcon size={11} /> Lijst</button>
                </div>
                <button style={navPillStyle()}>
                    <Filter size={11} /> Filter
                </button>
            </div>
        </div>
    );
}

const navBtnStyle = (): React.CSSProperties => ({
    width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)',
    color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
});

/* Uniforme pill-style voor MonthNav-knoppen (Vandaag, Filter). Optionele accent-color
   tint de border + tekst zodat de "Vandaag"-knop herkenbaar blijft als dag-anchor. */
const navPillStyle = (accent?: string): React.CSSProperties => ({
    padding: '7px 12px', borderRadius: 8,
    background: accent ? `${accent}0f` : 'rgba(255,255,255,.04)',
    border: `1px solid ${accent ? `${accent}40` : 'var(--border)'}`,
    color: accent || 'var(--muted)',
    fontSize: 11, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
});

const viewTabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 7,
    background: active ? `${BRAND}1f` : 'transparent',
    border: 'none', color: active ? BRAND : 'var(--muted)',
    fontSize: 11, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 5,
    boxShadow: active ? `inset 0 0 0 1px ${BRAND}4D` : 'none',
});

/* ═══════════════════════════════════════════════════════════════════
   CALENDAR LEGEND
   ═══════════════════════════════════════════════════════════════════ */
function CalendarLegend({ active, onToggle, counts }: { active: string[]; onToggle: (id: string) => void; counts: Record<string, number> }) {
    return (
        <MetalCard className="agenda-legend">
            <div className="agenda-legend__title" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Agenda&rsquo;s</div>
            <div className="agenda-legend__items">
                {CALENDARS.map(c => {
                    const isOn = active.includes(c.id);
                    const count = counts[c.id] || 0;
                    return (
                        <div key={c.id} onClick={() => onToggle(c.id)} className="agenda-legend__item" style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                            background: isOn ? `${c.color}10` : 'transparent', opacity: isOn ? 1 : 0.5,
                            border: `1px solid ${isOn ? `${c.color}33` : 'transparent'}`,
                        }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                            <c.Icon size={13} style={{ color: c.color, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }} className="agenda-legend__label">
                                <div style={{ fontSize: 12, fontWeight: 500 }}>{c.label}</div>
                                <div className="agenda-legend__sub" style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {c.source} · {count}
                                </div>
                            </div>
                            <span className="agenda-legend__count-mobile" style={{ display: 'none', fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{count}</span>
                            {c.synced && <RefreshCw size={10} style={{ color: 'var(--muted-light)', flexShrink: 0 }} />}
                        </div>
                    );
                })}
            </div>
        </MetalCard>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   MONTH GRID
   ═══════════════════════════════════════════════════════════════════ */
const WEEKDAYS_NL = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
function daysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function dowMon0(date: Date) { return (date.getDay() + 6) % 7; }

function MonthGrid({ year, month, activeCals, events, onSelectEvent, onQuickAddDay, focusedEventId }: {
    year: number; month: number; activeCals: string[]; events: AgendaEvent[]; onSelectEvent: (e: AgendaEvent) => void; onQuickAddDay?: (isoDate: string) => void; focusedEventId?: string | null;
}) {
    /* "Vandaag" alleen highlighten als de zichtbare maand daadwerkelijk de
       huidige maand is — anders staat hij verkeerd in een ander tijdvak. */
    const now = new Date();
    const todayDay = (now.getFullYear() === year && now.getMonth() === month) ? now.getDate() : -1;
    const totalDays = daysInMonth(year, month);
    const firstDow = dowMon0(new Date(year, month, 1));
    const cells = useMemo(() => {
        const rows: { day: number | null; date: Date | null }[][] = [];
        let curRow: { day: number | null; date: Date | null }[] = [];
        for (let i = 0; i < firstDow; i++) curRow.push({ day: null, date: null });
        for (let d = 1; d <= totalDays; d++) {
            curRow.push({ day: d, date: new Date(year, month, d) });
            if (curRow.length === 7) { rows.push(curRow); curRow = []; }
        }
        while (curRow.length > 0 && curRow.length < 7) curRow.push({ day: null, date: null });
        if (curRow.length === 7) rows.push(curRow);
        return rows;
    }, [year, month, totalDays, firstDow]);

    const eventsByDay = useMemo(() => {
        const map: Record<number, AgendaEvent[]> = {};
        events.filter(e => activeCals.includes(e.calId)).forEach(e => {
            (map[e.day] ||= []).push(e);
        });
        Object.values(map).forEach(arr => arr.sort((a, b) => a.start - b.start));
        return map;
    }, [events, activeCals]);

    return (
        <MetalCard style={{ padding: 0, overflow: 'hidden' }} className="agenda-cal-card">
            <div className="agenda-cal-scroll">
                <div className="agenda-cal-head">
                    {WEEKDAYS_NL.map(w => (
                        <div key={w} style={{ padding: '8px 12px', textAlign: 'center', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, background: 'rgba(130,130,130,.04)' }}>{w}</div>
                    ))}
                </div>
                <div>
                    {cells.map((row, rIdx) => (
                        <div key={rIdx} className="agenda-cal-row" style={{ borderBottom: rIdx === cells.length - 1 ? 'none' : '1px solid var(--border)' }}>
                        {row.map((cell, cIdx) => (
                            <DayCell key={cIdx} day={cell.day} isToday={cell.day === todayDay} isWeekend={cIdx >= 5}
                                events={cell.day ? eventsByDay[cell.day] || [] : []}
                                isLastCol={cIdx === 6}
                                onSelectEvent={onSelectEvent}
                                focusedEventId={focusedEventId}
                                onQuickAdd={onQuickAddDay && cell.day ? () => {
                                    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
                                    onQuickAddDay(iso);
                                } : undefined}
                            />
                        ))}
                    </div>
                ))}
                </div>
            </div>
        </MetalCard>
    );
}

function DayCell({ day, isWeekend, isToday, events, isLastCol, onSelectEvent, onQuickAdd, focusedEventId }: {
    day: number | null; isWeekend: boolean; isToday: boolean; events: AgendaEvent[]; isLastCol: boolean; onSelectEvent: (e: AgendaEvent) => void; onQuickAdd?: () => void; focusedEventId?: string | null;
}) {
    if (!day) return <div style={{ minHeight: 110, borderRight: isLastCol ? 'none' : '1px solid var(--border)', background: 'rgba(0,0,0,.15)' }} />;
    const visible = events.slice(0, 3);
    const more = events.length - visible.length;
    return (
        <div
            onClick={onQuickAdd}
            style={{
                minHeight: 110, padding: 8, borderRight: isLastCol ? 'none' : '1px solid var(--border)',
                background: isToday ? `${BRAND}0a` : isWeekend ? 'rgba(0,0,0,.1)' : 'transparent',
                position: 'relative',
                cursor: onQuickAdd ? 'pointer' : 'default',
            }}
            title={onQuickAdd ? 'Klik om afspraak toe te voegen' : undefined}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{
                    fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? BRAND : 'var(--text)',
                    fontVariantNumeric: 'tabular-nums',
                }}>{day}</span>
                {isToday && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: BRAND, color: '#000', fontWeight: 700, letterSpacing: '.1em' }}>NU</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {visible.map(ev => <EventChip key={ev.id} event={ev} onClick={() => onSelectEvent(ev)} focused={focusedEventId === ev.id} />)}
                {more > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: 2 }}>+ {more} meer</div>
                )}
            </div>
        </div>
    );
}

function EventChip({ event, onClick, focused }: { event: AgendaEvent; onClick: () => void; focused?: boolean }) {
    const cal = calById(event.calId);
    /* Personal items mogen eigen kleur kiezen; voor andere calendars de cal-default. */
    const accentColor: string = (event.isPersonal && event.color) ? event.color as string : cal.color;
    const critical = event.critical || event.conflict || event.warning;
    return (
        <div
            data-event-id={event.id}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            style={{
                padding: '3px 6px', borderRadius: 4, fontSize: 10, lineHeight: 1.3,
                background: focused ? `${accentColor}4d` : `${accentColor}1f`, color: 'var(--text)',
                borderLeft: `3px solid ${accentColor}`,
                cursor: 'pointer',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                position: 'relative',
                outline: focused ? `2px solid ${accentColor}` : undefined,
                outlineOffset: focused ? 1 : undefined,
                transition: 'background 200ms, outline 200ms',
            }}>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: accentColor, fontWeight: 600, marginRight: 4 }}>
                {String(Math.floor(event.start)).padStart(2, '0')}:{event.start % 1 ? '30' : '00'}
            </span>
            {event.title}
            {critical && <span style={{ position: 'absolute', right: 4, top: 2, fontSize: 8, color: 'var(--red)' }}>!</span>}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   UPCOMING LIST
   ═══════════════════════════════════════════════════════════════════ */
interface UpcomingItem {
    day: number;
    name: string;
    guests: number;
    time: string;
    revenue: number;
    status: string;
    emoji: string;
    warning?: boolean;
    dbId?: number;
    dbDate?: string;
}
function UpcomingList({ items, onSelect }: { items: UpcomingItem[]; onSelect: (it: UpcomingItem) => void }) {
    if (items.length === 0) {
        return (
            <MetalCard>
                <Eyebrow style={{ marginBottom: 10 }}>Komende events</Eyebrow>
                <div style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                    Nog geen events ingepland.
                </div>
                <Link href="/events" className="btn btn-brand" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
                    Maak je eerste event
                </Link>
            </MetalCard>
        );
    }
    return (
        <MetalCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Eyebrow>Komende events</Eyebrow>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((it, i) => (
                    <div key={i} onClick={() => onSelect(it)} style={{
                        display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 10, alignItems: 'center',
                        padding: 10, borderRadius: 10, cursor: 'pointer',
                        background: it.warning ? 'rgba(239,68,68,.04)' : 'rgba(28,28,32,.4)',
                        border: `1px solid ${it.warning ? 'rgba(239,68,68,.2)' : 'transparent'}`,
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 8, background: 'rgba(0,0,0,.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, position: 'relative',
                        }}>
                            {it.emoji}
                            <span style={{ position: 'absolute', bottom: -3, right: -3, fontSize: 9, padding: '1px 4px', borderRadius: 3, background: BRAND, color: '#000', fontWeight: 700 }}>{it.day}</span>
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{it.time} · {it.guests} gasten · {fmtEur(it.revenue)}</div>
                        </div>
                        <span style={{
                            fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700, letterSpacing: '.08em',
                            background: it.status === 'live' ? 'rgba(34,197,94,.15)' : it.status === 'optie' ? `${BRAND}1f` : `${GOLD}26`,
                            color: it.status === 'live' ? 'var(--green)' : it.status === 'optie' ? BRAND : GOLD,
                        }}>{it.status.toUpperCase()}</span>
                    </div>
                ))}
            </div>
        </MetalCard>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   EVENT DETAIL DRAWER
   ═══════════════════════════════════════════════════════════════════ */
function EventDetailDrawer({ event, onClose, onEditPersonal }: { event: AgendaEvent | null; onClose: () => void; onEditPersonal?: (personalId: string) => void }) {
    const isPhone = useIsPhone();
    if (!event) return null;
    const cal = calById(event.calId);
    const isPersonal = !!event.isPersonal;
    const asideStyle: React.CSSProperties = isPhone
        ? { position: 'fixed', bottom: 0, left: 0, right: 0, height: 'auto', maxHeight: '90dvh', width: '100%', background: 'var(--color-bg-elevated)', borderTop: '1px solid var(--border)', borderRadius: '20px 20px 0 0', zIndex: 9999, boxShadow: '0 -20px 40px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }
        : { position: 'fixed', right: 0, top: 0, height: '100vh', width: 580, maxWidth: '100vw', background: 'var(--color-bg-elevated)', borderLeft: '1px solid var(--border)', zIndex: 9999, boxShadow: '-20px 0 40px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column', overflowY: 'auto' };
    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 9998 }} />
            <aside style={asideStyle}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: `linear-gradient(180deg, ${cal.color}15, transparent)`, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${cal.color}, transparent)` }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', background: `${cal.color}22`, color: cal.color, border: `1px solid ${cal.color}40` }}>{cal.label.toUpperCase()}</span>
                                {event.status && <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', background: 'rgba(0,0,0,.3)', color: 'var(--text)' }}>{(event.status as string).toUpperCase()}</span>}
                                {event.critical && <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', background: 'rgba(239,68,68,.15)', color: 'var(--red)' }}>CRITICAL</span>}
                            </div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 300, letterSpacing: '-.01em' }}>{event.title}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                                {String(Math.floor(event.start)).padStart(2, '0')}:{event.start % 1 ? '30' : '00'} · {event.duration}u{event.dbDate ? ' · ' + new Date(event.dbDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                            </div>
                        </div>
                        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={16} />
                        </button>
                    </div>
                </div>
                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {event.client && <FactRow label="Klant" value={event.client} />}
                    {event.guests && <FactRow label="Gasten" value={`${event.guests}p`} />}
                    {event.venue && <FactRow label="Locatie" value={event.venue} Icon={MapPin} />}
                    {event.revenue && <FactRow label="Omzet" value={fmtEur(event.revenue)} Icon={Euro} highlight />}
                    {event.package && <FactRow label="Pakket" value={event.package} />}
                    {event.cuts && <FactRow label="Vleeswaar" value={event.cuts} />}
                    {event.target && <FactRow label="Target" value={event.target} />}
                    {event.wood && <FactRow label="Hout" value={event.wood} />}
                    {event.staff && <FactRow label="Team" value={(event.staff as string[]).join(', ')} Icon={Users} />}
                    {event.supplier && <FactRow label="Leverancier" value={event.supplier} Icon={Truck} />}
                    {event.amount && <FactRow label="Bedrag" value={fmtEur(event.amount)} />}
                    {event.kind && <FactRow label="Type" value={event.kind} />}

                    {event.conflict && (
                        <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)' }}>
                            <Eyebrow style={{ color: 'var(--red)', marginBottom: 4 }}>Conflict</Eyebrow>
                            <div style={{ fontSize: 12, color: 'var(--text)' }}>{typeof event.conflict === 'string' ? event.conflict : (event.conflict.note ?? '')}</div>
                        </div>
                    )}
                    {event.conflictNote && (
                        <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)' }}>
                            <Eyebrow style={{ color: 'var(--red)', marginBottom: 4 }}>Capaciteit-warning</Eyebrow>
                            <div style={{ fontSize: 12, color: 'var(--text)' }}>{event.conflictNote}</div>
                        </div>
                    )}

                    {isPersonal && event.notes && (
                        <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)' }}>
                            <Eyebrow style={{ marginBottom: 6 }}>Notitie</Eyebrow>
                            <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{event.notes}</div>
                        </div>
                    )}

                    {isPersonal && onEditPersonal ? (
                        <button
                            onClick={() => event.personalId && onEditPersonal(event.personalId)}
                            className="btn btn-brand"
                            style={{ marginTop: 6, width: '100%', justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                            <Pencil size={14} /> Bewerken / verwijderen
                        </button>
                    ) : !isPersonal && (
                        <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: `${GOLD}0d`, border: `1px solid ${GOLD}26` }}>
                            <Eyebrow style={{ marginBottom: 8 }}>Gerelateerd</Eyebrow>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <a href="/prep-counter" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)', textDecoration: 'none' }}>
                                    <ClipboardList size={14} style={{ color: GOLD }} />
                                    Open prep planning
                                </a>
                                <a
                                    href={event.id ? `/events/${event.id}/hub` : '/events'}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)', textDecoration: 'none' }}
                                >
                                    <PartyPopper size={14} style={{ color: GOLD }} />
                                    Open Event Hub →
                                </a>
                                <a href="/voorraad" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)', textDecoration: 'none' }}>
                                    <Check size={14} style={{ color: GOLD }} />
                                    Check voorraad-status
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}

function FactRow({ label, value, Icon, highlight }: { label: string; value: React.ReactNode; Icon?: IconComponent; highlight?: boolean }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, padding: '10px 12px', borderRadius: 8, background: highlight ? `${GOLD}0a` : 'transparent', border: `1px solid ${highlight ? `${GOLD}26` : 'var(--border)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600 }}>
                {Icon && <Icon size={12} />}
                {label}
            </div>
            <div style={{ fontSize: 13, color: highlight ? GOLD : 'var(--text)', fontWeight: highlight ? 600 : 500 }}>{value}</div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
/* Parse "HH:MM" of "HH:MM:SS" naar uren-decimaal. Default 17 als ontbrekend. */
function parseTimeToHours(t: string | null | undefined, fallback: number): number {
    if (!t) return fallback;
    const m = t.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return fallback;
    return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}

/* Map een DB event naar het AgendaEvent shape dat dit page intern gebruikt. */
function mapDbEventToAgendaEvent(e: DbEvent): AgendaEvent {
    const [, , dd] = (e.date || '').split('-');
    const day = parseInt(dd || '1', 10);
    const guests = e.guests || 0;
    const omzet = guests * (e.ppp || 0);
    const start = parseTimeToHours(e.start_time, 17);
    const end = parseTimeToHours(e.end_time, start + (guests > 80 ? 8 : 6));
    const duration = Math.max(0.5, end - start);
    return ev(
        'evt_' + e.id,
        'events',
        day,
        start,
        duration,
        e.name + (guests ? ' ' + guests + 'p' : ''),
        {
            client: e.client_naam || '—',
            guests,
            type: e.type || 'Event',
            venue: e.location || '—',
            revenue: omzet,
            status: e.status || 'pending',
            dbId: e.id,
            dbDate: e.date,
            startTime: e.start_time,
            endTime: e.end_time,
        }
    );
}

/* Map persoonlijke afspraak naar AgendaEvent. parseTimeToHours pakt HH:MM(:SS). */
function mapPersonalToAgendaEvent(p: AgendaPersonal): AgendaEvent {
    const [, , dd] = (p.date || '').split('-');
    const day = parseInt(dd || '1', 10);
    const start = parseTimeToHours(p.start_time, 9);
    const end = p.end_time ? parseTimeToHours(p.end_time, start + 1) : start + 1;
    const duration = Math.max(0.25, end - start);
    return ev(
        'pers_' + p.id,
        'personal',
        day,
        start,
        duration,
        p.title,
        {
            personalId: p.id,
            isPersonal: true,
            kind: 'persoonlijk',
            notes: p.notes || undefined,
            color: p.color || undefined,
            dbDate: p.date,
            startTime: p.start_time,
            endTime: p.end_time,
        }
    );
}

/* Map prep_tasks naar het AgendaEvent prep-shape, tenzij geen event_id of geen text. */
function mapPrepTaskToAgendaEvent(p: PrepTask, eventDateMap: Record<number, string>): AgendaEvent | null {
    const eventDate = eventDateMap[p.event_id];
    if (!eventDate) return null;
    /* dagen is offset t.o.v. event-datum (negatief = vooraf, positief = erna) */
    const dt = new Date(eventDate);
    dt.setDate(dt.getDate() + (p.dagen || 0));
    return ev(
        'pt_' + p.id,
        'prep',
        dt.getDate(),
        8,
        1,
        p.text || 'Prep-taak',
        {
            for: 'evt_' + p.event_id,
            critical: false,
            done: !!p.done,
            dbDate: dt.toISOString().slice(0, 10),
        }
    );
}

export default function Agenda() {
    const today = new Date();
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [activeCals, setActiveCals] = useState<string[]>(CALENDARS.map(c => c.id));
    const [view, setView] = useState<'month' | 'week' | 'list'>('month');
    const [selectedEvent, setSelectedEvent] = useState<AgendaEvent | null>(null);

    /* Deep-link uit Vandaag-AttentionPanel: /agenda?conflict=<event-id>
       focust en scrollt naar het event in de calendar (Pillar 4 Vandaag-hub). */
    const searchParams = useSearchParams();
    const conflictId = searchParams?.get('conflict') ?? null;
    const [focusedEventId, setFocusedEventId] = useState<string | null>(null);

    useEffect(function () {
        if (!conflictId) return;
        setFocusedEventId(conflictId);
        /* Scroll naar event-chip; rAF zodat layout klaar is. */
        const t = setTimeout(function () {
            const el = document.querySelector(`[data-event-id="${conflictId}"]`);
            if (el && typeof el.scrollIntoView === 'function') {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 250);
        /* Highlight 5s, dan auto-clear zodat scroll-jumps niet blijvend storen. */
        const clearT = setTimeout(function () { setFocusedEventId(null); }, 5000);
        return function () { clearTimeout(t); clearTimeout(clearT); };
    }, [conflictId]);

    const { data: dbEvents, error: eventsError, refetch: refetchEvents } = useSupabase<DbEvent>('events', []);
    const { data: prepTasks, error: prepError } = useSupabase<PrepTask>('prep_tasks', []);
    const fetchError = eventsError || prepError;
    const { rows: personalRows, insert: insertPersonal, update: updatePersonal, remove: removePersonal } = useAgendaPersonal();

    /* Modal-state voor persoonlijke afspraken — open met datum (klik op lege dag-cel),
       met editing-row (klik op bestaande afspraak), of zonder beide (knop in MonthNav). */
    const [personalModalOpen, setPersonalModalOpen] = useState(false);
    const [personalModalDate, setPersonalModalDate] = useState<string | undefined>(undefined);
    const [personalModalEditing, setPersonalModalEditing] = useState<AgendaPersonal | null>(null);

    const openPersonalModal = (opts?: { date?: string; editing?: AgendaPersonal | null }) => {
        setPersonalModalDate(opts?.date);
        setPersonalModalEditing(opts?.editing || null);
        setPersonalModalOpen(true);
    };

    const toggleCal = (id: string) => setActiveCals(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    /* Filter DB events op de zichtbare maand, map naar AgendaEvent shape. */
    const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
    const monthDbEvents = useMemo(() => dbEvents.filter(e => (e.date || '').startsWith(monthPrefix)), [dbEvents, monthPrefix]);
    const dbAgendaEvents = useMemo(() => monthDbEvents.map(mapDbEventToAgendaEvent), [monthDbEvents]);

    /* Prep-taken alleen voor events in de huidige maand. */
    const eventDateMap = useMemo(() => {
        const m: Record<number, string> = {};
        for (const e of dbEvents) m[e.id] = e.date;
        return m;
    }, [dbEvents]);
    const dbPrepEvents = useMemo(() => {
        const list: AgendaEvent[] = [];
        for (const p of prepTasks) {
            const mapped = mapPrepTaskToAgendaEvent(p, eventDateMap);
            if (mapped && mapped.dbDate && mapped.dbDate.startsWith(monthPrefix)) list.push(mapped);
        }
        return list;
    }, [prepTasks, eventDateMap, monthPrefix]);

    /* Persoonlijke items deze maand → AgendaEvent shape. */
    const monthPersonalEvents = useMemo(() => {
        return personalRows
            .filter(p => (p.date || '').startsWith(monthPrefix))
            .map(mapPersonalToAgendaEvent);
    }, [personalRows, monthPrefix]);

    /* Alle events in zichtbare maand: events + prep-taken + persoonlijke afspraken. */
    const allEvents: AgendaEvent[] = useMemo(() => {
        return [...dbAgendaEvents, ...dbPrepEvents, ...monthPersonalEvents];
    }, [dbAgendaEvents, dbPrepEvents, monthPersonalEvents]);

    /* Counts per calendar voor de legend — dynamisch uit live data deze maand. */
    const calendarCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const cal of CALENDARS) counts[cal.id] = 0;
        for (const e of allEvents) counts[e.calId] = (counts[e.calId] || 0) + 1;
        return counts;
    }, [allEvents]);

    const isEmpty = dbEvents.length === 0 && personalRows.length === 0;

    /* Conflict-detectie altijd over live DB events. */
    const conflicts = useMemo(() => {
        return detectAllConflicts(dbEvents).conflicts;
    }, [dbEvents]);

    const kpis: AgendaKpis = useMemo(() => {
        const now = new Date();
        const horizon = new Date(); horizon.setDate(horizon.getDate() + 30);
        const horizonIso = horizon.toISOString().slice(0, 10);
        const todayIso = now.toISOString().slice(0, 10);
        const upcoming = dbEvents.filter(e => e.date && e.date.slice(0, 10) >= todayIso && e.date.slice(0, 10) <= horizonIso);
        /* Case-insensitive status-match — DB-status kan 'confirmed' / 'Confirmed' / 'bevestigd' staan
           afhankelijk van waar het event vandaan komt (acceptance-workflow vs handmatig). */
        const isConfirmed = (s: string) => {
            const x = (s || '').toLowerCase();
            return x === 'confirmed' || x === 'completed' || x === 'bevestigd';
        };
        const upcomingConfirmed = upcoming.filter(e => isConfirmed(e.status));
        const pipeline = upcoming.reduce((s, e) => s + (e.guests || 0) * (e.ppp || 0), 0);
        const pipelineConfirmed = upcomingConfirmed.reduce((s, e) => s + (e.guests || 0) * (e.ppp || 0), 0);
        /* Vrije weekends: in deze maand, weekend-dagen zonder event. */
        const totalDays = daysInMonth(viewYear, viewMonth);
        const monthEventDays = new Set(monthDbEvents.map(e => parseInt((e.date || '').split('-')[2] || '0', 10)));
        let freeWeekends = 0;
        for (let d = 1; d <= totalDays; d++) {
            const dow = new Date(viewYear, viewMonth, d).getDay();
            if ((dow === 0 || dow === 6) && !monthEventDays.has(d)) freeWeekends++;
        }
        return {
            upcoming30d: upcomingConfirmed.length,
            revenuePipeline: pipeline,
            revenuePipelineConfirmed: pipelineConfirmed,
            conflicts: conflicts.length,
            freeWeekendsLeft: Math.floor(freeWeekends / 2), /* zaterdag+zondag = 1 weekend */
            prepTasksOpen: prepTasks.filter(p => !p.done).length,
            isEmpty,
        };
    }, [dbEvents, monthDbEvents, conflicts, viewYear, viewMonth, isEmpty, prepTasks]);

    /* UPCOMING-rail uit live data — eerstvolgende 8 events. */
    const upcomingList: UpcomingItem[] = useMemo(() => {
        const todayIso = new Date().toISOString().slice(0, 10);
        return dbEvents
            .filter(e => e.date >= todayIso)
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(0, 8)
            .map(e => ({
                day: parseInt((e.date || '').split('-')[2] || '0', 10),
                name: e.name,
                guests: e.guests || 0,
                time: e.start_time ? e.start_time.slice(0, 5) : '—',
                revenue: (e.guests || 0) * (e.ppp || 0),
                status: e.status,
                emoji: e.type?.toLowerCase().includes('bruiloft') ? '💍' : e.type?.toLowerCase().includes('bedrijf') ? '🏢' : '🍖',
                dbId: e.id,
                dbDate: e.date,
            }));
    }, [dbEvents]);

    function shiftMonth(delta: number) {
        let m = viewMonth + delta;
        let y = viewYear;
        if (m < 0) { m = 11; y--; }
        if (m > 11) { m = 0; y++; }
        setViewMonth(m); setViewYear(y);
    }

    return (
        <div className="mobile-safe-bottom" style={{ padding: '24px var(--space-mobile-edge) 32px', maxWidth: 1600, margin: '0 auto' }}>
            <PageGuideNote
                id="agenda"
                accent="#FFBF00"
                icon={Calendar}
                intro="Hier zie je in één oogopslag wat er in je maand staat — events en prep-deadlines naast elkaar."
                actions={[
                    { lead: 'Klik op een event', text: 'om details te zien en direct door te springen naar de event-hub.' },
                    { lead: 'Conflicten rechts in beeld', text: 'tonen waar dubbele prep-deadlines of event-overlap zit.' },
                    { lead: "Filter agenda's links", text: 'om events, prep en persoonlijke afspraken apart te bekijken.' },
                ]}
            />
            <AgendaHero kpis={kpis} onAiClick={() => document.getElementById('ai-rail-anchor')?.scrollIntoView({ behavior: 'smooth' })} />

            {/* Fetch-error op events + prep: alleen tonen als data leeg is —
                bij stale-data (eerdere refetch was succesvol) blijft de
                kalender zichtbaar zodat user niet plots een lege maand ziet.
                Bundel 6b — ErrorCard uitrol over high-traffic pages. */}
            {fetchError && dbEvents.length === 0 && prepTasks.length === 0 && (
                <div style={{ marginTop: 16 }}>
                    <ErrorCard
                        title="Agenda kon niet worden geladen"
                        message="Events of prep-taken konden niet worden opgehaald. Probeer opnieuw — werkt het nog niet, dan ligt het waarschijnlijk aan de internetverbinding."
                        retry={refetchEvents}
                        details={fetchError}
                    />
                </div>
            )}

            <div style={{ height: 18 }} />
            <MonthNav
                view={view}
                setView={setView}
                monthLabel={`${NL_MONTHS[viewMonth]} ${viewYear}`}
                onPrev={() => shiftMonth(-1)}
                onNext={() => shiftMonth(1)}
                onToday={() => { const now = new Date(); setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); }}
                onAddPersonal={() => openPersonalModal()}
            />
            <div style={{ height: 18 }} />

            <div className="agenda-grid">
                <div>
                    <CalendarLegend active={activeCals} onToggle={toggleCal} counts={calendarCounts} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {view === 'month' && (
                        <MonthGrid
                            year={viewYear}
                            month={viewMonth}
                            activeCals={activeCals}
                            events={allEvents}
                            onSelectEvent={setSelectedEvent}
                            onQuickAddDay={(iso) => openPersonalModal({ date: iso })}
                            focusedEventId={focusedEventId}
                        />
                    )}
                    {view !== 'month' && (
                        <MetalCard style={{ padding: 60, textAlign: 'center' }}>
                            {view === 'week' ? <Columns3 size={48} style={{ color: 'var(--muted-weak)' }} /> : <ListIcon size={48} style={{ color: 'var(--muted-weak)' }} />}
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, marginTop: 16, color: 'var(--text)' }}>
                                {view === 'week' ? 'Week-view' : 'Lijst-view'}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                                Coming soon — focus deze ronde was de maand-grid
                            </div>
                        </MetalCard>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <span id="ai-rail-anchor" />
                    <UpcomingList items={upcomingList} onSelect={(it) => {
                        if (it.dbId) {
                            const ev = dbAgendaEvents.find(e => e.dbId === it.dbId);
                            if (ev) setSelectedEvent(ev);
                        }
                    }} />
                    {conflicts.length > 0 && (
                        <MetalCard>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <AlertTriangle size={14} style={{ color: 'var(--red)' }} />
                                <Eyebrow style={{ color: 'var(--red)' }}>Live conflicten</Eyebrow>
                            </div>
                            {conflicts.map((c, i) => (
                                <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.18)', marginBottom: 6, fontSize: 11, color: 'var(--text)', lineHeight: 1.45 }}>
                                    {c.note}
                                </div>
                            ))}
                        </MetalCard>
                    )}
                </div>
            </div>

            <EventDetailDrawer
                event={selectedEvent}
                onClose={() => setSelectedEvent(null)}
                onEditPersonal={(personalId) => {
                    const row = personalRows.find(p => p.id === personalId);
                    if (!row) return;
                    setSelectedEvent(null);
                    openPersonalModal({ editing: row });
                }}
            />

            <PersonalEventModal
                open={personalModalOpen}
                initialDate={personalModalDate}
                editing={personalModalEditing}
                onClose={() => { setPersonalModalOpen(false); setPersonalModalEditing(null); }}
                onSave={async (args) => {
                    if (personalModalEditing) {
                        await updatePersonal(personalModalEditing.id, args);
                    } else {
                        await insertPersonal(args);
                    }
                }}
                onDelete={personalModalEditing ? async () => {
                    if (personalModalEditing) await removePersonal(personalModalEditing.id);
                } : undefined}
            />
        </div>
    );
}
