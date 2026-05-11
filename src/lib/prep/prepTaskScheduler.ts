/**
 * prepTaskScheduler — backward-scheduling + DAG-resolver voor Prep-KDS.
 *
 * Twee verantwoordelijkheden:
 *   1) Bereken `scheduled_at` per prep-task door terug te rekenen vanaf
 *      event.start − phase-specifieke lead-time. Dat lost Golden Pillar #1
 *      op (backward-scheduled smoker timeline).
 *   2) Topologisch sorteren van een DAG van prep_task_dependencies zodat
 *      dependencies altijd vóór dependents lopen.
 *
 * Geen DB-toegang hier — pure functies op data die de aanroeper meegeeft.
 * Server Actions (bulk-schedule route) wrappen dit met Supabase-fetches.
 */

import type { PrepTaskPhase } from '@/types/database.types';

/**
 * Lead-time (minuten) die elke phase TERUG ligt vanaf event.start.
 *
 * Voorbeeld: event-start zaterdag 16:00.
 *   - service:  za 16:00          (offset 0)
 *   - plate:    za 15:30          (offset 30)
 *   - grill:    za 15:00          (offset 60)
 *   - smoke:    za 03:00          (offset 13*60 = 780, smoke duurt ~12u + 1u rust)
 *   - rub:      vrij 22:00        (offset 18*60 = 1080)
 *   - pekel:    vrij 04:00        (offset 36*60 = 2160 — pekel 24u vóór rub start)
 *   - inkoop:   do 16:00          (offset 48*60 = 2880)
 *
 * Defaults volgen typische BBQ-doorlooptijden. Recept-specifieke
 * overrides komen in V2 via `gerechten.prep_overrides JSONB`.
 */
export const PHASE_OFFSET_MINUTES: Record<PrepTaskPhase, number> = {
    inkoop:   2 * 24 * 60,   // 2 dagen voor event
    pekel:    36 * 60,       // 36u — pekel 24u + rub 12u
    rub:      18 * 60,       // 18u — rub 12u + 6u marge tot smoke
    marinade: 18 * 60,       // idem rub
    smoke:    13 * 60,       // 13u — smoke 12u + 1u rust
    grill:    60,            // 1u voor event-start
    warm:     120,           // 2u — mac-cheese / bechamel / sauzen op fornuis
    koud:     120,           // 2u voor event-start
    plate:    30,            // 30min voor event-start
    service:  0,             // tijdens event
    other:    60,            // catchall — 1u voor event
};

/**
 * Hoe lang duurt een phase zelf (in minuten). Gebruikt voor UI-progressbar
 * en eventueel cascade-blocking (V2: "pekel duurt nog 14u").
 */
export const PHASE_DURATION_MINUTES: Record<PrepTaskPhase, number> = {
    inkoop:   60,            // logistiek, ~1u
    pekel:    24 * 60,
    rub:      12 * 60,
    marinade: 12 * 60,
    smoke:    12 * 60,
    grill:    30,
    warm:     45,            // typische warme-prep (sauzen, mac-cheese)
    koud:     60,
    plate:    30,
    service:  0,
    other:    30,
};

export interface ScheduleInput {
    /** Event-start als ISO string of Date. Wordt geparset met new Date(). */
    eventStart: string | Date;
    /** Optioneel — eigen offset (minuten) overschrijft phase-default. */
    customOffsetMinutes?: number;
}

/**
 * Bereken wanneer een task van een gegeven phase moet beginnen.
 * @returns ISO-string van scheduled_at, geschikt voor TIMESTAMPTZ insert.
 */
export function scheduledAtForPhase(
    phase: PrepTaskPhase,
    input: ScheduleInput,
): string {
    const start = toDate(input.eventStart);
    const offset = input.customOffsetMinutes ?? PHASE_OFFSET_MINUTES[phase];
    const scheduled = new Date(start.getTime() - offset * 60_000);
    return scheduled.toISOString();
}

/**
 * Berekent een complete prep-timeline voor één event en een set phases.
 * Returnt rijen die direct als prep_tasks INSERT kunnen worden gepushed
 * (na koppeling aan gerecht_id + station_id door de aanroeper).
 */
export interface TimelineRow {
    phase: PrepTaskPhase;
    scheduled_at: string;
    /** Voor UI: hoe ver vóór event-start, in minuten. */
    offset_minutes: number;
    /** Voor UI: geschatte duur van de phase zelf. */
    duration_minutes: number;
}

export function buildPhaseTimeline(
    eventStart: string | Date,
    phases: PrepTaskPhase[],
): TimelineRow[] {
    const start = toDate(eventStart);
    return phases.map((phase) => {
        const offset = PHASE_OFFSET_MINUTES[phase];
        return {
            phase,
            scheduled_at: new Date(start.getTime() - offset * 60_000).toISOString(),
            offset_minutes: offset,
            duration_minutes: PHASE_DURATION_MINUTES[phase],
        };
    });
}

// ─── DAG topological sort ──────────────────────────────────────

export interface DagNode {
    id: number;
    /** IDs waar deze node op wacht (depends_on). */
    deps: number[];
}

/**
 * Khan's algorithm — topologische sort. Werpt een Error met cycle-info als
 * de DAG niet acyclisch is. Tijdcomplexiteit O(V+E).
 *
 * Aanroeper geeft een set nodes (taken) met hun depends_on-IDs. Returnt
 * de IDs in volgorde waarin ze veilig uitgevoerd kunnen worden.
 */
export function topologicalSort(nodes: DagNode[]): number[] {
    const idSet = new Set(nodes.map((n) => n.id));
    const inDegree = new Map<number, number>();
    const outEdges = new Map<number, number[]>();

    for (const n of nodes) {
        inDegree.set(n.id, inDegree.get(n.id) ?? 0);
        for (const dep of n.deps) {
            if (!idSet.has(dep)) {
                throw new Error(
                    `topologicalSort: node ${n.id} depends on unknown ${dep}`,
                );
            }
            inDegree.set(n.id, (inDegree.get(n.id) ?? 0) + 1);
            const outs = outEdges.get(dep) ?? [];
            outs.push(n.id);
            outEdges.set(dep, outs);
        }
    }

    const queue: number[] = [];
    for (const [id, deg] of inDegree) {
        if (deg === 0) queue.push(id);
    }
    /* Deterministische output bij gelijke prioriteit. */
    queue.sort((a, b) => a - b);

    const result: number[] = [];
    while (queue.length > 0) {
        const id = queue.shift()!;
        result.push(id);
        const outs = outEdges.get(id) ?? [];
        const newReady: number[] = [];
        for (const next of outs) {
            const remaining = (inDegree.get(next) ?? 0) - 1;
            inDegree.set(next, remaining);
            if (remaining === 0) newReady.push(next);
        }
        newReady.sort((a, b) => a - b);
        queue.push(...newReady);
    }

    if (result.length !== nodes.length) {
        const missing = nodes
            .map((n) => n.id)
            .filter((id) => !result.includes(id));
        throw new Error(
            `topologicalSort: cycle detected involving ${missing.join(', ')}`,
        );
    }

    return result;
}

/**
 * Markeert een task als 'blocked' als ten minste één dependency nog niet 'done' is.
 * Pure functie — caller doet de DB update.
 */
export function computeBlockedStatus(
    taskId: number,
    deps: Array<{ depends_on_id: number; status: string | null | undefined }>,
): 'blocked' | 'queued' {
    const anyOpen = deps.some(
        (d) => d.status !== 'done' && d.status !== 'skipped',
    );
    return anyOpen ? 'blocked' : 'queued';
}

// ─── Helpers ───────────────────────────────────────────────────

function toDate(v: string | Date): Date {
    if (v instanceof Date) {
        if (Number.isNaN(v.getTime())) {
            throw new Error(`prepTaskScheduler: invalid Date instance`);
        }
        return v;
    }
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
        throw new Error(`prepTaskScheduler: invalid date string "${v}"`);
    }
    return d;
}
