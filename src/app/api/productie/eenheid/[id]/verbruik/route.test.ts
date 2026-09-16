/* Tests voor /api/productie/eenheid/[id]/verbruik.
 *
 * Bewaakt:
 *   1. één zak verbruikt = één statuswissel + één voorraadmutatie (usage,
 *      −inhoud, met partij_id), omgerekend naar de eenheid van het voorraadproduct;
 *   2. dezelfde zak nog een keer scannen boekt niets meer af (alGedaan);
 *   3. afschrijven = type waste.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

interface Call { table: string; op: string; payload?: unknown; filters: [string, unknown][] }
const state: { eenheid: Record<string, unknown>; calls: Call[] } = { eenheid: {}, calls: [] };

function nepClient() {
    return {
        auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
        rpc(naam: string, args: unknown) {
            state.calls.push({ table: `rpc:${naam}`, op: 'rpc', payload: args, filters: [] });
            return Promise.resolve({ data: 11, error: null });
        },
        from(table: string) {
            const call: Call = { table, op: 'select', filters: [] };
            const klaar = () => {
                state.calls.push(call);
                if (table === 'organization_members') return Promise.resolve({ data: { organization_id: 'org-1' }, error: null });
                if (table === 'voorraad_eenheden' && call.op === 'select') return Promise.resolve({ data: state.eenheid, error: null });
                if (table === 'voorraad_eenheden' && call.op === 'update') {
                    if (state.eenheid.status !== 'op_voorraad') return Promise.resolve({ data: null, error: null });
                    state.eenheid = { ...state.eenheid, status: (call.payload as { status: string }).status };
                    return Promise.resolve({ data: { id: state.eenheid.id }, error: null });
                }
                if (table === 'inventory') return Promise.resolve({ data: { unit: 'g' }, error: null });
                return Promise.resolve({ data: null, error: null });
            };
            const b: Record<string, unknown> = {
                select: () => b,
                insert: (rows: unknown) => { call.op = 'insert'; call.payload = rows; return b; },
                update: (obj: unknown) => { call.op = 'update'; call.payload = obj; return b; },
                eq: (k: string, v: unknown) => { call.filters.push([k, v]); return b; },
                limit: () => b,
                maybeSingle: () => klaar(),
                single: () => klaar(),
                then: (ok: (a: unknown) => unknown, fout?: (e: unknown) => unknown) => klaar().then(ok, fout),
            };
            return b;
        },
    };
}

vi.mock('@/lib/supabase-server', () => ({ createServerSupabase: async () => nepClient() }));

import { POST } from './route';

const ID = '77777777-7777-4777-8777-777777777777';
function req(payload: unknown) {
    return { json: async () => payload, url: `http://localhost/api/productie/eenheid/${ID}/verbruik` } as unknown as NextRequest;
}

beforeEach(() => {
    state.calls = [];
    state.eenheid = { id: ID, partij_id: 'p-1', code: 'PP-20260916-01-007', inhoud: 1, eenheid: 'kg', status: 'op_voorraad', productie_partijen: { inventory_id: 93, partijnummer: 'PP-20260916-01', verpakking_eenheid: 'kg' } };
});

describe('verbruik van een eenheid', () => {
    it('verbruikt: status om, één usage-mutatie van −1000 g (kg → g) met partij_id', async () => {
        const res = await POST(req({ reden: 'verbruikt' }));
        const json = await res.json();
        expect(json.ok).toBe(true);
        expect(json.status).toBe('verbruikt');
        const rpc = state.calls.filter((c) => c.table === 'rpc:increment_inventory_stock');
        expect(rpc).toHaveLength(1);
        expect(rpc[0].payload).toMatchObject({ p_inventory_id: 93, p_delta: -1000, p_type: 'usage', p_partij_id: 'p-1' });
        expect(state.calls.some((c) => c.table === 'kds_audit_logs' && (c.payload as { action: string }).action === 'eenheid_verbruikt')).toBe(true);
    });

    it('twee keer scannen boekt één keer af', async () => {
        await POST(req({ reden: 'verbruikt' }));
        const res2 = await POST(req({ reden: 'verbruikt' }));
        const json2 = await res2.json();
        expect(json2.alGedaan).toBe(true);
        expect(state.calls.filter((c) => c.table === 'rpc:increment_inventory_stock')).toHaveLength(1);
    });

    it('afschrijven = waste', async () => {
        await POST(req({ reden: 'afgeschreven', notitie: 'gevallen' }));
        const rpc = state.calls.find((c) => c.table === 'rpc:increment_inventory_stock')!.payload as Record<string, unknown>;
        expect(rpc.p_type).toBe('waste');
        expect(String(rpc.p_note)).toContain('gevallen');
    });

    it('onbekende reden → 400, niets gebeurd', async () => {
        const res = await POST(req({ reden: 'weg' }));
        expect(res.status).toBe(400);
        expect(state.calls.some((c) => c.op === 'rpc' || c.op === 'update')).toBe(false);
    });
});
