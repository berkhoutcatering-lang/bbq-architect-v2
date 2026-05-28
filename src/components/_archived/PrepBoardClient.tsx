'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { useSupabase } from '@/lib/useSupabase';
import { useAuth } from '@/lib/AuthContext';
import { useOrg } from '@/lib/OrgContext';
import { useToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import type {
    PrepTask, KitchenStation, DbEvent, Personeel,
} from '@/types/database.types';
import type { Allergen } from '@/lib/allergenDetect';

import PrepKdsTopStrip from './PrepKdsTopStrip';
import PrepBoardFilters, { type DateFilter } from './PrepBoardFilters';
import PrepBoardWeekRail from './PrepBoardWeekRail';
import PrepBoardColumn from './PrepBoardColumn';
import PrepTaskSheet from './PrepTaskSheet';
import FloorPlanView from './floor-plan/FloorPlanView';

/**
 * PrepBoardClient — hoofd container voor /keuken/board.
 *
 * State:
 *   - modus: 'mep' | 'service' (URL ?modus=mep|service)
 *   - dateFilter, onlyMine, selectedStationIds (filter-pillbar)
 *   - tasks, stations, events, personeel (uit Supabase via useSupabase realtime)
 *
 * Server Actions (api/prep/*) worden via fetch() aangeroepen voor mutaties.
 */
export default function PrepBoardClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const { orgId } = useOrg();

    // ?modus en ?display=true uit URL lezen
    const urlModus = (searchParams.get('modus') as 'mep' | 'service' | null);
    const [modus, setModus] = useState<'mep' | 'service'>(urlModus ?? 'mep');
    const isDisplayMode = searchParams.get('display') === 'true';

    // Filter state
    const [dateFilter, setDateFilter] = useState<DateFilter>('next48h');
    const [onlyMine, setOnlyMine] = useState(false);
    const [selectedStationIds, setSelectedStationIds] = useState<number[]>([]);

    // Data
    const { data: tasks } = useSupabase<PrepTask>('prep_tasks');
    const { data: stations } = useSupabase<KitchenStation>('kitchen_stations');
    const { data: events } = useSupabase<DbEvent>('events');

    // Personeel heeft UUID-id (niet number) — directe fetch i.p.v. useSupabase
    const [personeel, setPersoneel] = useState<Personeel[]>([]);
    useEffect(() => {
        if (!supabase || !orgId) return;
        let cancelled = false;
        async function load() {
            if (!supabase) return;
            const { data, error } = await supabase
                .from('personeel')
                .select('id, organization_id, user_id, naam, email, telefoon, functie, uurtarief, contract_type, actief, notitie, created_at')
                .eq('organization_id', orgId)
                .eq('actief', true);
            if (cancelled || error || !data) return;
            setPersoneel(data as Personeel[]);
        }
        load();
        return () => { cancelled = true; };
    }, [orgId]);

    // Per-event allergeen-info (event_allergies tabel)
    // Beperken tot zichtbare events om payload klein te houden.
    const [eventAllergens, setEventAllergens] = useState<
        Map<number, { allergens: Allergen[]; severity: 'normal' | 'high' | 'critical' }>
    >(new Map());

    useEffect(() => {
        if (!supabase || !orgId) return;
        let cancelled = false;
        async function load() {
            if (!supabase) return;
            const { data, error } = await supabase
                .from('event_allergies')
                .select('event_id, allergens, severity')
                .eq('organization_id', orgId);
            if (cancelled || error || !data) return;
            const map = new Map<number, { allergens: Allergen[]; severity: 'normal' | 'high' | 'critical' }>();
            interface EventAllergyRow {
                event_id: number;
                allergens?: string[] | null;
                severity?: 'normal' | 'high' | 'critical' | null;
            }
            for (const row of data as EventAllergyRow[]) {
                const existing = map.get(row.event_id);
                const allergenArr = (row.allergens || []) as Allergen[];
                const sev = (row.severity || 'normal') as 'normal' | 'high' | 'critical';
                if (!existing) {
                    map.set(row.event_id, { allergens: allergenArr, severity: sev });
                } else {
                    const all = new Set([...existing.allergens, ...allergenArr]);
                    const severity = pickWorstSeverity(existing.severity, sev);
                    map.set(row.event_id, { allergens: Array.from(all), severity });
                }
            }
            if (!cancelled) setEventAllergens(map);
        }
        load();
        return () => { cancelled = true; };
    }, [orgId]);

    // Sync modus naar URL (zonder full reload)
    useEffect(() => {
        const current = searchParams.get('modus');
        if (current !== modus) {
            const params = new URLSearchParams(searchParams.toString());
            params.set('modus', modus);
            router.replace(`?${params.toString()}`, { scroll: false });
        }
    }, [modus, router, searchParams]);

    // Indexen voor snelle lookup
    const eventsById = useMemo(() => {
        const m = new Map<number, DbEvent>();
        for (const e of events) m.set(e.id, e);
        return m;
    }, [events]);

    const personeelById = useMemo(() => {
        const m = new Map<string, Personeel>();
        for (const p of personeel) m.set(p.id, p);
        return m;
    }, [personeel]);

    const stationsActive = useMemo(
        () => stations.filter((s) => !s.archived).sort((a, b) => a.sort_order - b.sort_order),
        [stations],
    );

    // Filter tasks
    const visibleTasks = useMemo(() => {
        return tasks.filter((t) => {
            if (!matchesDateFilter(t, eventsById, dateFilter)) return false;
            if (onlyMine && !isCurrentUserAssignee(t, personeelById, user?.id)) return false;
            if (selectedStationIds.length > 0 && (t.station_id == null || !selectedStationIds.includes(t.station_id))) {
                return false;
            }
            return true;
        });
    }, [tasks, eventsById, dateFilter, onlyMine, selectedStationIds, personeelById, user?.id]);

    // Tasks gegroepeerd per station (incl. "Geen station")
    const tasksByStation = useMemo(() => {
        const map = new Map<number | 'none', PrepTask[]>();
        for (const t of visibleTasks) {
            const key = t.station_id ?? 'none';
            const arr = map.get(key) ?? [];
            arr.push(t);
            map.set(key, arr);
        }
        return map;
    }, [visibleTasks]);

    // Voor week-rail: lichtere event-index die alleen id+name+date heeft
    const eventsLite = useMemo(() => {
        const m = new Map<number, { id: number; name: string; date: string }>();
        for (const e of events) m.set(e.id, { id: e.id, name: e.name, date: e.date });
        return m;
    }, [events]);

    // Verrijk events met allergens-info voor de column
    const eventsForColumn = useMemo(() => {
        const m = new Map<
            number,
            { id: number; name: string; date: string; start_time?: string | null; allergens: Allergen[]; allergenSeverity: 'normal' | 'high' | 'critical' }
        >();
        for (const e of events) {
            const a = eventAllergens.get(e.id);
            m.set(e.id, {
                id: e.id,
                name: e.name,
                date: e.date,
                start_time: e.start_time ?? null,
                allergens: a?.allergens ?? [],
                allergenSeverity: a?.severity ?? 'normal',
            });
        }
        return m;
    }, [events, eventAllergens]);

    const visibleEventIds = new Set(visibleTasks.map((t) => t.event_id));

    /* ─── Sheet state ──────────────────────────────── */

    const [sheetOpen, setSheetOpen] = useState(false);
    const [sheetTaskId, setSheetTaskId] = useState<number | null>(null);
    const showToast = useToast();

    const sheetTask = useMemo(() => {
        if (sheetTaskId == null) return null;
        return tasks.find((t) => t.id === sheetTaskId) ?? null;
    }, [sheetTaskId, tasks]);

    function openSheet(task: PrepTask) {
        setSheetTaskId(task.id);
        setSheetOpen(true);
    }

    /* ─── Actions ──────────────────────────────────── */

    async function handlePrimary(task: PrepTask) {
        const status = task.status ?? 'planned';
        if (status === 'in_progress') {
            await postPrep('complete-task', { taskId: task.id });
        } else if (status === 'planned' || status === 'queued' || status === 'blocked') {
            await postPrep('start-task', { taskId: task.id });
        } else if (status === 'skipped') {
            await postPrep('start-task', { taskId: task.id });
        }
    }

    /** Swipe-rechts pad: completeert een taak als 'ie in_progress is,
     *  of start 'm anders. Toast met 3s undo. */
    const handleSwipeRight = useCallback(async (task: PrepTask) => {
        const status = task.status ?? 'planned';
        try { navigator.vibrate?.(15); } catch { /* noop */ }

        if (status === 'in_progress') {
            await postPrep('complete-task', { taskId: task.id });
            showToast({
                message: `${task.text || 'Taak'} — klaar`,
                type: 'success',
                duration: 3000,
                undo: {
                    label: 'Ongedaan',
                    onUndo: async () => {
                        // Reset naar in_progress: gebruik supabase direct (geen reset-route nodig voor undo)
                        if (!supabase) return;
                        await supabase
                            .from('prep_tasks')
                            .update({ status: 'in_progress', completed_at: null })
                            .eq('id', task.id);
                    },
                },
            });
        } else if (status === 'planned' || status === 'queued' || status === 'blocked') {
            await postPrep('start-task', { taskId: task.id });
            showToast({ message: `${task.text || 'Taak'} — gestart`, type: 'success', duration: 2000 });
        }
    }, [showToast]);

    /** Swipe-links pad: snooze 15 min. Toast met undo (terugzetten). */
    const handleSwipeLeft = useCallback(async (task: PrepTask) => {
        try { navigator.vibrate?.(15); } catch { /* noop */ }
        const previousScheduled = task.scheduled_at;
        await postPrep('snooze-task', { taskId: task.id, minutes: 15 });
        showToast({
            message: `${task.text || 'Taak'} — +15 min`,
            type: 'info',
            duration: 3000,
            undo: previousScheduled ? {
                label: 'Ongedaan',
                onUndo: async () => {
                    if (!supabase) return;
                    await supabase
                        .from('prep_tasks')
                        .update({ scheduled_at: previousScheduled })
                        .eq('id', task.id);
                },
            } : undefined,
        });
    }, [showToast]);

    async function handleSheetStart(taskId: number) {
        await postPrep('start-task', { taskId });
    }
    async function handleSheetComplete(taskId: number, actualQty?: number, notes?: string) {
        const body: Record<string, unknown> = { taskId };
        if (actualQty != null) body.actualQty = actualQty;
        if (notes) body.notes = notes;
        await postPrep('complete-task', body);
    }
    async function handleSheetSkip(taskId: number, reason: string) {
        await postPrep('skip-task', { taskId, reason });
    }
    async function handleSheetSnooze(taskId: number, minutes: number) {
        await postPrep('snooze-task', { taskId, minutes });
    }
    async function handleSheetReassign(taskId: number, newAssigneeId: string) {
        await postPrep('reassign-task', { taskId, newAssigneeId });
    }

    function handleExit() {
        if (isDisplayMode) {
            const ok = window.confirm('Apparaat ontkoppelen?');
            if (!ok) return;
        }
        router.push('/');
    }

    /* ─── Keyboard shortcuts ───────────────────────── */

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            // Skip wanneer in input/textarea/contenteditable
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

            // Cmd+J / Cmd+K → open Vraag Rook (ChatPanel listent op 'open-chat')
            if ((e.metaKey || e.ctrlKey) && (e.key === 'j' || e.key === 'k')) {
                e.preventDefault();
                window.dispatchEvent(new Event('open-chat'));
                return;
            }
            // M → toggle "Mijn taken"
            if (e.key === 'm' || e.key === 'M') {
                e.preventDefault();
                setOnlyMine((v) => !v);
                return;
            }
            // 1 → MEP, 2 → Service
            if (e.key === '1') { e.preventDefault(); setModus('mep'); return; }
            if (e.key === '2') { e.preventDefault(); setModus('service'); return; }
            // Esc → close sheet
            if (e.key === 'Escape' && sheetOpen) {
                e.preventDefault();
                setSheetOpen(false);
                return;
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [sheetOpen]);

    /* ─── Render ────────────────────────────────────── */

    return (
        <div className="kds-layout prep-layout">
            <PrepKdsTopStrip
                visibleTaskCount={visibleTasks.length}
                visibleEventCount={visibleEventIds.size}
                modus={modus}
                onModusChange={setModus}
                onExit={handleExit}
                isDisplayMode={isDisplayMode}
            />

            <PrepBoardFilters
                dateFilter={dateFilter}
                onDateFilterChange={setDateFilter}
                onlyMine={onlyMine}
                onToggleMine={() => setOnlyMine((v) => !v)}
                selectedStationIds={selectedStationIds}
                onToggleStation={(id) => {
                    setSelectedStationIds((prev) =>
                        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                    );
                }}
                stations={stationsActive}
                totalCount={tasks.length}
                visibleCount={visibleTasks.length}
            />

            {modus === 'mep' ? (
                <>
                    <PrepBoardWeekRail tasks={visibleTasks} eventsById={eventsLite} />

                    <div className="prep-board" role="region" aria-label="Prep board">
                        {stationsActive.length === 0 && (
                            <div className="prep-board__empty">
                                <p>Nog geen stations ingericht.</p>
                                <p className="prep-board__hint">Ga naar Instellingen → Keuken om stations toe te voegen.</p>
                            </div>
                        )}
                        {stationsActive.map((station) => (
                            <PrepBoardColumn
                                key={station.id}
                                station={station}
                                tasks={tasksByStation.get(station.id) ?? []}
                                eventsById={eventsForColumn}
                                personeelById={personeelById}
                                currentUserId={user?.id ?? null}
                                onTaskPrimary={handlePrimary}
                                onTaskMenu={openSheet}
                                onTaskExpand={openSheet}
                                onTaskSwipeRight={handleSwipeRight}
                                onTaskSwipeLeft={handleSwipeLeft}
                            />
                        ))}
                        {(tasksByStation.get('none')?.length ?? 0) > 0 && (
                            <PrepBoardColumn
                                key="none"
                                station={null}
                                fallbackName="Geen station"
                                tasks={tasksByStation.get('none') ?? []}
                                eventsById={eventsForColumn}
                                personeelById={personeelById}
                                currentUserId={user?.id ?? null}
                                onTaskPrimary={handlePrimary}
                                onTaskMenu={openSheet}
                                onTaskExpand={openSheet}
                                onTaskSwipeRight={handleSwipeRight}
                                onTaskSwipeLeft={handleSwipeLeft}
                            />
                        )}
                    </div>
                </>
            ) : (
                <ServiceModusBlock
                    events={events}
                    initialEventId={parseInt(searchParams.get('event') || '', 10) || null}
                    onSelectEvent={(id) => {
                        const params = new URLSearchParams(searchParams.toString());
                        if (id) params.set('event', String(id));
                        else params.delete('event');
                        router.replace(`?${params.toString()}`, { scroll: false });
                    }}
                />
            )}

            {/* Detail-sheet — geopend bij tap of long-press op kaart. */}
            <PrepTaskSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                task={sheetTask}
                station={sheetTask?.station_id ? stationsActive.find((s) => s.id === sheetTask.station_id) : undefined}
                eventLabel={sheetTask ? eventsById.get(sheetTask.event_id)?.name : undefined}
                eventDateLabel={sheetTask ? eventsById.get(sheetTask.event_id)?.date : undefined}
                eventTimeLabel={sheetTask ? eventsById.get(sheetTask.event_id)?.start_time ?? undefined : undefined}
                eventAllergens={sheetTask ? eventAllergens.get(sheetTask.event_id)?.allergens ?? [] : []}
                assigneeName={sheetTask?.assignee_id ? personeelById.get(sheetTask.assignee_id)?.naam ?? null : null}
                personeel={personeel}
                onStart={handleSheetStart}
                onComplete={handleSheetComplete}
                onSkip={handleSheetSkip}
                onSnooze={handleSheetSnooze}
                onReassign={handleSheetReassign}
            />

            {/* Vraag Rook FAB — opent bestaande ChatPanel via window-event */}
            <button
                type="button"
                className="prep-rook-fab"
                onClick={() => window.dispatchEvent(new Event('open-chat'))}
                aria-label="Vraag Rook (Cmd+K)"
                title="Vraag Rook · Cmd+K"
            >
                <Sparkles size={20} />
                <span className="prep-rook-fab__label">Vraag Rook</span>
            </button>
        </div>
    );
}

/* ─── Service-modus block met event-picker + floor-plan view ──── */

interface ServiceModusBlockProps {
    events: DbEvent[];
    initialEventId: number | null;
    onSelectEvent: (id: number | null) => void;
}

function ServiceModusBlock({ events, initialEventId, onSelectEvent }: ServiceModusBlockProps) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    // Sorteer events: upcoming eerst (binnen 30d), dan recent verleden (≤ 7d)
    const sortedEvents = useMemo(() => {
        return [...events]
            .filter((e) => e.date && e.status !== 'cancelled')
            .map((e) => {
                const d = new Date(e.date).getTime();
                return { ev: e, ms: Number.isFinite(d) ? d : 0 };
            })
            .filter(({ ms }) => ms >= todayMs - 7 * 86400_000 && ms <= todayMs + 30 * 86400_000)
            .sort((a, b) => a.ms - b.ms)
            .map(({ ev }) => ev);
    }, [events, todayMs]);

    const initialEvent = initialEventId
        ? events.find((e) => e.id === initialEventId)
        : sortedEvents.find((e) => {
            const d = new Date(e.date).getTime();
            return d >= todayMs;
        }) ?? sortedEvents[0];

    if (!initialEvent) {
        return (
            <div className="prep-board__placeholder">
                <h2>Geen events</h2>
                <p>Maak eerst een event aan in Plannen voor je een floor-plan kan tekenen.</p>
            </div>
        );
    }

    return (
        <>
            <div className="prep-service-eventbar">
                <label className="prep-service-eventbar__label">Event</label>
                <select
                    className="prep-service-eventbar__select"
                    value={initialEvent.id}
                    onChange={(e) => onSelectEvent(parseInt(e.target.value, 10))}
                >
                    {sortedEvents.map((e) => (
                        <option key={e.id} value={e.id}>
                            {e.name} · {e.date}
                            {e.guests > 0 ? ` · ${e.guests} gasten` : ''}
                        </option>
                    ))}
                </select>
            </div>
            <FloorPlanView event={initialEvent} />
        </>
    );
}

/* ─── Helpers ──────────────────────────────────── */

async function postPrep(endpoint: string, body: Record<string, unknown>): Promise<void> {
    try {
        const res = await fetch(`/api/prep/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => null) as { error?: string } | null;
            console.error(`[prep/${endpoint}] failed:`, data?.error || res.status);
        }
    } catch (e) {
        console.error(`[prep/${endpoint}] network error:`, e);
    }
}

function matchesDateFilter(
    t: PrepTask,
    eventsById: Map<number, DbEvent>,
    filter: DateFilter,
): boolean {
    const candidate = t.scheduled_at ?? (() => {
        const ev = eventsById.get(t.event_id);
        return ev?.date ?? null;
    })();
    if (!candidate) return filter === 'week';

    const t0 = startOfToday();
    const taskTime = new Date(candidate).getTime();
    if (!Number.isFinite(taskTime)) return filter === 'week';

    switch (filter) {
        case 'today':
            return taskTime >= t0 && taskTime < t0 + 86400_000;
        case 'tomorrow':
            return taskTime >= t0 + 86400_000 && taskTime < t0 + 2 * 86400_000;
        case 'next48h':
            return taskTime >= t0 && taskTime < t0 + 2 * 86400_000;
        case 'week':
            return taskTime >= t0 && taskTime < t0 + 7 * 86400_000;
    }
}

function isCurrentUserAssignee(
    t: PrepTask,
    personeelById: Map<string, Personeel>,
    userId: string | undefined,
): boolean {
    if (!userId || !t.assignee_id) return false;
    const assignee = personeelById.get(t.assignee_id);
    return assignee?.user_id === userId;
}

function startOfToday(): number {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function pickWorstSeverity(
    a: 'normal' | 'high' | 'critical',
    b: 'normal' | 'high' | 'critical',
): 'normal' | 'high' | 'critical' {
    if (a === 'critical' || b === 'critical') return 'critical';
    if (a === 'high' || b === 'high') return 'high';
    return 'normal';
}
