/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import {
    Calendar, Users, Check, Circle, ChevronRight, RefreshCw,
    Clock, ChefHat, Flame, ShoppingCart, Target, ArrowLeft, X, Sparkles,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   PREP COUNTER v3 — operator-first prep workstation
   ═══════════════════════════════════════════════════════════════════ */

interface PrepTask {
    id: number;
    event_id: number;
    text: string;
    dagen: number;
    done: boolean;
}

interface ActiveEvent {
    id: number;
    name: string;
    date: string;
    guests: number | null;
    location: string | null;
}

interface MatchedGerecht {
    id: number;
    naam: string;
    categorie?: string;
    beschrijving?: string;
    ingredient_costs?: { naam: string; qty_pp: number; unit: string; yield?: number }[];
}

const DAY_LABELS: Record<number, { titel: string; korte: string; subtitel: string; icon: any; color: string; tip: string }> = {
    [-3]: {
        titel: 'D-3 · Bestellen & checken', korte: 'D-3', subtitel: 'Drie dagen vooraf',
        icon: ShoppingCart, color: '#a78bfa',
        tip: 'Vroege fase — vooral coördinatie. Check voorraad, bestel bij leveranciers, bevestig levertijden. Niets in de keuken.',
    },
    [-2]: {
        titel: 'D-2 · Marineren & rubben', korte: 'D-2', subtitel: 'Twee dagen vooraf',
        icon: Flame, color: '#f59e0b',
        tip: 'Smaak begint nu. Rubs en sauzen aanmaken, vlees voorbereiden voor lange marinaderij, rookhout in water zetten.',
    },
    [-1]: {
        titel: 'D-1 · Mise-en-place', korte: 'D-1', subtitel: 'Dag voor het event',
        icon: ChefHat, color: '#FFBF00',
        tip: 'Alles klaarzetten. Smoker testen, bus/auto inladen, service-materiaal checken. Eind-van-dag moet alles startklaar staan.',
    },
    [0]: {
        titel: 'D-0 · Event-dag', korte: 'D-0', subtitel: 'Event-dag zelf',
        icon: Target, color: 'var(--red)',
        tip: 'Showtime. Smoker aansteken, vlees op tijd erop, service-tijden bewaken. Geen tijd voor surprises — alles is voorbereid.',
    },
};

const KNOWN_DAYS = [-3, -2, -1, 0];

/* Spacing-scale (R7) — alleen deze waarden gebruiken. */
const SP = { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 } as const;
const RADIUS = { sm: 6, md: 8, lg: 12, xl: 16 } as const;

export default function PrepCounter() {
    const showToast = useToast();
    const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
    const [event, setEvent] = useState<ActiveEvent | null>(null);
    const [tasks, setTasks] = useState<PrepTask[]>([]);
    const [gerechten, setGerechten] = useState<MatchedGerecht[]>([]);
    const [loading, setLoading] = useState(true);
    const [justCompletedId, setJustCompletedId] = useState<number | null>(null);

    useEffect(() => { loadActiveEvent(); }, []);

    async function loadActiveEvent() {
        setLoading(true);
        try {
            const todayIso = new Date().toISOString().split('T')[0];
            const { data: events } = await supabase
                .from('events')
                .select('id, name, date, guests, location')
                .gte('date', todayIso)
                .neq('status', 'cancelled')
                .order('date', { ascending: true })
                .limit(1);
            const ev = events && events.length > 0 ? events[0] : null;
            setEvent(ev);
            if (!ev) { setTasks([]); setGerechten([]); return; }

            const [tRes, gRes] = await Promise.all([
                supabase.from('prep_tasks')
                    .select('id, event_id, text, dagen, done')
                    .eq('event_id', ev.id)
                    .order('dagen', { ascending: true })
                    .order('id', { ascending: true }),
                supabase.from('gerechten')
                    .select('id, naam, categorie, beschrijving, ingredient_costs')
                    .order('naam', { ascending: true }),
            ]);
            setTasks(tRes.data || []);
            setGerechten(gRes.data || []);
        } finally {
            setLoading(false);
        }
    }

    async function toggleTask(task: PrepTask) {
        const next = !task.done;
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: next } : t));
        if (next) {
            /* Peak-End moment — visuele celebration voor 1.5s */
            setJustCompletedId(task.id);
            setTimeout(() => setJustCompletedId(null), 1500);
            showToast('✓ ' + task.text + ' — klaar', 'success');
        }
        const { error } = await supabase.from('prep_tasks').update({ done: next }).eq('id', task.id);
        if (error) {
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: !next } : t));
            showToast('Fout bij opslaan: ' + error.message, 'error');
        }
    }

    function selectTask(taskId: number | null) {
        setSelectedTaskId(taskId);
    }

    const findMatchedGerecht = (taskText: string): MatchedGerecht | null => {
        const lower = taskText.toLowerCase();
        return gerechten.find(g => lower.includes(g.naam.toLowerCase())) ?? null;
    };

    const grouped = useMemo(() => {
        const map: Record<number, PrepTask[]> = {};
        tasks.forEach(t => {
            if (!map[t.dagen]) map[t.dagen] = [];
            map[t.dagen].push(t);
        });
        return map;
    }, [tasks]);

    const totalCount = tasks.length;
    const doneCount = tasks.filter(t => t.done).length;
    const progress = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);
    const selectedTask = tasks.find(t => t.id === selectedTaskId) ?? null;
    /* Volgende open taak (na de huidige selectie) — voor "Volgende taak" hint */
    const nextOpenTask = useMemo(() => {
        if (!selectedTask) return tasks.find(t => !t.done) ?? null;
        const idx = tasks.findIndex(t => t.id === selectedTask.id);
        for (let i = idx + 1; i < tasks.length; i++) {
            if (!tasks[i].done) return tasks[i];
        }
        for (let i = 0; i < idx; i++) {
            if (!tasks[i].done) return tasks[i];
        }
        return null;
    }, [tasks, selectedTask]);

    if (loading) {
        return (
            <div className="main-content">
                <PageHeader title="Prep Counter" description="Voorbereiding van het eerstvolgende event" />
                <LoadingState />
            </div>
        );
    }

    if (!event) {
        return (
            <div className="main-content">
                <PageHeader title="Prep Counter" description="Voorbereiding van het eerstvolgende event" />
                <EmptyState page="/prep-counter" />
                <div className="smoke-card" style={{ padding: SP.xxl, textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: SP.xs }}>📭</div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Geen aankomend event gevonden</div>
                    <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: SP.md }}>
                        Maak een offerte op /offertes en koppel die aan een datum. Bij acceptatie worden prep-taken automatisch aangemaakt.
                    </div>
                    <a href="/offertes" className="btn btn-brand btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <ChevronRight size={14} /> Naar offertes
                    </a>
                </div>
            </div>
        );
    }

    const eventDate = new Date(event.date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntil = Math.round((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const currentStage = daysUntil >= 3 ? -3 : daysUntil >= 2 ? -2 : daysUntil >= 1 ? -1 : 0;

    /* Datum per stage berekenen — D-3 = eventDate - 3, etc. */
    const stageDate = (offset: number): string => {
        const d = new Date(eventDate);
        d.setDate(d.getDate() + offset);
        return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
    };

    return (
        <div className="main-content" style={{ maxWidth: 'none' }}>
            <PageHeader
                title="Prep Counter"
                description={`${event.name} · ${eventDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })} · ${event.guests ?? '—'} gasten`}
                actions={
                    <button className="btn btn-ghost btn-sm" onClick={loadActiveEvent} title="Vernieuw vanuit DB" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <RefreshCw size={14} /> Vernieuwen
                    </button>
                }
            />

            {/* Timeline-strip — Pillar 3 (tijd-as als ankerstructuur) */}
            <div className="smoke-card" style={{ padding: `${SP.lg}px ${SP.xl}px`, marginBottom: SP.md }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: SP.md }}>
                    <div>
                        <div style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--muted)' }}>
                            Voortgang
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 300, letterSpacing: '-.02em', marginTop: 2 }}>
                            {doneCount} <span style={{ color: 'var(--muted)' }}>van {totalCount} taken</span>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--muted)' }}>Tot event</div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, color: 'var(--brand)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                            {daysUntil === 0 ? 'Vandaag' : daysUntil === 1 ? 'Morgen' : daysUntil + ' dagen'}
                        </div>
                    </div>
                </div>

                {/* Timeline-dots: 4 stages connected door progress-lijn */}
                <div style={{ position: 'relative', marginBottom: SP.md, paddingTop: SP.xs }}>
                    {/* connector-line achter de dots */}
                    <div style={{ position: 'absolute', top: 'calc(50% - 2px)', left: '12.5%', right: '12.5%', height: 2, background: 'rgba(255,255,255,.08)', zIndex: 0 }} />
                    {/* progress-line voor — vol op basis van currentStage */}
                    <div style={{
                        position: 'absolute', top: 'calc(50% - 2px)',
                        left: '12.5%',
                        width: `${(KNOWN_DAYS.indexOf(currentStage) / (KNOWN_DAYS.length - 1)) * 75}%`,
                        height: 2,
                        background: 'linear-gradient(90deg, #a78bfa, #f59e0b, #FFBF00, var(--red))',
                        zIndex: 0, transition: 'width .4s',
                    }} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', position: 'relative', zIndex: 1 }}>
                        {KNOWN_DAYS.map(d => {
                            const meta = DAY_LABELS[d];
                            const items = grouped[d] || [];
                            const itemDone = items.filter(t => t.done).length;
                            const isActive = d === currentStage;
                            const isPast = KNOWN_DAYS.indexOf(d) < KNOWN_DAYS.indexOf(currentStage);
                            const allDone = items.length > 0 && itemDone === items.length;
                            return (
                                <div key={d} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                    <div style={{
                                        width: isActive ? 32 : 24, height: isActive ? 32 : 24, borderRadius: RADIUS.xl,
                                        background: allDone ? '#22c55e' : isActive ? meta.color : isPast ? `${meta.color}66` : 'var(--card-solid)',
                                        border: isActive ? `2px solid ${meta.color}` : `1px solid ${meta.color}66`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: isActive ? `0 0 0 4px ${meta.color}22, 0 0 16px ${meta.color}66` : 'none',
                                        transition: 'all .3s', color: 'white',
                                    }}>
                                        {allDone ? <Check size={14} /> : <span style={{ fontSize: 10, fontWeight: 800, color: isActive || isPast ? 'white' : meta.color }}>{meta.korte.replace('D', '')}</span>}
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: isActive ? meta.color : 'var(--text)' }}>{meta.korte}</div>
                                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{stageDate(d)}</div>
                                        <div style={{ fontSize: 10, color: items.length > 0 && itemDone === items.length ? '#22c55e' : 'var(--muted)', fontWeight: 600, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                                            {itemDone}/{items.length}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Global progress bar */}
                <div style={{ height: 6, background: 'var(--color-bg-deep)', borderRadius: RADIUS.sm, overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', width: `${progress}%`,
                        background: progress >= 100 ? '#22c55e' : 'linear-gradient(90deg, var(--brand), #FFBF00)',
                        transition: 'width .4s',
                        boxShadow: progress < 100 && progress > 0 ? '0 0 12px rgba(255,191,0,.5)' : 'none',
                    }} />
                </div>
            </div>

            {totalCount === 0 ? (
                <div className="smoke-card" style={{ padding: SP.xxl, textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: SP.xs }}>📋</div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Nog geen prep-taken voor dit event</div>
                    <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: SP.md }}>
                        Prep-taken worden automatisch aangemaakt bij offerte-acceptatie.
                    </div>
                    <a href={`/events/${event.id}/hub`} className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <ChevronRight size={14} /> Open event-hub
                    </a>
                </div>
            ) : (
                <div className="prep-master-detail">
                    {/* MASTER */}
                    <div className="prep-master">
                        {KNOWN_DAYS.map(dayOffset => {
                            const items = grouped[dayOffset] || [];
                            if (items.length === 0) return null;
                            const meta = DAY_LABELS[dayOffset];
                            const dayDoneCount = items.filter(i => i.done).length;
                            const isCurrentStage = dayOffset === currentStage;
                            return (
                                <StageGroup
                                    key={dayOffset}
                                    titel={meta.titel}
                                    subtitel={meta.subtitel}
                                    Icon={meta.icon}
                                    color={meta.color}
                                    tasks={items}
                                    doneCount={dayDoneCount}
                                    isCurrentStage={isCurrentStage}
                                    selectedTaskId={selectedTaskId}
                                    justCompletedId={justCompletedId}
                                    onSelectTask={selectTask}
                                    onToggle={toggleTask}
                                    findMatchedGerecht={findMatchedGerecht}
                                />
                            );
                        })}
                        {Object.keys(grouped).map(Number).filter(d => !KNOWN_DAYS.includes(d)).map(d => {
                            const items = grouped[d] || [];
                            const dayDoneCount = items.filter(i => i.done).length;
                            return (
                                <StageGroup
                                    key={d}
                                    titel={`Dag ${d > 0 ? '+' : ''}${d}`}
                                    subtitel="Aanvullende taken"
                                    Icon={Clock}
                                    color="#94a3b8"
                                    tasks={items}
                                    doneCount={dayDoneCount}
                                    isCurrentStage={false}
                                    selectedTaskId={selectedTaskId}
                                    justCompletedId={justCompletedId}
                                    onSelectTask={selectTask}
                                    onToggle={toggleTask}
                                    findMatchedGerecht={findMatchedGerecht}
                                />
                            );
                        })}
                    </div>

                    {/* DETAIL */}
                    <div className={'prep-detail' + (selectedTask ? ' prep-detail--open' : '')}>
                        {selectedTask ? (
                            <TaskDetail
                                task={selectedTask}
                                event={event}
                                matchedGerecht={findMatchedGerecht(selectedTask.text)}
                                stageMeta={DAY_LABELS[selectedTask.dagen] ?? { titel: `Dag ${selectedTask.dagen}`, korte: `D${selectedTask.dagen}`, subtitel: '', icon: Clock, color: '#94a3b8', tip: 'Aanvullende taak.' }}
                                nextTask={nextOpenTask}
                                onToggle={toggleTask}
                                onSelectNext={selectTask}
                                onClose={() => selectTask(null)}
                            />
                        ) : (
                            <DetailPlaceholder doneCount={doneCount} totalCount={totalCount} nextTask={nextOpenTask} onSelect={selectTask} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function StageGroup({
    titel, subtitel, Icon, color, tasks, doneCount, isCurrentStage,
    selectedTaskId, justCompletedId, onSelectTask, onToggle, findMatchedGerecht,
}: {
    titel: string; subtitel: string; Icon: any; color: string;
    tasks: PrepTask[]; doneCount: number; isCurrentStage: boolean;
    selectedTaskId: number | null;
    justCompletedId: number | null;
    onSelectTask: (id: number) => void;
    onToggle: (t: PrepTask) => void;
    findMatchedGerecht: (text: string) => MatchedGerecht | null;
}) {
    const allDone = doneCount === tasks.length && tasks.length > 0;
    return (
        <div className="smoke-card" style={{
            overflow: 'hidden',
            border: isCurrentStage ? `1px solid ${color}66` : undefined,
            boxShadow: isCurrentStage ? `0 0 0 1px ${color}33, var(--shadow-card)` : 'var(--shadow-card)',
        }}>
            <div style={{
                padding: `${SP.sm}px ${SP.md}px`,
                borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: SP.sm,
                background: 'var(--card-solid)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: SP.sm }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: RADIUS.md,
                        background: `${color}1f`, color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Icon size={16} />
                    </div>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Outfit, sans-serif', letterSpacing: '-.005em' }}>
                            {titel}
                            {isCurrentStage && (
                                <span style={{
                                    fontSize: 9, padding: '2px 6px', borderRadius: RADIUS.sm,
                                    background: color, color: 'white', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase',
                                    boxShadow: `0 0 12px ${color}88`,
                                }}>Nu</span>
                            )}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, letterSpacing: '.05em', textTransform: 'uppercase', fontWeight: 600 }}>{subtitel}</div>
                    </div>
                </div>
                <div style={{ fontSize: 11, color: allDone ? '#22c55e' : 'var(--muted)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {doneCount} / {tasks.length}
                </div>
            </div>
            <div>
                {tasks.map(task => {
                    const isSelected = task.id === selectedTaskId;
                    const isJustDone = task.id === justCompletedId;
                    const matched = findMatchedGerecht(task.text);
                    return (
                        <div
                            key={task.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onSelectTask(task.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectTask(task.id); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: SP.sm,
                                padding: `${SP.md}px ${SP.md}px`,
                                borderTop: '1px solid rgba(130,130,130,.08)',
                                cursor: 'pointer',
                                background: isJustDone ? `${color}22` : isSelected ? `${color}14` : 'transparent',
                                borderLeft: isSelected ? `3px solid ${color}` : '3px solid transparent',
                                minHeight: 56,
                                transition: 'background .25s, border-color .15s',
                            }}
                        >
                            <button
                                onClick={(e) => { e.stopPropagation(); onToggle(task); }}
                                className="no-glow touch-manipulation"
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 }}
                                aria-label={task.done ? 'Markeer ongedaan' : 'Markeer klaar'}
                                aria-pressed={task.done}
                            >
                                {task.done
                                    ? <Check size={22} style={{ color: '#22c55e' }} />
                                    : <Circle size={22} style={{ color: 'var(--muted)' }} />}
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: 13,
                                    fontWeight: task.done ? 400 : 600,
                                    color: task.done ? 'var(--muted)' : 'var(--text)',
                                    textDecoration: task.done ? 'line-through' : 'none',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {task.text}
                                </div>
                                {matched && (
                                    <div style={{ fontSize: 10, color: color, marginTop: 3, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Sparkles size={9} /> Receptuur: {matched.naam}
                                    </div>
                                )}
                            </div>
                            <ChevronRight size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function TaskDetail({
    task, event, matchedGerecht, stageMeta, nextTask, onToggle, onSelectNext, onClose,
}: {
    task: PrepTask; event: ActiveEvent; matchedGerecht: MatchedGerecht | null;
    stageMeta: typeof DAY_LABELS[number];
    nextTask: PrepTask | null;
    onToggle: (t: PrepTask) => void;
    onSelectNext: (id: number) => void;
    onClose: () => void;
}) {
    const Icon = stageMeta.icon;
    const guests = event.guests ?? 0;

    return (
        <div className="smoke-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Header — compact */}
            <div style={{ padding: `${SP.md}px ${SP.lg}px`, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm, marginBottom: SP.sm }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: SP.xs }}>
                        <div style={{ width: 28, height: 28, borderRadius: RADIUS.md, background: `${stageMeta.color}1f`, color: stageMeta.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon size={14} />
                        </div>
                        <span style={{ fontSize: 11, color: stageMeta.color, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>{stageMeta.titel}</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="no-glow prep-detail-close touch-manipulation"
                        aria-label="Sluit detail en ga terug naar lijst"
                        style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: RADIUS.md, padding: 6, cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, minWidth: 44, justifyContent: 'center' }}
                    >
                        <X size={16} />
                        <span className="prep-detail-close-label">Terug</span>
                    </button>
                </div>
                <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 300, margin: 0, lineHeight: 1.25, color: 'var(--text)', letterSpacing: '-.02em' }}>
                    {task.text}
                </h2>
                {task.done && (
                    <div style={{ marginTop: SP.sm, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: RADIUS.sm, background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.3)', color: '#22c55e', fontSize: 11, fontWeight: 700 }}>
                        <Check size={12} /> AFGEROND
                    </div>
                )}
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: `${SP.lg}px ${SP.lg}px`, display: 'flex', flexDirection: 'column', gap: SP.xl }}>
                {/* Stage tip — altijd zichtbaar */}
                <div style={{ padding: SP.md, borderRadius: RADIUS.lg, background: `${stageMeta.color}10`, border: `1px solid ${stageMeta.color}30` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: stageMeta.color, letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: 6 }}>
                        Wat hoort bij deze fase
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text)' }}>{stageMeta.tip}</div>
                </div>

                {/* Recept-block als matched */}
                {matchedGerecht ? (
                    <RecipeBlock gerecht={matchedGerecht} guests={guests} />
                ) : (
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: SP.xs }}>
                            Vrije taak
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--muted-light)', lineHeight: 1.55 }}>
                            Geen specifiek gerecht aan deze taak gekoppeld. Werk 'm op je eigen manier af en tik 'm aan via de knop hieronder zodra klaar.
                        </div>
                    </div>
                )}
            </div>

            {/* Sticky footer — primary action + volgende taak */}
            <div style={{ borderTop: '1px solid var(--border)', background: 'var(--card-solid)' }}>
                <button
                    onClick={() => onToggle(task)}
                    className="no-glow"
                    style={{
                        width: '100%', padding: `${SP.md}px ${SP.lg}px`, border: 'none', cursor: 'pointer',
                        background: task.done
                            ? 'linear-gradient(180deg, rgba(34,197,94,.18), rgba(34,197,94,.08))'
                            : 'linear-gradient(180deg, var(--brand), #e6a800)',
                        color: task.done ? '#22c55e' : '#1a1408',
                        fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SP.xs,
                        minHeight: 52, letterSpacing: '.02em',
                        transition: 'transform .15s, box-shadow .15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                    <Check size={18} />
                    {task.done ? 'Klaar — opnieuw openen' : 'Markeer klaar'}
                </button>
                {nextTask && nextTask.id !== task.id && (
                    <button
                        onClick={() => onSelectNext(nextTask.id)}
                        className="no-glow"
                        style={{
                            width: '100%', padding: `${SP.sm}px ${SP.lg}px`, border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer',
                            background: 'transparent', color: 'var(--muted)',
                            fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SP.xs,
                            transition: 'background .15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.03)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)' }}>Volgende</span>
                            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{nextTask.text}</span>
                        </span>
                        <ChevronRight size={14} />
                    </button>
                )}
            </div>
        </div>
    );
}

function RecipeBlock({ gerecht, guests }: { gerecht: MatchedGerecht; guests: number }) {
    const ingredients = (gerecht.ingredient_costs ?? []).map(ing => {
        const yieldFactor = ing.yield && ing.yield > 0 ? ing.yield : 1;
        const total = (ing.qty_pp * guests) / yieldFactor;
        return { ...ing, total };
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.md }}>
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP.xs }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.15em', fontWeight: 700 }}>Gekoppeld gerecht</div>
                    {gerecht.categorie && (
                        <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: RADIUS.sm, background: 'var(--brand-tint-subtle)', color: 'var(--brand)', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>{gerecht.categorie}</span>
                    )}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', fontFamily: 'Outfit, sans-serif' }}>
                    {gerecht.naam}
                </div>
                {gerecht.beschrijving && (
                    <div style={{ fontSize: 12, color: 'var(--muted-light)', marginTop: 6, lineHeight: 1.55 }}>{gerecht.beschrijving}</div>
                )}
            </div>

            {ingredients.length > 0 && (
                <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.15em', fontWeight: 700, marginBottom: SP.xs, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span>Ingrediënten</span>
                        <span style={{ color: 'var(--brand)' }}>voor {guests} gasten</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {ingredients.map((ing, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: SP.sm, padding: `${SP.xs}px ${SP.sm}px`, borderRadius: RADIUS.md, background: 'rgba(255,255,255,.025)', border: '1px solid var(--border)' }}>
                                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ing.naam}</span>
                                <span style={{ fontSize: 13, color: 'var(--brand)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                    {ing.total.toFixed(ing.total >= 10 ? 0 : 2)} {ing.unit}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: SP.xs, fontStyle: 'italic' }}>
                        Hoeveelheden geschaald op {guests} gasten · uit ingredient-library
                    </div>
                </div>
            )}

            {ingredients.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted-light)', fontStyle: 'italic' }}>
                    Geen ingrediënten in de gerecht-library. Voeg ze toe op /gerechten om automatisch geschaalde lijsten te krijgen.
                </div>
            )}
        </div>
    );
}

function DetailPlaceholder({ doneCount, totalCount, nextTask, onSelect }: { doneCount: number; totalCount: number; nextTask: PrepTask | null; onSelect: (id: number) => void }) {
    return (
        <div className="smoke-card" style={{ padding: SP.xxl, textAlign: 'center', minHeight: 480, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: SP.md }}>
            <div style={{ width: 56, height: 56, borderRadius: RADIUS.xl, background: 'var(--brand-tint-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)' }}>
                <ArrowLeft size={24} />
            </div>
            <div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, color: 'var(--text)', marginBottom: 4, letterSpacing: '-.01em' }}>Kies een taak links</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 320, lineHeight: 1.5 }}>
                    Klik op een taak om receptuur, ingrediënten en stage-context te zien.
                </div>
            </div>
            {nextTask && (
                <button
                    onClick={() => onSelect(nextTask.id)}
                    className="no-glow"
                    style={{
                        marginTop: SP.sm, padding: `${SP.sm}px ${SP.lg}px`, border: '1px solid var(--brand)',
                        borderRadius: RADIUS.md, background: 'var(--brand-tint-subtle)', color: 'var(--brand)',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
                    }}
                >
                    <Sparkles size={14} /> Start met de volgende open taak
                </button>
            )}
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: SP.sm }}>
                <span style={{ color: 'var(--brand)', fontWeight: 700 }}>{doneCount}/{totalCount}</span> taken klaar
            </div>
        </div>
    );
}
