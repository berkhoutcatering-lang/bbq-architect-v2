/**
 * bulkScheduleEventPrep — server-side prep-task generator.
 *
 * Pure functie (Supabase-client meegeleverd) zodat zowel de
 * `/api/prep/bulk-schedule` route als `acceptance-workflow.ts` dezelfde
 * logica gebruiken. Voorkomt dat we 2× dezelfde prep-taken aanmaken
 * (de oude D-3..D-0 simpele tasks + mijn nieuwe phase-DAG).
 *
 * Werkt met:
 *  - phase-aware DAG-templates (zie recipeTemplates.ts) als event.start_time bekend is
 *  - server-derived target_qty via productionQty.ts
 *  - course_id-koppeling via gerechten.id ↔ courses.gerecht_id (migration 20260511160000)
 *  - station-routing via kitchen_stations.type ↔ recipe-step.station_type
 *
 * Hard rules (per orchestrator):
 *  - target_qty NOOIT AI-derived → komt uit calculateProductionPlan()
 *  - allergens N/A in prep_tasks
 *  - alle inserts org-scoped + tenant-aware
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateProductionPlan } from './productionQty';
import { scheduledAtForPhase } from './prepTaskScheduler';
import {
    findTemplateForDish,
    resolveOffsetMinutes,
    type RecipePhaseStep,
} from './recipeTemplates';
import type {
    PrepTaskPhase,
    GerechIngredientCost,
    KitchenStationType,
} from '@/types/database.types';

interface DishRow {
    id: string;
    naam: string;
    porties?: number | null;
    ingredient_costs?: GerechIngredientCost[] | null;
}

interface CourseRow {
    id: number;
    event_id: number;
    gerecht_id: string | null;
}

interface MenuSelectionItem {
    naam?: string;
    gerecht_naam?: string;
    gerecht_id?: string;
}

export interface BulkScheduleOptions {
    /** Force re-insert: verwijder eerst alle bestaande prep_tasks met qty_source='server_recipe' voor dit event. */
    force?: boolean;
    /** Alleen specifieke gerechten schedulen (UUID-strings). */
    onlyGerechtIds?: string[] | null;
    /** Default start-time (HH:MM:SS) als event.start_time ontbreekt — voor offerte-acceptance-flow. */
    defaultStartTime?: string;
    /** dryRun = preview zonder DB-writes. */
    dryRun?: boolean;
    /** Wie initieert (voor audit-log + last_edited fields). */
    userId?: string | null;
}

export interface BulkScheduleResult {
    ok: boolean;
    reason?:
        | 'event_not_found'
        | 'no_org_match'
        | 'no_date'
        | 'no_guests'
        | 'no_dishes'
        | 'no_gerechten_match'
        | 'db_error';
    error?: string;
    /** Hoeveel taken zouden ingevoerd zijn (dryRun) of geïnsert (echt). */
    taskCount: number;
    /** Hoeveel gerechten matched op een DAG-template (vs. fallback generic). */
    matchedTemplates: number;
    /** Hoeveel gerechten kregen een fallback generic-task (geen DAG-match). */
    fallbackCount: number;
    /** Server_recipe-tasks die verwijderd zijn (force-mode). */
    deletedCount: number;
    tasks: ScheduledTaskRow[];
}

export interface ScheduledTaskRow {
    event_id: number;
    organization_id: string;
    text: string;
    phase: PrepTaskPhase;
    scheduled_at: string;
    station_id: number | null;
    gerecht_id: string;
    course_id: number | null;
    target_qty: number | null;
    target_unit: string | null;
    qty_source: 'server_recipe';
    priority: number;
    status: 'planned';
    dagen: number;
}

/**
 * De main entry point. Roept aan vanuit:
 *  - `/api/prep/bulk-schedule/route.ts` (interactief, force-mode optioneel)
 *  - `acceptance-workflow.ts` (auto-trigger bij offerte-acceptatie, idempotent default)
 */
export async function bulkScheduleEventPrep(
    supabase: SupabaseClient,
    eventId: number,
    orgId: string,
    options: BulkScheduleOptions = {},
): Promise<BulkScheduleResult> {
    const force = options.force === true;

    // 1. Event check
    const { data: event, error: eventErr } = await supabase
        .from('events')
        .select('id, organization_id, name, date, start_time, guests')
        .eq('id', eventId)
        .maybeSingle();
    if (eventErr) {
        return emptyResult({ ok: false, reason: 'db_error', error: eventErr.message });
    }
    if (!event) {
        return emptyResult({ ok: false, reason: 'event_not_found' });
    }
    if (event.organization_id !== orgId) {
        return emptyResult({ ok: false, reason: 'no_org_match' });
    }
    if (!event.date) {
        return emptyResult({ ok: false, reason: 'no_date' });
    }
    if (!event.guests || event.guests <= 0) {
        return emptyResult({ ok: false, reason: 'no_guests' });
    }

    // Compose event-start ISO. Als start_time ontbreekt, gebruik de default
    // (16:00 voor offerte-flow, undefined voor handmatige bulk-schedule).
    const startTimeRaw = event.start_time || options.defaultStartTime || '16:00:00';
    const eventStartISO = composeEventStart(event.date, startTimeRaw);
    if (!eventStartISO) {
        return emptyResult({ ok: false, reason: 'no_date' });
    }

    // 2. Idempotency / force handling
    let deletedCount = 0;
    if (!force) {
        // Idempotent: als er al server_recipe-tasks bestaan voor dit event, niets doen.
        const { count: existingCount } = await supabase
            .from('prep_tasks')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', eventId)
            .eq('qty_source', 'server_recipe');
        if ((existingCount ?? 0) > 0) {
            return {
                ok: true,
                taskCount: 0,
                matchedTemplates: 0,
                fallbackCount: 0,
                deletedCount: 0,
                tasks: [],
            };
        }
    } else if (!options.dryRun) {
        const { count: delCount, error: delErr } = await supabase
            .from('prep_tasks')
            .delete({ count: 'exact' })
            .eq('event_id', eventId)
            .eq('qty_source', 'server_recipe');
        if (delErr) {
            return emptyResult({ ok: false, reason: 'db_error', error: delErr.message });
        }
        deletedCount = delCount ?? 0;
    }

    // 3. Resolve dish-ids voor dit event (uit offerte.menu_selectie of event.menu).
    const dishIds = await resolveDishIdsForEvent(supabase, eventId, options.onlyGerechtIds ?? null);
    if (dishIds.length === 0) {
        return emptyResult({ ok: true, reason: 'no_dishes' });
    }

    // 4. Load gerechten (org-scoped)
    const { data: dishes, error: dishErr } = await supabase
        .from('gerechten')
        .select('id, naam, porties, ingredient_costs')
        .in('id', dishIds)
        .eq('organization_id', orgId);
    if (dishErr) {
        return emptyResult({ ok: false, reason: 'db_error', error: dishErr.message });
    }
    if (!dishes || dishes.length === 0) {
        return emptyResult({ ok: true, reason: 'no_gerechten_match' });
    }

    // 5. Production-plan (qty per ingredient per gerecht)
    const productionPlan = calculateProductionPlan({
        guests: event.guests,
        dishes: (dishes as DishRow[]).map((d) => ({
            gerecht_id: d.id,
            gerecht_naam: d.naam,
            ingredients: d.ingredient_costs ?? [],
        })),
    });

    // 6. Stations + courses ophalen (course_id voor P0-3-coupling)
    const [stationsRes, coursesRes] = await Promise.all([
        supabase
            .from('kitchen_stations')
            .select('id, type, sort_order')
            .eq('organization_id', orgId)
            .eq('archived', false),
        supabase
            .from('courses')
            .select('id, event_id, gerecht_id')
            .eq('event_id', eventId),
    ]);

    const stationByType = new Map<string, number>();
    for (const s of (stationsRes.data ?? []) as Array<{ id: number; type: string; sort_order: number }>) {
        if (!stationByType.has(s.type)) stationByType.set(s.type, s.id);
    }
    const courseByGerecht = new Map<string, number>();
    for (const c of (coursesRes.data ?? []) as CourseRow[]) {
        if (c.gerecht_id && !courseByGerecht.has(c.gerecht_id)) {
            courseByGerecht.set(c.gerecht_id, c.id);
        }
    }

    // 7. Genereer task rows per gerecht
    const taskRows: ScheduledTaskRow[] = [];
    let matchedTemplates = 0;
    let fallbackCount = 0;

    for (const dish of dishes as DishRow[]) {
        const template = findTemplateForDish(dish.naam);
        const courseId = courseByGerecht.get(dish.id) ?? null;
        const ingredientForDish = productionPlan.filter((p) => p.gerecht_id === dish.id);

        if (!template) {
            // Fallback: één generic prep-taak per gerecht
            fallbackCount++;
            taskRows.push({
                event_id: eventId,
                organization_id: orgId,
                text: `Voorbereiden: ${dish.naam}`,
                phase: 'other',
                scheduled_at: scheduledAtForPhase('other', { eventStart: eventStartISO }),
                station_id: stationByType.get('prep') ?? null,
                gerecht_id: dish.id,
                course_id: courseId,
                target_qty: ingredientForDish.reduce((sum, l) => sum + l.target_qty, 0) || null,
                target_unit: ingredientForDish[0]?.target_unit ?? null,
                qty_source: 'server_recipe',
                priority: 50,
                status: 'planned',
                dagen: dagenBeforeEvent(scheduledAtForPhase('other', { eventStart: eventStartISO }), eventStartISO),
            });
            continue;
        }

        // Template-driven DAG
        matchedTemplates++;
        for (const step of template.steps) {
            const stationId = step.station_type
                ? stationByType.get(step.station_type as KitchenStationType) ?? null
                : null;
            const offsetMin = resolveOffsetMinutes(step);
            const scheduledAt = scheduledAtForPhase(step.phase, {
                eventStart: eventStartISO,
                customOffsetMinutes: offsetMin,
            });

            taskRows.push({
                event_id: eventId,
                organization_id: orgId,
                text: `${dish.naam} — ${step.text}`,
                phase: step.phase,
                scheduled_at: scheduledAt,
                station_id: stationId,
                gerecht_id: dish.id,
                course_id: courseId,
                target_qty: stepCarriesQty(step) && ingredientForDish.length > 0
                    ? ingredientForDish.reduce((sum, l) => sum + l.target_qty, 0)
                    : null,
                target_unit: stepCarriesQty(step) ? ingredientForDish[0]?.target_unit ?? null : null,
                qty_source: 'server_recipe',
                priority: stepPriority(step),
                status: 'planned',
                dagen: dagenBeforeEvent(scheduledAt, eventStartISO),
            });
        }
    }

    if (options.dryRun) {
        return {
            ok: true,
            taskCount: taskRows.length,
            matchedTemplates,
            fallbackCount,
            deletedCount,
            tasks: taskRows,
        };
    }

    // 8. Insert in DB
    if (taskRows.length === 0) {
        return {
            ok: true,
            taskCount: 0,
            matchedTemplates,
            fallbackCount,
            deletedCount,
            tasks: [],
        };
    }

    const { error: insErr } = await supabase.from('prep_tasks').insert(taskRows);
    if (insErr) {
        return emptyResult({ ok: false, reason: 'db_error', error: insErr.message });
    }

    return {
        ok: true,
        taskCount: taskRows.length,
        matchedTemplates,
        fallbackCount,
        deletedCount,
        tasks: taskRows,
    };
}

/* ─── Helpers ───────────────────────────────────────────────── */

function emptyResult(over: Partial<BulkScheduleResult>): BulkScheduleResult {
    return {
        ok: false,
        taskCount: 0,
        matchedTemplates: 0,
        fallbackCount: 0,
        deletedCount: 0,
        tasks: [],
        ...over,
    };
}

function composeEventStart(date: string, time: string): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const t = /^\d{2}:\d{2}(:\d{2})?$/.test(time)
        ? (time.length === 5 ? `${time}:00` : time)
        : null;
    if (!t) return null;
    const isoLike = `${date}T${t}`;
    const d = new Date(isoLike);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function resolveDishIdsForEvent(
    supabase: SupabaseClient,
    eventId: number,
    onlyGerechtIds: string[] | null,
): Promise<string[]> {
    if (onlyGerechtIds && onlyGerechtIds.length > 0) return onlyGerechtIds;

    // Probeer eerst offerte.menu_selectie
    const { data: offerte } = await supabase
        .from('offertes')
        .select('id, menu_selectie')
        .eq('event_id', eventId)
        .maybeSingle();

    const ids = new Set<string>();
    if (offerte?.menu_selectie) {
        const ms = offerte.menu_selectie as
            | Record<string, MenuSelectionItem[]>
            | MenuSelectionItem[]
            | string;
        const flat: MenuSelectionItem[] = Array.isArray(ms)
            ? ms
            : typeof ms === 'object' && ms !== null
                ? Object.values(ms).flat()
                : [];
        for (const m of flat) {
            if (typeof m?.gerecht_id === 'string' && m.gerecht_id.length > 0) ids.add(m.gerecht_id);
        }
    }

    // Fallback: event.menu JSONB (sommige events hebben dit direct)
    if (ids.size === 0) {
        const { data: ev } = await supabase
            .from('events')
            .select('menu')
            .eq('id', eventId)
            .maybeSingle();
        const m = ev?.menu;
        if (Array.isArray(m)) {
            for (const v of m) {
                if (typeof v === 'string' && v.length > 0) ids.add(v);
            }
        }
    }

    return Array.from(ids);
}

function stepCarriesQty(step: RecipePhaseStep): boolean {
    return ['smoke', 'grill', 'koud', 'warm', 'plate'].includes(step.phase);
}

function stepPriority(step: RecipePhaseStep): number {
    const map: Record<string, number> = {
        inkoop: 10,
        pekel: 25,
        rub: 35,
        marinade: 35,
        smoke: 55,
        grill: 60,
        warm: 65,
        koud: 65,
        plate: 80,
        service: 100,
        other: 50,
    };
    return map[step.phase] ?? 50;
}

function dagenBeforeEvent(scheduledAt: string, eventStartISO: string): number {
    const d1 = new Date(scheduledAt).getTime();
    const d2 = new Date(eventStartISO).getTime();
    if (!Number.isFinite(d1) || !Number.isFinite(d2)) return 0;
    const diffDays = Math.floor((d2 - d1) / (24 * 60 * 60 * 1000));
    return Math.max(-1, diffDays);
}
