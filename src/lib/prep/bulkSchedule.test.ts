import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bulkScheduleEventPrep, matchGerechtIdByName } from './bulkSchedule';

/**
 * Tests gebruiken een minimal mock-supabase die alleen de specifieke queries
 * implementeert die bulkScheduleEventPrep doet. Zo testen we de business-logic
 * (idempotency, force-mode, course-coupling, fallback-template) zonder echte DB.
 */

interface MockState {
    event: {
        id: number; organization_id: string; name: string; date: string | null;
        start_time: string | null; guests: number;
        offerte_id?: number | null; menu?: unknown;
    } | null;
    existingPrepCount: number;
    dishes: Array<{ id: string; naam: string; porties?: number | null; ingredient_costs?: Array<{ naam: string; qty_pp: number; unit: string; yield?: number }> | null }>;
    stations: Array<{ id: number; type: string; sort_order: number }>;
    courses: Array<{ id: number; event_id: number; gerecht_id: string | null }>;
    /** menu_selectie zoals de wizard die opslaat — objects met gerecht_id, of naam-strings per categorie. */
    offerteMenuSelection: Record<string, Array<{ gerecht_id: string } | string>> | null;
    recepten?: Array<{ id: number; naam: string }>;
    /** gerecht_components join-rows incl. genest components-object (kookbord v2). */
    gerechtComponents?: Array<{
        gerecht_id: string;
        quantity_used: number | null;
        unit: string | null;
        components: { id: number; name: string; type: string | null; category: string | null; prep_minutes: number | null } | null;
    }>;
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
                /* Met id__in: de gerechten-load van de generator. Zonder: de
                   naam-resolutie-query (select id, naam, org-scoped). */
                const ids = filters['id__in'] as string[] | undefined;
                const data = ids ? state.dishes.filter((d) => ids.includes(d.id)) : state.dishes;
                return mode === 'all' ? { data, error: null } : { data: data[0] ?? null, error: null };
            }
            if (table === 'recepten') {
                const ids = (filters['id__in'] as number[]) || [];
                const data = (state.recepten ?? []).filter((r) => ids.includes(r.id));
                return { data, error: null };
            }
            if (table === 'gerecht_components') {
                const ids = (filters['gerecht_id__in'] as string[]) || [];
                const data = (state.gerechtComponents ?? []).filter((r) => ids.includes(r.gerecht_id));
                return { data, error: null };
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

describe('bulkScheduleEventPrep — menu-shapes uit productie (2026-06-12)', () => {
    it('resolvet naam-strings in menu_selectie via gerechten-naam (wizard-shape)', async () => {
        const state: MockState = {
            event: { id: 9, organization_id: 'org-1', name: 'Mariel', date: '2026-06-20', start_time: '17:00:00', guests: 44 },
            existingPrepCount: 0,
            dishes: [
                { id: 'uuid-zalm', naam: 'Crispy zalm', ingredient_costs: null },
                { id: 'uuid-bavette', naam: 'Gerookte bavette', ingredient_costs: null },
                { id: 'uuid-slider', naam: 'Slider van de yoder Smoker. ', ingredient_costs: null },
            ],
            stations: [{ id: 10, type: 'prep', sort_order: 1 }],
            courses: [],
            // Echte wizard-shape: namen per categorie, géén gerecht_id objects
            offerteMenuSelection: { bites: ['Crispy Zalm', 'Bavette'], hoofdgerechten: ['Sliders'] },
            inserted: [], deletedCount: 0,
        };
        const supabase = makeMockSupabase(state);
        const result = await bulkScheduleEventPrep(supabase as never, 9, 'org-1');
        expect(result.ok).toBe(true);
        // 3 namen → 3 gerechten gematcht ("Bavette"→contains, "Sliders"→enkelvoud)
        expect(result.taskCount).toBeGreaterThanOrEqual(3);
        const gerechtIds = new Set((state.inserted as Array<{ gerecht_id: string }>).map((t) => t.gerecht_id));
        expect(gerechtIds.has('uuid-zalm')).toBe(true);
        expect(gerechtIds.has('uuid-bavette')).toBe(true);
        expect(gerechtIds.has('uuid-slider')).toBe(true);
    });

    it('resolvet numerieke recepten-ids in events.menu via recepten→gerechten-naam', async () => {
        const state: MockState = {
            event: {
                id: 1, organization_id: 'org-1', name: 'X', date: '2026-06-15', start_time: '16:00:00', guests: 50,
                menu: [6, 11],
            },
            existingPrepCount: 0,
            dishes: [
                { id: 'uuid-pp', naam: 'Classic Pulled Pork', ingredient_costs: null },
            ],
            stations: [],
            courses: [],
            offerteMenuSelection: null,
            recepten: [{ id: 6, naam: 'Classic Pulled Pork' }, { id: 11, naam: 'Onbekend Gerecht Zonder Match' }],
            inserted: [], deletedCount: 0,
        };
        const supabase = makeMockSupabase(state);
        const result = await bulkScheduleEventPrep(supabase as never, 1, 'org-1');
        expect(result.ok).toBe(true);
        expect(result.taskCount).toBeGreaterThan(0);
        const gerechtIds = new Set((state.inserted as Array<{ gerecht_id: string }>).map((t) => t.gerecht_id));
        expect(gerechtIds.has('uuid-pp')).toBe(true);
    });

    it('overleeft dubbel-geëncodeerde menu-string (\'"[]"\') zonder crash → no_dishes', async () => {
        const state: MockState = {
            event: {
                id: 1, organization_id: 'org-1', name: 'X', date: '2026-06-15', start_time: '16:00:00', guests: 50,
                menu: '[]',
            },
            existingPrepCount: 0,
            dishes: [], stations: [], courses: [],
            offerteMenuSelection: null,
            inserted: [], deletedCount: 0,
        };
        const supabase = makeMockSupabase(state);
        const result = await bulkScheduleEventPrep(supabase as never, 1, 'org-1');
        expect(result.ok).toBe(true);
        expect(result.reason).toBe('no_dishes');
    });
});

describe('bulkScheduleEventPrep — component-taken (kookbord v2)', () => {
    it('genereert per component één gebundelde taak met opgetelde, geschaalde hoeveelheid', async () => {
        const state: MockState = {
            // 50 gasten, gerechten met porties 10 → factor 5
            event: { id: 1, organization_id: 'org-1', name: 'X', date: '2026-06-20', start_time: '16:00:00', guests: 50 },
            existingPrepCount: 0,
            dishes: [
                { id: 'dish-slider', naam: 'Sliders', porties: 10, ingredient_costs: null },
                { id: 'dish-taco', naam: 'Soft shell taco', porties: 10, ingredient_costs: null },
            ],
            stations: [
                { id: 1, type: 'koud', sort_order: 1 },
                { id: 4, type: 'sauzen', sort_order: 4 },
            ],
            courses: [],
            offerteMenuSelection: { hoofdgerechten: [{ gerecht_id: 'dish-slider' }, { gerecht_id: 'dish-taco' }] },
            gerechtComponents: [
                // zelfde mayo in twee gerechten → één bundeltaak van 0.2×5 + 0.1×5 = 1.5
                { gerecht_id: 'dish-slider', quantity_used: 0.2, unit: 'l', components: { id: 50, name: 'Mayonaise basis', type: 'house_made', category: 'food', prep_minutes: 25 } },
                { gerecht_id: 'dish-taco', quantity_used: 0.1, unit: 'l', components: { id: 50, name: 'Mayonaise basis', type: 'house_made', category: 'food', prep_minutes: 25 } },
                // bought_in → klaarzet-taak
                { gerecht_id: 'dish-slider', quantity_used: 1, unit: 'kg', components: { id: 51, name: 'MC Hamburgers Rund', type: 'bought_in', category: 'food', prep_minutes: null } },
                // non_food wordt geskipt
                { gerecht_id: 'dish-slider', quantity_used: 1, unit: 'stuk', components: { id: 52, name: 'Aluminiumfolie', type: 'bought_in', category: 'non_food', prep_minutes: null } },
            ],
            inserted: [], deletedCount: 0,
        };
        const supabase = makeMockSupabase(state);
        const result = await bulkScheduleEventPrep(supabase as never, 1, 'org-1');
        expect(result.ok).toBe(true);
        expect(result.componentCount).toBe(2); // mayo-bundel + hamburgers; folie geskipt

        const rows = state.inserted as Array<{
            text: string; component_id: number | null; target_qty: number | null;
            target_unit: string | null; batch_key: string | null; duration_min: number | null;
            station_id: number | null;
        }>;
        const mayo = rows.find((r) => r.component_id === 50)!;
        expect(mayo.text).toContain('Mayonaise basis');
        expect(mayo.target_qty).toBe(1.5);
        expect(mayo.target_unit).toBe('l');
        expect(mayo.batch_key).toBe('comp:50:2026-06-20');
        expect(mayo.duration_min).toBe(25);
        expect(mayo.station_id).toBe(4); // "mayo" → sauzen-station

        const burgers = rows.find((r) => r.component_id === 51)!;
        expect(burgers.text).toContain('Klaarzetten');
        expect(burgers.duration_min).toBe(10);

        expect(rows.some((r) => r.text.includes('Aluminiumfolie'))).toBe(false);
        // gerechten met componenten krijgen GEEN extra fallback-taak
        expect(rows.some((r) => r.text.startsWith('Voorbereiden:'))).toBe(false);
    });
});

describe('matchGerechtIdByName — naam-matching', () => {
    const gerechten = [
        { id: 'g1', naam: 'Crispy zalm' },
        { id: 'g2', naam: 'Gerookte bavette' },
        { id: 'g3', naam: 'Gegrilde kippendij. ' },
        { id: 'g4', naam: 'Slider van de yoder Smoker. ' },
        { id: 'g5', naam: 'Steak tartaar' },
        { id: 'g6', naam: 'moink balls van de smoker' },
        { id: 'g7', naam: 'pinsa van de barbecue ' },
    ];

    it('matcht exact, case-insensitive, met punt/spatie-ruis', () => {
        expect(matchGerechtIdByName('Crispy Zalm', gerechten)).toBe('g1');
        expect(matchGerechtIdByName('Steak Tartaar', gerechten)).toBe('g5');
    });

    it('matcht deelnaam ("Bavette" → "Gerookte bavette")', () => {
        expect(matchGerechtIdByName('Bavette', gerechten)).toBe('g2');
        expect(matchGerechtIdByName('Kippendij', gerechten)).toBe('g3');
        expect(matchGerechtIdByName('Pinsa', gerechten)).toBe('g7');
        expect(matchGerechtIdByName('Moink Balls', gerechten)).toBe('g6');
    });

    it('matcht meervoud → enkelvoud ("Sliders" → "Slider van de yoder Smoker.")', () => {
        expect(matchGerechtIdByName('Sliders', gerechten)).toBe('g4');
    });

    it('returnt null voor onbekende namen (geen wilde gok)', () => {
        expect(matchGerechtIdByName('Bavarois', gerechten)).toBeNull();
        expect(matchGerechtIdByName('', gerechten)).toBeNull();
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
