import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bulkScheduleEventPrep } from './bulkSchedule';

/**
 * Tests gebruiken een minimal mock-supabase die alleen de specifieke queries
 * implementeert die bulkScheduleEventPrep doet. Zo testen we de business-logic
 * (idempotency, force-mode, course-coupling, fallback-template) zonder echte DB.
 */

interface MockState {
    event: { id: number; organization_id: string; name: string; date: string | null; start_time: string | null; guests: number } | null;
    existingPrepCount: number;
    dishes: Array<{ id: string; naam: string; porties?: number | null; ingredient_costs?: Array<{ naam: string; qty_pp: number; unit: string; yield?: number }> | null }>;
    stations: Array<{ id: number; type: string; sort_order: number }>;
    courses: Array<{ id: number; event_id: number; gerecht_id: string | null }>;
    offerteMenuSelection: Record<string, Array<{ gerecht_id: string }>> | null;
    inserted: unknown[];
    deletedCount: number;
}

function makeMockSupabase(state: MockState) {
    const inserted: unknown[] = [];
    state.inserted = inserted;

    function makeQueryBuilder(table: string) {
        const filters: Record<string, unknown> = {};
        let isCount = false;

        function resolve(mode: 'single' | 'maybeSingle' | 'all') {
            if (isCount) {
                if (table === 'prep_tasks') {
                    return { count: state.existingPrepCount, error: null };
                }
                return { count: 0, error: null };
            }
            if (table === 'events') {
                return mode === 'all'
                    ? { data: state.event ? [state.event] : [], error: null }
                    : { data: state.event, error: null };
            }
            if (table === 'gerechten') {
                const ids = (filters['id__in'] as string[]) || [];
                const data = state.dishes.filter((d) => ids.includes(d.id));
                return mode === 'all' ? { data, error: null } : { data: data[0] ?? null, error: null };
            }
            if (table === 'kitchen_stations') {
                return { data: state.stations, error: null };
            }
            if (table === 'courses') {
                return { data: state.courses, error: null };
            }
            if (table === 'offertes') {
                return {
                    data: state.offerteMenuSelection ? { id: 1, menu_selectie: state.offerteMenuSelection } : null,
                    error: null,
                };
            }
            return { data: null, error: null };
        }

        type Builder = {
            eq: (c: string, v: unknown) => Builder;
            in: (c: string, v: unknown[]) => Builder;
            is: (c: string, v: unknown) => Builder;
            ilike: (c: string, v: string) => Builder;
            not: (c: string, op: string, v: unknown) => Builder;
            order: () => Builder;
            limit: () => Builder;
            select: (cols?: string, opts?: { count?: string; head?: boolean }) => Builder;
            single: () => Promise<unknown>;
            maybeSingle: () => Promise<unknown>;
            then: (cb: (v: unknown) => unknown) => Promise<unknown>;
        };

        const builder: Builder = {
            eq(col, val) { filters[col] = val; return builder; },
            in(col, vals) { filters[`${col}__in`] = vals; return builder; },
            is(col, val) { filters[`${col}__is`] = val; return builder; },
            ilike(col, val) { filters[`${col}__ilike`] = val; return builder; },
            not(col, op, val) { filters[`${col}__not_${op}`] = val; return builder; },
            order() { return builder; },
            limit() { return builder; },
            select(_cols, opts) {
                if (opts?.count === 'exact' && opts?.head === true) isCount = true;
                return builder;
            },
            single() { return Promise.resolve(resolve('single')); },
            maybeSingle() { return Promise.resolve(resolve('maybeSingle')); },
            then(cb) { return Promise.resolve(resolve('all')).then(cb); },
        };
        return builder;
    }

    return {
        from(table: string) {
            return {
                select(_cols?: string, opts?: { count?: string; head?: boolean }) {
                    const b = makeQueryBuilder(table);
                    return b.select(_cols, opts);
                },
                insert(rows: unknown) {
                    if (Array.isArray(rows)) inserted.push(...rows);
                    else inserted.push(rows);
                    return {
                        select() {
                            return {
                                maybeSingle: () => Promise.resolve({ data: rows, error: null }),
                            };
                        },
                        then: (onResolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(onResolve),
                    };
                },
                delete(opts?: { count?: string }) {
                    return {
                        eq() { return this; },
                        in() { return this; },
                        then(onResolve: (v: { count?: number; error: null }) => unknown) {
                            const wasDeleted = state.existingPrepCount;
                            state.deletedCount = wasDeleted;
                            state.existingPrepCount = 0;
                            return Promise.resolve(
                                opts?.count === 'exact'
                                    ? { count: wasDeleted, error: null }
                                    : { error: null },
                            ).then(onResolve);
                        },
                    };
                },
            };
        },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('bulkScheduleEventPrep — idempotency', () => {
    it('skips work als er al server_recipe-tasks bestaan (force=false)', async () => {
        const state: MockState = {
            event: { id: 1, organization_id: 'org-1', name: 'Test', date: '2026-06-15', start_time: '16:00:00', guests: 50 },
            existingPrepCount: 12,
            dishes: [],
            stations: [],
            courses: [],
            offerteMenuSelection: null,
            inserted: [],
            deletedCount: 0,
        };
        const supabase = makeMockSupabase(state);
        const result = await bulkScheduleEventPrep(supabase as never, 1, 'org-1');
        expect(result.ok).toBe(true);
        expect(result.taskCount).toBe(0);
        expect(state.inserted.length).toBe(0);
    });

    it('verwijdert eerst bestaande server_recipe-tasks als force=true', async () => {
        const state: MockState = {
            event: { id: 1, organization_id: 'org-1', name: 'Test', date: '2026-06-15', start_time: '16:00:00', guests: 50 },
            existingPrepCount: 15,
            dishes: [{
                id: 'dish-1', naam: 'Pulled Pork',
                ingredient_costs: [{ naam: 'Procureur', qty_pp: 0.18, unit: 'kg', yield: 0.7 }],
            }],
            stations: [{ id: 10, type: 'smoker', sort_order: 1 }],
            courses: [],
            offerteMenuSelection: { hoofdgerecht: [{ gerecht_id: 'dish-1' }] },
            inserted: [],
            deletedCount: 0,
        };
        const supabase = makeMockSupabase(state);
        const result = await bulkScheduleEventPrep(supabase as never, 1, 'org-1', { force: true });
        expect(result.ok).toBe(true);
        expect(result.deletedCount).toBe(15);
        expect(state.inserted.length).toBeGreaterThan(0);
    });
});

describe('bulkScheduleEventPrep — validation', () => {
    it('faalt als event niet bestaat', async () => {
        const state: MockState = {
            event: null, existingPrepCount: 0, dishes: [], stations: [], courses: [],
            offerteMenuSelection: null, inserted: [], deletedCount: 0,
        };
        const supabase = makeMockSupabase(state);
        const result = await bulkScheduleEventPrep(supabase as never, 999, 'org-1');
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('event_not_found');
    });

    it('faalt bij wrong org', async () => {
        const state: MockState = {
            event: { id: 1, organization_id: 'OTHER-ORG', name: 'X', date: '2026-06-15', start_time: '16:00:00', guests: 50 },
            existingPrepCount: 0, dishes: [], stations: [], courses: [],
            offerteMenuSelection: null, inserted: [], deletedCount: 0,
        };
        const supabase = makeMockSupabase(state);
        const result = await bulkScheduleEventPrep(supabase as never, 1, 'org-1');
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('no_org_match');
    });

    it('faalt bij 0 gasten', async () => {
        const state: MockState = {
            event: { id: 1, organization_id: 'org-1', name: 'X', date: '2026-06-15', start_time: '16:00:00', guests: 0 },
            existingPrepCount: 0, dishes: [], stations: [], courses: [],
            offerteMenuSelection: null, inserted: [], deletedCount: 0,
        };
        const supabase = makeMockSupabase(state);
        const result = await bulkScheduleEventPrep(supabase as never, 1, 'org-1');
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('no_guests');
    });

    it('returnt no_dishes als event geen menu heeft', async () => {
        const state: MockState = {
            event: { id: 1, organization_id: 'org-1', name: 'X', date: '2026-06-15', start_time: '16:00:00', guests: 50 },
            existingPrepCount: 0, dishes: [], stations: [], courses: [],
            offerteMenuSelection: null, inserted: [], deletedCount: 0,
        };
        const supabase = makeMockSupabase(state);
        const result = await bulkScheduleEventPrep(supabase as never, 1, 'org-1');
        expect(result.ok).toBe(true);
        expect(result.reason).toBe('no_dishes');
    });
});

describe('bulkScheduleEventPrep — DAG template matching', () => {
    it('genereert phase-DAG voor pulled pork', async () => {
        const state: MockState = {
            event: { id: 1, organization_id: 'org-1', name: 'X', date: '2026-06-15', start_time: '16:00:00', guests: 50 },
            existingPrepCount: 0,
            dishes: [{
                id: 'dish-1', naam: 'Pulled Pork',
                ingredient_costs: [{ naam: 'Procureur', qty_pp: 0.18, unit: 'kg', yield: 0.7 }],
            }],
            stations: [
                { id: 10, type: 'smoker', sort_order: 1 },
                { id: 11, type: 'koud', sort_order: 2 },
            ],
            courses: [],
            offerteMenuSelection: { hoofdgerecht: [{ gerecht_id: 'dish-1' }] },
            inserted: [], deletedCount: 0,
        };
        const supabase = makeMockSupabase(state);
        const result = await bulkScheduleEventPrep(supabase as never, 1, 'org-1');
        expect(result.ok).toBe(true);
        expect(result.matchedTemplates).toBe(1);
        expect(result.fallbackCount).toBe(0);
        expect(result.taskCount).toBeGreaterThanOrEqual(5);
    });

    it('fallback naar generic-task bij unknown gerecht', async () => {
        const state: MockState = {
            event: { id: 1, organization_id: 'org-1', name: 'X', date: '2026-06-15', start_time: '16:00:00', guests: 50 },
            existingPrepCount: 0,
            dishes: [{
                id: 'dish-99', naam: 'UFO-burger Mars-style',
                ingredient_costs: [{ naam: 'Plant-eiwit', qty_pp: 0.15, unit: 'kg' }],
            }],
            stations: [{ id: 10, type: 'prep', sort_order: 1 }],
            courses: [],
            offerteMenuSelection: { hoofdgerecht: [{ gerecht_id: 'dish-99' }] },
            inserted: [], deletedCount: 0,
        };
        const supabase = makeMockSupabase(state);
        const result = await bulkScheduleEventPrep(supabase as never, 1, 'org-1');
        expect(result.ok).toBe(true);
        expect(result.fallbackCount).toBe(1);
        expect(result.matchedTemplates).toBe(0);
        expect(result.taskCount).toBe(1);
    });
});

describe('bulkScheduleEventPrep — P0-3 course coupling', () => {
    it('koppelt course_id wanneer er een matching course bestaat', async () => {
        const state: MockState = {
            event: { id: 1, organization_id: 'org-1', name: 'X', date: '2026-06-15', start_time: '16:00:00', guests: 50 },
            existingPrepCount: 0,
            dishes: [{
                id: 'dish-1', naam: 'Pulled Pork',
                ingredient_costs: [{ naam: 'Procureur', qty_pp: 0.18, unit: 'kg', yield: 0.7 }],
            }],
            stations: [{ id: 10, type: 'smoker', sort_order: 1 }],
            courses: [{ id: 100, event_id: 1, gerecht_id: 'dish-1' }],
            offerteMenuSelection: { hoofdgerecht: [{ gerecht_id: 'dish-1' }] },
            inserted: [], deletedCount: 0,
        };
        const supabase = makeMockSupabase(state);
        const result = await bulkScheduleEventPrep(supabase as never, 1, 'org-1');
        expect(result.ok).toBe(true);
        expect(state.inserted.length).toBeGreaterThan(0);
        const firstTask = state.inserted[0] as { course_id: number | null };
        expect(firstTask.course_id).toBe(100);
    });

    it('laat course_id NULL als geen matching course', async () => {
        const state: MockState = {
            event: { id: 1, organization_id: 'org-1', name: 'X', date: '2026-06-15', start_time: '16:00:00', guests: 50 },
            existingPrepCount: 0,
            dishes: [{
                id: 'dish-1', naam: 'Pulled Pork',
                ingredient_costs: [{ naam: 'Procureur', qty_pp: 0.18, unit: 'kg', yield: 0.7 }],
            }],
            stations: [{ id: 10, type: 'smoker', sort_order: 1 }],
            courses: [{ id: 100, event_id: 1, gerecht_id: 'other-dish-id' }],
            offerteMenuSelection: { hoofdgerecht: [{ gerecht_id: 'dish-1' }] },
            inserted: [], deletedCount: 0,
        };
        const supabase = makeMockSupabase(state);
        const result = await bulkScheduleEventPrep(supabase as never, 1, 'org-1');
        expect(result.ok).toBe(true);
        const firstTask = state.inserted[0] as { course_id: number | null };
        expect(firstTask.course_id).toBeNull();
    });
});

describe('bulkScheduleEventPrep — defaultStartTime fallback', () => {
    it('gebruikt defaultStartTime als event.start_time NULL is', async () => {
        const state: MockState = {
            event: { id: 1, organization_id: 'org-1', name: 'X', date: '2026-06-15', start_time: null, guests: 50 },
            existingPrepCount: 0,
            dishes: [{
                id: 'dish-1', naam: 'Pulled Pork',
                ingredient_costs: [{ naam: 'Procureur', qty_pp: 0.18, unit: 'kg', yield: 0.7 }],
            }],
            stations: [],
            courses: [],
            offerteMenuSelection: { hoofdgerecht: [{ gerecht_id: 'dish-1' }] },
            inserted: [], deletedCount: 0,
        };
        const supabase = makeMockSupabase(state);
        const result = await bulkScheduleEventPrep(supabase as never, 1, 'org-1', { defaultStartTime: '14:00:00' });
        expect(result.ok).toBe(true);
        expect(result.taskCount).toBeGreaterThan(0);
    });
});

describe('bulkScheduleEventPrep — dryRun', () => {
    it('doet geen DB-insert in dryRun', async () => {
        const state: MockState = {
            event: { id: 1, organization_id: 'org-1', name: 'X', date: '2026-06-15', start_time: '16:00:00', guests: 50 },
            existingPrepCount: 0,
            dishes: [{
                id: 'dish-1', naam: 'Pulled Pork',
                ingredient_costs: [{ naam: 'Procureur', qty_pp: 0.18, unit: 'kg', yield: 0.7 }],
            }],
            stations: [],
            courses: [],
            offerteMenuSelection: { hoofdgerecht: [{ gerecht_id: 'dish-1' }] },
            inserted: [], deletedCount: 0,
        };
        const supabase = makeMockSupabase(state);
        const result = await bulkScheduleEventPrep(supabase as never, 1, 'org-1', { dryRun: true });
        expect(result.ok).toBe(true);
        expect(result.taskCount).toBeGreaterThan(0);
        expect(result.tasks.length).toBeGreaterThan(0);
        expect(state.inserted.length).toBe(0);
    });
});
