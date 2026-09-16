/* Tests voor /api/labels/jobs — de enige plek waar een printjob ontstaat.
 *
 * Wat hier bewaakt wordt:
 *   1. een printjob raakt NOOIT voorraad: geen rpc, geen inventory, geen
 *      stock_movements — alleen een rij in print_jobs;
 *   2. de ZPL wordt op de server gerenderd en op de job bewaard;
 *   3. een los label mag een aantal hebben (het hangt aan niets), maar is
 *      begrensd; partij-labels zijn in fase 0 nog niet beschikbaar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

interface Call {
    table: string;
    op: 'select' | 'insert' | 'update' | 'delete' | 'rpc';
    payload?: unknown;
    filters: [string, unknown][];
}
type Antwoord = { data: unknown; error: unknown };
type Handler = (call: Call) => Antwoord;

const state: { handler: Handler; calls: Call[] } = { handler: () => ({ data: null, error: null }), calls: [] };

function nepClient() {
    return {
        auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
        rpc(naam: string, args: unknown) {
            const call: Call = { table: `rpc:${naam}`, op: 'rpc', payload: args, filters: [] };
            state.calls.push(call);
            return Promise.resolve(state.handler(call));
        },
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
/* De labeldata van een partij komt uit de database-laag; hier gaat het om wat
   de route NIET doet (voorraad aanraken), dus die laag is nagebouwd. */
vi.mock('@/lib/productie/labels', () => ({
    scanBasisUrl: () => 'https://app.test',
    laadPartijLabels: async (_sb: unknown, _org: string, keuze: { soort: string; eenheidIds?: string[] | null }) => ({
        ok: true,
        partijId: '33333333-3333-4333-8333-333333333333',
        eenheidIds: keuze.eenheidIds ?? ['44444444-4444-4444-8444-444444444444'],
        verzoek: {
            soort: keuze.soort,
            labels: (keuze.eenheidIds ?? ['44444444-4444-4444-8444-444444444444']).map((id, i) => ({
                eenheidId: id,
                data: { naam: 'Pulled pork', inhoud: '1,00 kg', productiedatum: '2026-09-16', tht: null, partijnummer: 'PP-20260916-01', unitNr: i + 1, unitTotaal: 12, bewaaradvies: null, allergenen: [], qrUrl: `https://app.test/scan/${id}`, eenheidCode: `PP-${i + 1}` },
            })),
        },
    }),
}));

import { POST } from './route';

const PRINTER = {
    id: '11111111-1111-4111-8111-111111111111', naam: 'Keuken Tramstraat', transport: 'browser_print',
    device_uid: 'AC:3F:A4:12:34:56', model: 'ZQ630 Plus', dpi: 203, label_breedte_mm: 60, label_hoogte_mm: 40, actief: true,
};

function req(payload: unknown) {
    return { json: async () => payload, url: 'http://localhost/api/labels/jobs' } as unknown as NextRequest;
}

function standaardHandler(): Handler {
    return (call) => {
        if (call.table === 'organization_members') return { data: { organization_id: 'org-1' }, error: null };
        if (call.table === 'label_printers') return { data: PRINTER, error: null };
        if (call.table === 'print_jobs' && call.op === 'insert') {
            const rij = call.payload as Record<string, unknown>;
            return { data: { id: '22222222-2222-4222-8222-222222222222', ...rij, zpl: undefined }, error: null };
        }
        return { data: null, error: null };
    };
}

beforeEach(() => {
    state.calls = [];
    state.handler = standaardHandler();
});

describe('POST /api/labels/jobs', () => {
    it('los label × 3: één print_jobs-rij met drie labels, en géén voorraadmutatie', async () => {
        const res = await POST(req({ soort: 'los_label', printerId: PRINTER.id, naam: 'Suiker', aantal: 3 }));
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.labels).toHaveLength(3);
        expect(json.job.aantal_labels).toBe(3);
        expect(json.job.soort).toBe('los_label');
        expect(json.job.template_code).toBe('los');

        const insert = state.calls.find((c) => c.table === 'print_jobs' && c.op === 'insert');
        expect(insert).toBeDefined();
        const rij = insert!.payload as Record<string, unknown>;
        expect(rij.organization_id).toBe('org-1');
        expect(rij.status).toBe('pending');
        expect(String(rij.zpl)).toContain('Suiker');
        expect((String(rij.zpl).match(/\^XA/g) ?? []).length).toBe(3);

        /* De kern: niets aan voorraad. */
        expect(state.calls.some((c) => c.op === 'rpc')).toBe(false);
        expect(state.calls.some((c) => c.table === 'inventory' || c.table === 'stock_movements')).toBe(false);
    });

    it('testlabel: één label, naam van de printer erop', async () => {
        const res = await POST(req({ soort: 'testlabel', printerId: PRINTER.id }));
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.labels).toHaveLength(1);
        expect(json.labels[0].zpl).toContain('Keuken Tramstraat');
        expect(json.labels[0].eenheidId).toBeNull();
    });

    it('weigert een onbekende printer', async () => {
        state.handler = (call) => {
            if (call.table === 'organization_members') return { data: { organization_id: 'org-1' }, error: null };
            return { data: null, error: null };
        };
        const res = await POST(req({ soort: 'testlabel', printerId: PRINTER.id }));
        expect(res.status).toBe(404);
        expect(state.calls.some((c) => c.table === 'print_jobs')).toBe(false);
    });

    it('weigert een inactieve printer', async () => {
        state.handler = (call) => {
            if (call.table === 'organization_members') return { data: { organization_id: 'org-1' }, error: null };
            if (call.table === 'label_printers') return { data: { ...PRINTER, actief: false }, error: null };
            return { data: null, error: null };
        };
        const res = await POST(req({ soort: 'testlabel', printerId: PRINTER.id }));
        expect(res.status).toBe(409);
    });

    it('valideert: aantal boven de grens, lege naam, ontbrekende printer', async () => {
        expect((await POST(req({ soort: 'los_label', printerId: PRINTER.id, naam: 'Suiker', aantal: 999 }))).status).toBe(400);
        expect((await POST(req({ soort: 'los_label', printerId: PRINTER.id, naam: '', aantal: 1 }))).status).toBe(400);
        expect((await POST(req({ soort: 'testlabel' }))).status).toBe(400);
        expect(state.calls.some((c) => c.table === 'print_jobs')).toBe(false);
    });

    it('herprint van eenheid 007: nieuwe job met soort=herprint, géén voorraadmutatie', async () => {
        const id = '77777777-7777-4777-8777-777777777777';
        const res = await POST(req({ soort: 'herprint', printerId: PRINTER.id, eenheidIds: [id] }));
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.job.soort).toBe('herprint');
        expect(json.job.partij_id).toBe('33333333-3333-4333-8333-333333333333');
        expect(json.labels).toHaveLength(1);
        expect(json.labels[0].eenheidId).toBe(id);
        expect(json.labels[0].zpl).toContain(`https://app.test/scan/${id}`);

        expect(state.calls.some((c) => c.op === 'rpc')).toBe(false);
        expect(state.calls.some((c) => c.table === 'inventory' || c.table === 'stock_movements' || c.table === 'productie_partijen')).toBe(false);
    });

    it('partij-labels: aantal labels = aantal eenheden uit de partij, nooit uit de body', async () => {
        const res = await POST(req({ soort: 'partij_labels', printerId: PRINTER.id, partijId: '33333333-3333-4333-8333-333333333333', aantal: 99 }));
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.job.aantal_labels).toBe(1);
        expect(json.job.soort).toBe('partij_labels');
    });
});
