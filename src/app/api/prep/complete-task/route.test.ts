/* Tests voor /api/prep/complete-task met partij-blok.
 *
 * Bewaakt:
 *   1. Klaar + partij in één klik: de taak gaat op done én de partij-RPC
 *      krijgt dezelfde idempotency-sleutel als de client stuurde;
 *   2. dubbelklik: de tweede aanroep komt in de alreadyDone-tak en roept de
 *      RPC alsnog aan (idempotent) — nooit een tweede taak-update;
 *   3. een fout partij-blok blokkeert vóór de status-update;
 *   4. zonder partij-blok gedraagt de route zich als voorheen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

interface Call { table: string; op: string; payload?: unknown; filters: [string, unknown][] }
type Antwoord = { data: unknown; error: unknown };
const state: { taak: Record<string, unknown>; calls: Call[]; rpc: unknown } = { taak: {}, calls: [], rpc: null };

function nepClient() {
    return {
        auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
        rpc(naam: string, args: unknown) {
            state.calls.push({ table: `rpc:${naam}`, op: 'rpc', payload: args, filters: [] });
            return Promise.resolve({ data: state.rpc, error: null });
        },
        from(table: string) {
            const call: Call = { table, op: 'select', filters: [] };
            const klaar = (): Promise<Antwoord> => {
                state.calls.push(call);
                if (table === 'organization_members') return Promise.resolve({ data: { organization_id: 'org-1' }, error: null });
                if (table === 'prep_tasks' && call.op === 'select') return Promise.resolve({ data: state.taak, error: null });
                if (table === 'prep_tasks' && call.op === 'update') {
                    const magNog = ['planned', 'queued', 'in_progress', 'blocked'].includes(String(state.taak.status));
                    if (!magNog) return Promise.resolve({ data: null, error: null });
                    state.taak = { ...state.taak, status: 'done', completed_at: '2026-09-16T12:00:00Z' };
                    return Promise.resolve({ data: { id: state.taak.id, status: 'done', completed_at: '2026-09-16T12:00:00Z', actual_qty: 12, phase: 'smoke' }, error: null });
                }
                if (table === 'components') return Promise.resolve({ data: { id: 7, name: 'Pulled pork', verpakking_grootte: 1, verpakking_eenheid: 'kg', bewaarmethode: 'vries', bewaaradvies: null, houdbaarheid_na_bewerking_dagen: 90 }, error: null });
                if (table === 'recipe_steps') return Promise.resolve({ data: { houdbaarheid_na_dagen: null }, error: null });
                if (table === 'personeel') return Promise.resolve({ data: { id: 'pers-1' }, error: null });
                return Promise.resolve({ data: null, error: null });
            };
            const b: Record<string, unknown> = {
                select: () => b,
                insert: (rows: unknown) => { call.op = 'insert'; call.payload = rows; return b; },
                update: (obj: unknown) => { call.op = 'update'; call.payload = obj; return b; },
                eq: (k: string, v: unknown) => { call.filters.push([k, v]); return b; },
                in: (k: string, v: unknown) => { call.filters.push([k, v]); return b; },
                limit: () => b,
                maybeSingle: () => klaar(),
                single: () => klaar(),
                then: (ok: (a: Antwoord) => unknown, fout?: (e: unknown) => unknown) => klaar().then(ok, fout),
            };
            return b;
        },
    };
}

vi.mock('@/lib/supabase-server', () => ({ createServerSupabase: async () => nepClient() }));
vi.mock('@/lib/keukenplanner/meting', () => ({ schrijfMeting: async () => ({ gemeten: false }) }));
vi.mock('@/lib/keukenplanner/bijstellen', () => ({ stelBij: async () => null }));

import { POST } from './route';

const KEY = '11111111-1111-4111-8111-111111111111';
const BLOK = { idempotencyKey: KEY, actualQty: 12, eenheid: 'kg' };

function req(payload: unknown) {
    return { json: async () => payload } as unknown as NextRequest;
}

beforeEach(() => {
    state.calls = [];
    state.taak = { id: 42, organization_id: 'org-1', status: 'in_progress', phase: 'smoke', target_qty: 12, target_unit: 'kg', gerecht_id: null, event_id: 5, assignee_id: 'pers-9', started_at: '2026-09-16T08:00:00Z', recipe_step_id: null, schoonmaaktaak_id: null, bewerking_code: null, component_id: 7, stuk_gewicht_kg: null };
    state.rpc = { bestond: false, partij: { id: 'p-1', partijnummer: 'PP-20260916-01', aantal_eenheden: 12 }, eenheden: [] };
});

describe('complete-task met partij', () => {
    it('klaar + partij in één klik: taak done, RPC met dezelfde sleutel en 12 eenheden', async () => {
        const res = await POST(req({ taskId: 42, actualQty: 12, onderbroken: false, partij: BLOK }));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.ok).toBe(true);
        expect(json.task.status).toBe('done');
        expect(json.partij.partijnummer).toBe('PP-20260916-01');

        const rpc = state.calls.filter((c) => c.table === 'rpc:productie_partij_afronden');
        expect(rpc).toHaveLength(1);
        const args = rpc[0].payload as Record<string, unknown>;
        expect(args.p_idempotency_key).toBe(KEY);
        expect(args.p_prep_task_id).toBe(42);
        expect((args.p_eenheden as unknown[]).length).toBe(12);
        expect(args.p_personeel_id).toBe('pers-9');
        expect(state.calls.filter((c) => c.table === 'prep_tasks' && c.op === 'update')).toHaveLength(1);
    });

    it('dubbelklik: tweede aanroep = alreadyDone, géén tweede taak-update, RPC alsnog (idempotent)', async () => {
        await POST(req({ taskId: 42, actualQty: 12, onderbroken: false, partij: BLOK }));
        state.rpc = { bestond: true, partij: { id: 'p-1', partijnummer: 'PP-20260916-01', aantal_eenheden: 12 }, eenheden: [] };
        const res2 = await POST(req({ taskId: 42, actualQty: 12, onderbroken: false, partij: BLOK }));
        const json2 = await res2.json();
        expect(json2.alreadyDone).toBe(true);
        expect(json2.partij.bestond).toBe(true);
        expect(json2.partij.partijnummer).toBe('PP-20260916-01');

        const updates = state.calls.filter((c) => c.table === 'prep_tasks' && c.op === 'update');
        expect(updates).toHaveLength(1);
        const rpc = state.calls.filter((c) => c.table === 'rpc:productie_partij_afronden');
        expect(rpc).toHaveLength(2);
        expect((rpc[1].payload as Record<string, unknown>).p_idempotency_key).toBe(KEY);
        /* audit alleen voor de eerste (nieuwe) partij */
        expect(state.calls.filter((c) => c.table === 'kds_audit_logs' && (c.payload as { action: string }).action === 'partij_aangemaakt')).toHaveLength(1);
    });

    it('fout partij-blok blokkeert vóór de status-update', async () => {
        const res = await POST(req({ taskId: 42, actualQty: 12, onderbroken: false, partij: { idempotencyKey: 'nope', actualQty: 12, eenheid: 'kg' } }));
        expect(res.status).toBe(400);
        expect(state.calls.some((c) => c.table === 'prep_tasks' && c.op === 'update')).toBe(false);
        expect(state.calls.some((c) => c.op === 'rpc')).toBe(false);
    });

    it('zonder partij-blok: als voorheen, geen RPC', async () => {
        const res = await POST(req({ taskId: 42, actualQty: 12, onderbroken: false }));
        const json = await res.json();
        expect(json.ok).toBe(true);
        expect(json.partij).toBeNull();
        expect(state.calls.some((c) => c.op === 'rpc')).toBe(false);
    });
});
