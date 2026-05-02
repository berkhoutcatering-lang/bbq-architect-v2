/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { Calendar, Users, Check, Circle, ChevronRight, RefreshCw } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   PREP COUNTER — data-driven, gekoppeld aan actief event

   Was: 939 regels hardcoded mockdata ("Bruiloft Van Dijk" met 18 vaste
   stappen). Nu: leest het eerstvolgende event en toont z'n prep_tasks
   gegroepeerd per dagen-offset (D-3 / D-2 / D-1 / D-0). Tasks worden
   gegenereerd door acceptance-workflow.ts vanuit offerte.menu_selectie
   × gerechten.target_prep_time. Klik op een task om done/ongedaan te
   togglen — direct DB-update zodat meerdere chefs dezelfde lijst zien.
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

const DAY_LABELS: Record<number, { titel: string; subtitel: string; emoji: string; color: string }> = {
    [-3]: { titel: 'D-3 · Bestellen & checken', subtitel: 'Drie dagen vooraf', emoji: '🛒', color: '#a78bfa' },
    [-2]: { titel: 'D-2 · Marineren & rubben', subtitel: 'Twee dagen vooraf', emoji: '🌶️', color: '#f59e0b' },
    [-1]: { titel: 'D-1 · Mise-en-place', subtitel: 'Dag voor het event', emoji: '🔥', color: '#FFBF00' },
    [0]: { titel: 'D-0 · Event-dag', subtitel: 'Event-dag zelf', emoji: '🎯', color: '#ef4444' },
};

const KNOWN_DAYS = [-3, -2, -1, 0];

export default function PrepCounter() {
    const showToast = useToast();
    const [event, setEvent] = useState<ActiveEvent | null>(null);
    const [tasks, setTasks] = useState<PrepTask[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadActiveEvent(); }, []);

    async function loadActiveEvent() {
        setLoading(true);
        try {
            /* Eerstvolgende event vanaf vandaag (incl. vandaag), niet gecanceld.
               Sorteren op datum oplopend zodat we de eerstvolgende krijgen. */
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
            if (!ev) { setTasks([]); return; }

            const { data: t } = await supabase
                .from('prep_tasks')
                .select('id, event_id, text, dagen, done')
                .eq('event_id', ev.id)
                .order('dagen', { ascending: true })
                .order('id', { ascending: true });
            setTasks(t || []);
        } finally {
            setLoading(false);
        }
    }

    async function toggleTask(task: PrepTask) {
        const next = !task.done;
        /* Optimistic update — UI direct, DB volgt. */
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: next } : t));
        const { error } = await supabase.from('prep_tasks').update({ done: next }).eq('id', task.id);
        if (error) {
            /* Revert + toast bij fout. */
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: !next } : t));
            showToast('Fout bij opslaan: ' + error.message, 'error');
        }
    }

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
                <div style={{ padding: 40, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 12, background: 'var(--card)' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Geen aankomend event gevonden</div>
                    <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
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

    return (
        <div className="main-content">
            <PageHeader
                title="Prep Counter"
                description={`${event.name} · ${eventDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}`}
                actions={
                    <button className="btn btn-ghost btn-sm" onClick={loadActiveEvent} title="Vernieuw vanuit DB" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <RefreshCw size={14} /> Vernieuwen
                    </button>
                }
            />

            {/* Hero met event-info + voortgang */}
            <div style={{ padding: 20, borderRadius: 16, background: 'var(--card)', border: '1px solid var(--border)', marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
                <Stat icon={<Calendar size={14} />} label="Tot event" value={daysUntil === 0 ? 'Vandaag' : daysUntil === 1 ? 'Morgen' : `Over ${daysUntil} dagen`} />
                <Stat icon={<Users size={14} />} label="Gasten" value={event.guests != null ? String(event.guests) : '—'} />
                <Stat icon={<Check size={14} />} label="Voortgang" value={`${doneCount} / ${totalCount}`} highlight={progress >= 100} />
                <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                    <div style={{ height: 8, background: 'var(--color-bg-deep)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${progress}%`, background: progress >= 100 ? '#22c55e' : '#FFBF00', transition: 'width .3s' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, textAlign: 'right' }}>{progress}% klaar</div>
                </div>
            </div>

            {/* Tasks gegroepeerd per dagen-offset */}
            {totalCount === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 12, background: 'var(--card)' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Nog geen prep-taken voor dit event</div>
                    <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
                        Prep-taken worden automatisch aangemaakt bij offerte-acceptatie. Heb je deze offerte handmatig in een event omgezet? Open de offerte en accepteer 'm via /q/[token].
                    </div>
                    <a href={`/events/${event.id}/hub`} className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <ChevronRight size={14} /> Open event-hub
                    </a>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {KNOWN_DAYS.map(dayOffset => {
                        const items = grouped[dayOffset] || [];
                        if (items.length === 0) return null;
                        const meta = DAY_LABELS[dayOffset];
                        const dayDoneCount = items.filter(i => i.done).length;
                        return (
                            <DayGroup
                                key={dayOffset}
                                titel={meta.titel}
                                subtitel={meta.subtitel}
                                emoji={meta.emoji}
                                color={meta.color}
                                tasks={items}
                                doneCount={dayDoneCount}
                                onToggle={toggleTask}
                            />
                        );
                    })}
                    {/* Onbekende dagen-offsets (legacy of custom) */}
                    {Object.keys(grouped)
                        .map(Number)
                        .filter(d => !KNOWN_DAYS.includes(d))
                        .map(d => {
                            const items = grouped[d] || [];
                            const dayDoneCount = items.filter(i => i.done).length;
                            return (
                                <DayGroup
                                    key={d}
                                    titel={`Dag ${d > 0 ? '+' : ''}${d}`}
                                    subtitel="Aanvullende taken"
                                    emoji="📌"
                                    color="#94a3b8"
                                    tasks={items}
                                    doneCount={dayDoneCount}
                                    onToggle={toggleTask}
                                />
                            );
                        })}
                </div>
            )}
        </div>
    );
}

function Stat({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
    return (
        <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                {icon} {label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: highlight ? '#22c55e' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        </div>
    );
}

function DayGroup({ titel, subtitel, emoji, color, tasks, doneCount, onToggle }: {
    titel: string;
    subtitel: string;
    emoji: string;
    color: string;
    tasks: PrepTask[];
    doneCount: number;
    onToggle: (t: PrepTask) => void;
}) {
    return (
        <div style={{ borderRadius: 14, background: 'var(--card)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}1f`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                        {emoji}
                    </div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{titel}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{subtitel}</div>
                    </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {doneCount} / {tasks.length}
                </div>
            </div>
            <div>
                {tasks.map(task => (
                    <button
                        key={task.id}
                        onClick={() => onToggle(task)}
                        style={{
                            width: '100%',
                            padding: '12px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            background: 'transparent',
                            border: 'none',
                            borderTop: '1px solid rgba(130,130,130,.08)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            color: task.done ? 'var(--muted)' : 'var(--text)',
                            textDecoration: task.done ? 'line-through' : 'none',
                            fontSize: 13,
                            fontWeight: task.done ? 400 : 500,
                            minHeight: 48, /* tablet-friendly tap target */
                        }}
                    >
                        {task.done
                            ? <Check size={18} style={{ color: '#22c55e', flexShrink: 0 }} />
                            : <Circle size={18} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
                        <span style={{ flex: 1 }}>{task.text}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
