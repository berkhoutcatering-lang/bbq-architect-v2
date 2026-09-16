/* rondPartijAf — de ene weg naar een partij.
 *
 * Bewaakt:
 *   1. 12 kg met verpakking 1 kg → RPC krijgt exact 12 eenheden;
 *   2. zonder verpakking op component én invoer: 409, geen RPC;
 *   3. verpakking die de kok voor het eerst invult, wordt op het component bewaard;
 *   4. bestaande partij (RPC zegt bestond=true) → geen audit, geen component-update;
 *   5. dezelfde idempotency-sleutel gaat ongewijzigd naar de RPC.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rondPartijAf } from './afronden';

interface Call { table: string; op: string; payload?: unknown; filters: [string, unknown][] }
const state: { component: Record<string, unknown> | null; rpcAntwoord: unknown; calls: Call[] } = { component: null, rpcAntwoord: null, calls: [] };

function nep(): SupabaseClient {
    return {
        rpc(naam: string, args: unknown) {
            state.calls.push({ table: `rpc:${naam}`, op: 'rpc', payload: args, filters: [] });
            return Promise.resolve({ data: state.rpcAntwoord, error: null });
        },
        from(table: string) {
            const call: Call = { table, op: 'select', filters: [] };
            const klaar = () => {
                state.calls.push(call);
                if (table === 'components' && call.op === 'select') return Promise.resolve({ data: state.component, error: null });
                return Promise.resolve({ data: null, error: null });
            };
            const b: Record<string, unknown> = {
                select: () => b,
                insert: (rows: unknown) => { call.op = 'insert'; call.payload = rows; return b; },
                update: (obj: unknown) => { call.op = 'update'; call.payload = obj; return b; },
                eq: (k: string, v: unknown) => { call.filters.push([k, v]); return b; },
                maybeSingle: () => klaar(),
                single: () => klaar(),
                then: (ok: (a: unknown) => unknown, fout?: (e: unknown) => unknown) => klaar().then(ok, fout),
            };
            return b;
        },
    } as unknown as SupabaseClient;
}

const CTX = { orgId: 'org-1', userId: 'user-1' };
const KEY = '11111111-1111-4111-8111-111111111111';
const PARTIJ = { id: 'p-1', partijnummer: 'PP-20260916-01', component_id: 7, aantal_eenheden: 12 };

beforeEach(() => {
    state.calls = [];
    state.component = { id: 7, name: 'Pulled pork', verpakking_grootte: 1, verpakking_eenheid: 'kg', bewaarmethode: 'vries', bewaaradvies: 'max. -18 °C', houdbaarheid_na_bewerking_dagen: 90 };
    state.rpcAntwoord = { bestond: false, partij: PARTIJ, eenheden: Array.from({ length: 12 }, (_, i) => ({ id: `e${i + 1}`, volgnummer: i + 1 })) };
});

describe('rondPartijAf', () => {
    it('12 kg → RPC met exact 12 eenheden, THT uit het component, audit erna', async () => {
        const r = await rondPartijAf(nep(), CTX, { componentId: 7, idempotencyKey: KEY, actualQty: 12, eenheid: 'kg', prepTaskId: 42, productiedatum: '2026-09-16' });
        expect(r.ok).toBe(true);
        const rpc = state.calls.find((c) => c.table === 'rpc:productie_partij_afronden');
        expect(rpc).toBeDefined();
        const args = rpc!.payload as Record<string, unknown>;
        expect(args.p_idempotency_key).toBe(KEY);
        expect(args.p_prep_task_id).toBe(42);
        expect((args.p_eenheden as unknown[]).length).toBe(12);
        expect(args.p_tht).toBe('2026-12-15');
        expect(args.p_verpakking_grootte).toBe(1);
        expect(args.p_bewaaradvies).toBe('max. -18 °C');
        const audit = state.calls.find((c) => c.table === 'kds_audit_logs' && c.op === 'insert');
        expect(audit).toBeDefined();
        expect((audit!.payload as Record<string, unknown>).action).toBe('partij_aangemaakt');
        /* component had alles al: geen update */
        expect(state.calls.some((c) => c.table === 'components' && c.op === 'update')).toBe(false);
    });

    it('geen verpakking bekend → 409 en géén RPC', async () => {
        state.component = { ...state.component!, verpakking_grootte: null, verpakking_eenheid: null };
        const r = await rondPartijAf(nep(), CTX, { componentId: 7, idempotencyKey: KEY, actualQty: 12, eenheid: 'kg' });
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.status).toBe(409); expect(r.code).toBe('verpakking_ontbreekt'); }
        expect(state.calls.some((c) => c.op === 'rpc')).toBe(false);
    });

    it('verpakking uit de sheet wordt op het component bewaard', async () => {
        state.component = { ...state.component!, verpakking_grootte: null, verpakking_eenheid: null, bewaaradvies: null };
        const r = await rondPartijAf(nep(), CTX, { componentId: 7, idempotencyKey: KEY, actualQty: 6, eenheid: 'kg', verpakkingGrootte: 0.5, verpakkingEenheid: 'kg', bewaaradvies: 'max. 4 °C' });
        expect(r.ok).toBe(true);
        const upd = state.calls.find((c) => c.table === 'components' && c.op === 'update');
        expect(upd?.payload).toEqual({ verpakking_grootte: 0.5, verpakking_eenheid: 'kg', bewaaradvies: 'max. 4 °C' });
        const rpc = state.calls.find((c) => c.op === 'rpc')!.payload as Record<string, unknown>;
        expect((rpc.p_eenheden as unknown[]).length).toBe(12);
    });

    it('kok corrigeert het aantal: 12,4 kg in 13 → 13 eenheden, gelogd als gecorrigeerd', async () => {
        await rondPartijAf(nep(), CTX, { componentId: 7, idempotencyKey: KEY, actualQty: 12.4, eenheid: 'kg', aantalEenheden: 13 });
        const rpc = state.calls.find((c) => c.op === 'rpc')!.payload as Record<string, unknown>;
        expect((rpc.p_eenheden as unknown[]).length).toBe(13);
        const audit = state.calls.find((c) => c.table === 'kds_audit_logs')!.payload as Record<string, Record<string, unknown>>;
        expect(audit.metadata.aantal_gecorrigeerd).toBe(true);
    });

    it('bestaande partij (dubbelklik): geen audit, geen wijziging', async () => {
        state.rpcAntwoord = { bestond: true, partij: PARTIJ, eenheden: [] };
        const r = await rondPartijAf(nep(), CTX, { componentId: 7, idempotencyKey: KEY, actualQty: 12, eenheid: 'kg' });
        expect(r.ok && r.bestond).toBe(true);
        expect(state.calls.some((c) => c.table === 'kds_audit_logs')).toBe(false);
    });

    it('stuks in een kilo-verpakking is een fout, geen partij', async () => {
        const r = await rondPartijAf(nep(), CTX, { componentId: 7, idempotencyKey: KEY, actualQty: 12, eenheid: 'stuk' });
        expect(r.ok).toBe(false);
        expect(state.calls.some((c) => c.op === 'rpc')).toBe(false);
    });
});

