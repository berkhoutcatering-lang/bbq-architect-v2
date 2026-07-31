/* Tests voor /api/components/[id] — de bewerk-route van een bouwsteen.
 *
 * Wat hier bewaakt wordt is niet "werkt de code", maar drie dingen die een
 * cateraar echt geld of veiligheid kosten:
 *   1. een mislukte allergenen-query mag nooit als "geen allergenen" het scherm in;
 *   2. opslaan mag allergenen nooit eerst wissen en daarna pas terugzetten;
 *   3. wie met oude gegevens in beeld opslaat, mag een nieuwere prijs of een
 *      net toegevoegd allergeen niet stil overschrijven.
 *
 * De Supabase-client is nagebouwd: elke aanroep wordt vastgelegd zodat de test
 * kan controleren wélke schrijfacties er zijn gedaan (en welke juist niet).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

interface Call {
    table: string;
    op: 'select' | 'insert' | 'update' | 'delete';
    payload?: unknown;
    filters: [string, unknown][];
}
type Antwoord = { data: unknown; error: unknown };
type Handler = (call: Call) => Antwoord;

const state: { handler: Handler; calls: Call[] } = { handler: () => ({ data: null, error: null }), calls: [] };

function nepClient() {
    return {
        auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
        from(table: string) {
            const call: Call = { table, op: 'select', filters: [] };
            const klaar = () => { state.calls.push(call); return Promise.resolve(state.handler(call)); };
            const builder: Record<string, unknown> = {
                select: () => builder,
                insert: (rows: unknown) => { call.op = 'insert'; call.payload = rows; return builder; },
                update: (obj: unknown) => { call.op = 'update'; call.payload = obj; return builder; },
                delete: () => { call.op = 'delete'; return builder; },
                eq: (k: string, v: unknown) => { call.filters.push([k, v]); return builder; },
                in: (k: string, v: unknown) => { call.filters.push([k, v]); return builder; },
                order: () => builder,
                limit: () => builder,
                maybeSingle: () => klaar(),
                single: () => klaar(),
                then: (ok: (a: Antwoord) => unknown, fout?: (e: unknown) => unknown) => klaar().then(ok, fout),
            };
            return builder;
        },
    };
}

vi.mock('@/lib/supabase-server', () => ({
    createServerSupabase: async () => nepClient(),
}));
vi.mock('@/lib/dal/componentIngredients', () => ({
    syncComponentIngredients: async () => ({ error: null }),
}));

import { GET, PATCH } from './route';

const VERSIE = '2026-07-31T10:00:00.000+00:00';
const COMPONENT = {
    id: 1, name: 'Gerookte kip', organization_id: 'org-1',
    base_quantity: 1000, base_unit: 'g', base_cost_cents: 900,
    yield_factor: 1, updated_at: VERSIE,
};

const ctx = { params: Promise.resolve({ id: '1' }) };
function patchReq(payload: unknown) {
    return { json: async () => payload } as unknown as NextRequest;
}
/* Standaard-antwoorden; per test overschrijven we alleen wat afwijkt. */
function handler(over: Partial<Record<string, Antwoord>> = {}, extra?: Handler): Handler {
    return (call) => {
        const sleutel = `${call.table}:${call.op}`;
        const eigen = extra?.(call);
        if (eigen) return eigen;
        if (over[sleutel]) return over[sleutel]!;
        switch (sleutel) {
            case 'organization_members:select': return { data: { organization_id: 'org-1' }, error: null };
            case 'components:select': return { data: COMPONENT, error: null };
            case 'components:update': return { data: COMPONENT, error: null };
            case 'component_allergens:select': return { data: [{ allergen_code: 'G' }], error: null };
            case 'component_haccp_points:select': return { data: [], error: null };
            case 'allergens:select': return { data: [{ code: 'G' }, { code: 'N' }, { code: 'L' }], error: null };
            case 'gerecht_components:select': return { data: [], error: null };
            default: return { data: null, error: null };
        }
    };
}

beforeEach(() => { state.calls = []; });

describe('GET /api/components/[id]', () => {
    it('faalt hard als de allergenen niet opgehaald kunnen worden (nooit stil een lege lijst)', async () => {
        state.handler = handler({ component_allergens: undefined } as never, (call) => {
            if (call.table === 'component_allergens') return { data: null, error: { code: '08006', message: 'connection lost' } };
            return undefined as unknown as Antwoord;
        });
        const res = await GET({} as NextRequest, ctx);
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.allergens).toBeUndefined();
        expect(body.allergens_unavailable).toBe(true);
        /* Geen databasejargon in beeld. */
        expect(String(body.error)).not.toContain('connection lost');
    });

    it('geeft component + allergenen terug als alles goed gaat', async () => {
        state.handler = handler();
        const res = await GET({} as NextRequest, ctx);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.allergens).toEqual([{ allergen_code: 'G' }]);
    });
});

describe('PATCH /api/components/[id] — allergenen', () => {
    it('wist niet eerst alles: voegt alleen het nieuwe toe en laat het bestaande staan', async () => {
        state.handler = handler();
        const res = await PATCH(patchReq({
            name: 'Gerookte kip',
            allergens: [{ allergen_code: 'G' }, { allergen_code: 'N' }],
        }), ctx);
        expect(res.status).toBe(200);

        const deletes = state.calls.filter(c => c.table === 'component_allergens' && c.op === 'delete');
        expect(deletes).toHaveLength(0);
        const inserts = state.calls.filter(c => c.table === 'component_allergens' && c.op === 'insert');
        expect(inserts).toHaveLength(1);
        const rows = inserts[0].payload as { allergen_code: string }[];
        expect(rows.map(r => r.allergen_code)).toEqual(['N']);
    });

    it('verwijdert alleen het uitgevinkte allergeen, en niet de rest', async () => {
        state.handler = handler({ 'component_allergens:select': { data: [{ allergen_code: 'G' }, { allergen_code: 'N' }], error: null } });
        const res = await PATCH(patchReq({ name: 'Kip', allergens: [{ allergen_code: 'G' }] }), ctx);
        expect(res.status).toBe(200);
        const del = state.calls.find(c => c.table === 'component_allergens' && c.op === 'delete');
        expect(del).toBeDefined();
        expect(del!.filters.find(f => f[0] === 'allergen_code')?.[1]).toEqual(['N']);
    });

    it('mislukt toevoegen? Dan niets verwijderd en geen "opgeslagen" naar het scherm', async () => {
        state.handler = handler({
            'component_allergens:select': { data: [{ allergen_code: 'G' }], error: null },
            'component_allergens:insert': { data: null, error: { code: '23503', message: 'violates foreign key constraint' } },
        });
        const res = await PATCH(patchReq({
            name: 'Kip',
            allergens: [{ allergen_code: 'G' }, { allergen_code: 'N' }],
        }), ctx);
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(String(body.error)).not.toContain('foreign key');
        expect(state.calls.filter(c => c.table === 'component_allergens' && c.op === 'delete')).toHaveLength(0);
        /* En de bouwsteen zelf is óók niet geschreven — opnieuw opslaan werkt dus gewoon. */
        expect(state.calls.filter(c => c.table === 'components' && c.op === 'update')).toHaveLength(0);
    });

    it('weigert allergeen-codes die de database niet kent, zonder iets aan te raken', async () => {
        state.handler = handler();
        const res = await PATCH(patchReq({ name: 'Kip', allergens: [{ allergen_code: 'Sl' }] }), ctx);
        expect(res.status).toBe(409);
        expect(state.calls.filter(c => c.table === 'component_allergens' && c.op !== 'select')).toHaveLength(0);
    });

    it('stempelt een AI-voorstel niet af als door een mens bevestigd', async () => {
        state.handler = handler({ 'component_allergens:select': { data: [], error: null } });
        await PATCH(patchReq({
            name: 'Kip',
            allergens: [{ allergen_code: 'N', ai_suggested: true }, { allergen_code: 'G', ai_suggested: false }],
        }), ctx);
        const rows = state.calls.find(c => c.table === 'component_allergens' && c.op === 'insert')!
            .payload as { allergen_code: string; ai_suggested: boolean; confirmed_at: string | null; confirmed_by: string | null }[];
        const ai = rows.find(r => r.allergen_code === 'N')!;
        const mens = rows.find(r => r.allergen_code === 'G')!;
        expect(ai.ai_suggested).toBe(true);
        expect(ai.confirmed_at).toBeNull();
        expect(ai.confirmed_by).toBeNull();
        expect(mens.confirmed_at).not.toBeNull();
    });
});

describe('PATCH /api/components/[id] — HACCP', () => {
    it('laat een ongewijzigd punt met rust en voegt alleen het nieuwe toe', async () => {
        state.handler = handler({
            'component_haccp_points:select': {
                data: [{ id: 7, type: 'kerntemp', threshold_value: 75, threshold_unit: 'celsius', note: null }],
                error: null,
            },
        });
        const res = await PATCH(patchReq({
            name: 'Kip',
            haccp_points: [
                { type: 'kerntemp', threshold_value: 75, threshold_unit: 'celsius', note: null },
                { type: 'koeltemp', threshold_value: 4, threshold_unit: 'celsius', note: null, ai_suggested: true },
            ],
        }), ctx);
        expect(res.status).toBe(200);
        expect(state.calls.filter(c => c.table === 'component_haccp_points' && c.op === 'delete')).toHaveLength(0);
        const rows = state.calls.find(c => c.table === 'component_haccp_points' && c.op === 'insert')!
            .payload as { type: string; confirmed_at: string | null }[];
        expect(rows).toHaveLength(1);
        expect(rows[0].type).toBe('koeltemp');
        expect(rows[0].confirmed_at).toBeNull();
    });
});

describe('PATCH /api/components/[id] — gelijktijdig opslaan', () => {
    it('weigert opslaan als de bouwsteen intussen gewijzigd is', async () => {
        state.handler = handler();
        const res = await PATCH(patchReq({
            name: 'Kip',
            base_cost_cents: 900,
            expected_updated_at: '2026-07-31T09:00:00.000+00:00',
        }), ctx);
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.conflict).toBe(true);
        expect(state.calls.filter(c => c.op === 'update')).toHaveLength(0);
    });

    it('schrijft op de versie die is gelezen en tikt die zelf op', async () => {
        state.handler = handler();
        const res = await PATCH(patchReq({ name: 'Kip', expected_updated_at: VERSIE }), ctx);
        expect(res.status).toBe(200);
        const upd = state.calls.find(c => c.table === 'components' && c.op === 'update')!;
        expect(upd.filters).toContainEqual(['updated_at', VERSIE]);
        expect((upd.payload as { updated_at?: string }).updated_at).toBeTypeOf('string');
        expect((upd.payload as { updated_at?: string }).updated_at).not.toBe(VERSIE);
    });

    it('meldt in mensentaal dat er niets is opgeslagen als de rij intussen weg is', async () => {
        let eersteLees = true;
        state.handler = handler({ 'components:update': { data: null, error: null } }, (call) => {
            if (call.table === 'components' && call.op === 'select') {
                if (eersteLees) { eersteLees = false; return { data: COMPONENT, error: null }; }
                return { data: null, error: null };   // bestaat niet meer
            }
            return undefined as unknown as Antwoord;
        });
        const res = await PATCH(patchReq({ name: 'Kip' }), ctx);
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(String(body.error)).toContain('bestaat niet meer');
    });
});

describe('PATCH /api/components/[id] — foutmeldingen', () => {
    it('toont geen rauwe databasetekst als een kolom ontbreekt', async () => {
        state.handler = handler({
            'components:update': { data: null, error: { code: 'PGRST204', message: "Could not find the 'pack_unit' column of 'components' in the schema cache" } },
        });
        const res = await PATCH(patchReq({ name: 'Kip', pack_unit: 'kg' }), ctx);
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(String(body.error)).not.toContain('pack_unit');
        expect(String(body.error)).not.toContain('schema cache');
        expect(String(body.error).toLowerCase()).toContain('database-update');
    });
});
