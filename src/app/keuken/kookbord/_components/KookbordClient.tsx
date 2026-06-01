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
    PrepTask, KitchenStation, DbEvent, Personeel, Gerecht,
} from '@/types/database.types';
import type { Allergen } from '@/lib/allergenDetect';

import PrepKdsTopStrip from '../../board/_components/PrepKdsTopStrip';
import PrepBoardFilters, { type DateFilter } from '../../board/_components/PrepBoardFilters';
import PrepBoardWeekRail from '../../board/_components/PrepBoardWeekRail';
import PrepBoardColumn from '../../board/_components/PrepBoardColumn';
import PrepTaskSheet, { type TaskRecipe } from '../../board/_components/PrepTaskSheet';

/**
 * KookbordClient — hoofd container voor /keuken/kookbord (PREP-modus).
 *
 * Was eerder de MEP-helft van PrepBoardClient. Service-modus is verhuisd naar
 * /events/[id]/service/plattegrond zodat prep en service mental-model split zijn:
 *   - Kookbord = dagen vooraf, multi-event, station-kolommen
 *   - Service  = tijdens event, één event, gang-flow + plattegrond
 */
export default function KookbordClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const { orgId } = useOrg();

    const isDisplayMode = searchParams.get('display') === 'true';

    const [dateFilter, setDateFilter] = useState<DateFilter>('next48h');
    const [onlyMine, setOnlyMine] = useState(false);
    const [selectedStationIds, setSelectedStationIds] = useState<number[]>([]);

    const { data: tasks } = useSupabase<PrepTask>('prep_tasks');
    const { data: stations } = useSupabase<KitchenStation>('kitchen_stations');
    const { data: events } = useSupabase<DbEvent>('events');
    /* Gerechten laden voor de receptuur-weergave in de task-sheet. Sam's KDS-
       model: klik op taak (gekoppeld via prep_tasks.gerecht_id) → zie het recept.
       bereidingswijze/ingredienten zitten niet in het Gerecht-type maar bestaan
       wel runtime — cast bij gebruik. */
    const { data: gerechten } = useSupabase<Gerecht>('gerechten');

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

    /* Component-koppeling → kookbord. Sam's "5 componenten = 1 gerecht": een
       gerecht bestaat uit componenten (bv. zalmfilet + wasabi-mayo + gyoza-vel),
       elk met eigen preparation_steps. We laden de gerecht_components-join
       (org-scoped via RLS) en bouwen een Map<gerecht_id, component[]> zodat de
       PrepTaskSheet de sub-secties kan tonen. gerecht_components heeft geen
       id-kolom (composite PK) → niet via useSupabase, dus directe query. */
    const [componentsByGerecht, setComponentsByGerecht] = useState<
        Map<string, { name: string; steps?: string[] }[]>
    >(new Map());
    useEffect(() => {
        if (!supabase || !orgId) return;
        let cancelled = false;
        async function load() {
            if (!supabase) return;
            const { data, error } = await supabase
                .from('gerecht_components')
                .select('gerecht_id, components(name, preparation_steps)')
                .eq('organization_id', orgId);
            if (cancelled || error || !data) return;
            interface JoinRow {
                gerecht_id: string;
                components: { name: string; preparation_steps?: unknown } | null;
            }
            const map = new Map<string, { name: string; steps?: string[] }[]>();
            for (const row of data as unknown as JoinRow[]) {
                const comp = row.components;
                if (!comp) continue;
                const steps = Array.isArray(comp.preparation_steps)
                    ? comp.preparation_steps.filter((s): s is string => typeof s === 'string')
                    : undefined;
                const key = String(row.gerecht_id);
                const arr = map.get(key) ?? [];
                arr.push({ name: comp.name, steps: steps && steps.length ? steps : undefined });
                map.set(key, arr);
            }
            if (!cancelled) setComponentsByGerecht(map);
        }
        load();
        return () => { cancelled = true; };
    }, [orgId]);

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

    const eventsLite = useMemo(() => {
        const m = new Map<number, { id: number; name: string; date: string }>();
        for (const e of events) m.set(e.id, { id: e.id, name: e.name, date: e.date });
        return m;
    }, [events]);

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

    /* Receptuur voor de geopende taak — gekoppeld via prep_tasks.gerecht_id.
       Toont bereiding-stappen + ingrediënten in de sheet (Sam's KDS-wens:
       klik taak → zie hoe je het maakt). Geschaald aantal gasten komt uit het
       gekoppelde event. Best-effort: geen gerecht_id of geen match → null. */
    const sheetRecipe: TaskRecipe | null = useMemo(() => {
        if (!sheetTask) return null;
        const gerechtId = (sheetTask as PrepTask & { gerecht_id?: string }).gerecht_id;
        if (!gerechtId) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g: any = gerechten.find((x) => String(x.id) === String(gerechtId));
        if (!g) return null;
        // bereidingswijze is een TEXT-blob met stappen per regel ("1. ..." / "- ...")
        const steps: string[] = (g.bereidingswijze || '')
            .split('\n')
            .map((s: string) => s.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
            .filter(Boolean);
        // ingredienten kan string[] zijn (oude shape) of object[] ({naam, hoeveelheid, eenheid}).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawIngr: any[] = Array.isArray(g.ingredienten) ? g.ingredienten : [];
        const ingredienten: string[] = rawIngr
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((i: any) => {
                if (typeof i === 'string') return i;
                if (i && typeof i === 'object' && i.naam) {
                    const qty = i.hoeveelheid ?? i.qty_pp ?? '';
                    const unit = i.eenheid ?? i.unit ?? '';
                    return `${i.naam}${qty ? ' ' + qty : ''}${unit}`.trim();
                }
                return '';
            })
            .filter(Boolean);
        const scaledGuests = eventsById.get(sheetTask.event_id)?.guests ?? undefined;
        const components = componentsByGerecht.get(String(gerechtId));
        if (steps.length === 0 && ingredienten.length === 0 && !(components && components.length)) return null;
        return { naam: g.naam, steps, ingredienten, components, scaledGuests };
    }, [sheetTask, gerechten, eventsById, componentsByGerecht]);

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
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

            if ((e.metaKey || e.ctrlKey) && (e.key === 'j' || e.key === 'k')) {
                e.preventDefault();
                window.dispatchEvent(new Event('open-chat'));
                return;
            }
            if (e.key === 'm' || e.key === 'M') {
                e.preventDefault();
                setOnlyMine((v) => !v);
                return;
            }
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
                modus="mep"
                onModusChange={() => { /* no-op — Service is verhuisd naar event-page */ }}
                hideModusToggle
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

            <PrepBoardWeekRail tasks={visibleTasks} eventsById={eventsLite} />

            <div className="prep-board" role="region" aria-label="Kookbord">
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
                recipe={sheetRecipe}
                onStart={handleSheetStart}
                onComplete={handleSheetComplete}
                onSkip={handleSheetSkip}
                onSnooze={handleSheetSnooze}
                onReassign={handleSheetReassign}
            />

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
