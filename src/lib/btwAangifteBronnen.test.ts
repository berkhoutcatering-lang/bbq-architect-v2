import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { laadKassa, laadBonnen, nlDatum } from './btwAangifteBronnen';

/* Minimale nep-Supabase: filtert rijen in het geheugen zoals PostgREST dat
   zou doen. `kolomFout` laat een select met die kolom falen (42703), zoals de
   echte database doet als een migratie nog niet gedraaid is. */
type Rij = Record<string, unknown>;
function nepSupabase(tabellen: Record<string, Rij[]>, opts: { kolomFout?: string; tabelFout?: string } = {}) {
    return {
        from(tabel: string) {
            let rijen = [...(tabellen[tabel] ?? [])];
            let kolommen = '*';
            let van = 0, tot = Infinity;
            const b = {
                select(k: string) { kolommen = k; return b; },
                eq(k: string, v: unknown) { rijen = rijen.filter(r => r[k] === v); return b; },
                gte(k: string, v: string) { rijen = rijen.filter(r => String(r[k]) >= v); return b; },
                lte(k: string, v: string) { rijen = rijen.filter(r => String(r[k]) <= v); return b; },
                lt(k: string, v: string) { rijen = rijen.filter(r => String(r[k]) < v); return b; },
                in(k: string, vs: unknown[]) { rijen = rijen.filter(r => vs.includes(r[k])); return b; },
                order() { return b; },
                range(a: number, z: number) { van = a; tot = z; return b; },
                then(ok: (v: unknown) => unknown) {
                    if (opts.tabelFout === tabel) {
                        return Promise.resolve({ data: null, error: { message: 'relation does not exist', code: '42P01' } }).then(ok);
                    }
                    if (opts.kolomFout && kolommen.includes(opts.kolomFout)) {
                        return Promise.resolve({ data: null, error: { message: `column bonnen.${opts.kolomFout} does not exist`, code: '42703' } }).then(ok);
                    }
                    return Promise.resolve({ data: rijen.slice(van, tot + 1), error: null }).then(ok);
                },
            };
            return b;
        },
    } as unknown as SupabaseClient;
}

const ORG = 'org-1';

describe('nlDatum', () => {
    it('zet een UTC-tijdstip om naar de Nederlandse kalenderdag', () => {
        /* 30 sep 23:30 UTC = 1 okt 01:30 in Nederland (zomertijd). */
        expect(nlDatum('2026-09-30T23:30:00Z')).toBe('2026-10-01');
        expect(nlDatum('2026-08-29T14:00:00Z')).toBe('2026-08-29');
    });
});

describe('laadKassa', () => {
    /* Kolomnamen zoals live vastgesteld op 2026-10-26: org_id, name, voided_at, refunded_at. */
    const orders: Rij[] = [
        { id: 1, org_id: ORG, status: 'served', created_at: '2026-08-29T12:00:00Z', paid_at: '2026-08-29T12:01:00Z' },
        { id: 2, org_id: ORG, status: 'voided', created_at: '2026-08-29T12:05:00Z' },
        { id: 3, org_id: ORG, status: 'served', created_at: '2026-08-30T12:00:00Z', refunded_at: '2026-08-30T13:00:00Z' },
        { id: 4, org_id: 'andere-org', status: 'served', created_at: '2026-08-29T12:00:00Z' },
        { id: 5, org_id: ORG, status: 'served', created_at: '2026-09-30T23:30:00Z' }, /* = 1 okt NL */
        { id: 6, org_id: ORG, status: 'placed', created_at: '2026-08-28T09:00:00Z' }, /* testbestelling, niet betaald */
    ];
    const items: Rij[] = [
        { id: 10, order_id: 1, org_id: ORG, name: 'Pulled pork', btw_rate: 9, line_excl_cents: 596, line_btw_cents: 54 },
        { id: 11, order_id: 1, org_id: ORG, name: 'Bier', btw_rate: 21, line_excl_cents: 300, line_btw_cents: 63 },
        { id: 12, order_id: 2, org_id: ORG, name: 'Pulled pork', btw_rate: 9, line_excl_cents: 596, line_btw_cents: 54 },
        { id: 13, order_id: 3, org_id: ORG, name: 'Pulled pork', btw_rate: 9, line_excl_cents: 596, line_btw_cents: 54 },
        { id: 14, order_id: 5, org_id: ORG, name: 'Pulled pork', btw_rate: 9, line_excl_cents: 596, line_btw_cents: 54 },
        { id: 15, order_id: 6, org_id: ORG, name: 'Test', btw_rate: 9, line_excl_cents: 92, line_btw_cents: 8 },
    ];

    it('telt geannuleerde en terugbetaalde bonnen niet, en ook geen andere organisatie of periode', async () => {
        const sb = nepSupabase({ pos_orders: orders, pos_order_items: items });
        const r = await laadKassa(sb, ORG, '2026-07-01', '2026-09-30');
        expect(r.fout).toBeNull();
        expect(r.regels).toEqual([
            { datum: '2026-08-29', btw_pct: 9, omzet: 5.96, btw: 0.54, omschrijving: 'Pulled pork', referentie: 'kassa #1' },
            { datum: '2026-08-29', btw_pct: 21, omzet: 3, btw: 0.63, omschrijving: 'Bier', referentie: 'kassa #1' },
            { datum: '2026-08-28', btw_pct: 9, omzet: 0.92, btw: 0.08, omschrijving: 'Test', referentie: 'kassa #6' },
        ]);
        expect(r.statussen).toEqual({ served: 2, voided: 1, placed: 1 });
    });

    it('filtert testbestellingen NIET vanzelf weg, maar toont ze per dag', async () => {
        const sb = nepSupabase({ pos_orders: orders, pos_order_items: items });
        const r = await laadKassa(sb, ORG, '2026-07-01', '2026-09-30');
        expect(r.dagen).toEqual([
            { datum: '2026-08-28', orders: 1, betaald: 0, omzet: 0.92, btw: 0.08, uitgesloten: false },
            { datum: '2026-08-29', orders: 1, betaald: 1, omzet: 8.96, btw: 1.17, uitgesloten: false },
        ]);
    });

    it('een dag op "telt niet mee" blijft zichtbaar maar levert geen regels', async () => {
        const sb = nepSupabase({
            pos_orders: orders,
            pos_order_items: items,
            btw_kassa_uitsluitingen: [{ organization_id: ORG, datum: '2026-08-28' }],
        });
        const r = await laadKassa(sb, ORG, '2026-07-01', '2026-09-30');
        expect(r.regels.some(x => x.datum === '2026-08-28')).toBe(false);
        expect(r.dagen.find(d => d.datum === '2026-08-28')?.uitgesloten).toBe(true);
        expect(r.uitsluiten_beschikbaar).toBe(true);
    });

    it('zonder uitsluitingentabel telt alles mee', async () => {
        const sb = nepSupabase({ pos_orders: orders, pos_order_items: items }, { tabelFout: 'btw_kassa_uitsluitingen' });
        const r = await laadKassa(sb, ORG, '2026-07-01', '2026-09-30');
        expect(r.fout).toBeNull();
        expect(r.uitsluiten_beschikbaar).toBe(false);
        expect(r.regels).toHaveLength(3);
    });

    it('meldt een fout in plaats van stil € 0 als de kassa niet te lezen is', async () => {
        const sb = nepSupabase({}, { tabelFout: 'pos_orders' });
        const r = await laadKassa(sb, ORG, '2026-07-01', '2026-09-30');
        expect(r.regels).toEqual([]);
        expect(r.fout).toMatch(/Kassa niet te lezen/);
    });

    it('meldt een fout als de kassaregels de verwachte bedragvelden missen', async () => {
        const sb = nepSupabase({
            pos_orders: [orders[0]],
            pos_order_items: [{ id: 10, order_id: 1, org_id: ORG, name: 'x', prijs: 6.5 }],
        });
        const r = await laadKassa(sb, ORG, '2026-07-01', '2026-09-30');
        expect(r.fout).toMatch(/line_excl_cents/);
    });
});

describe('laadBonnen', () => {
    const bonnen: Rij[] = [
        { id: 1, organization_id: ORG, datum: '2026-08-04', totaal_bedrag: 144, btw_verlegd: 'buiten_eu', leveranciers: { naam: 'Wispr' } },
    ];

    it('leest btw_verlegd en de leveranciersnaam', async () => {
        const r = await laadBonnen(nepSupabase({ bonnen }), ORG, '2026-07-01', '2026-09-30');
        expect(r.fout).toBeNull();
        expect(r.verlegd_beschikbaar).toBe(true);
        expect(r.bonnen[0].btw_verlegd).toBe('buiten_eu');
        expect(r.bonnen[0].leverancier_naam).toBe('Wispr');
    });

    it('werkt door zonder btw_verlegd als de migratie nog niet gedraaid is', async () => {
        const r = await laadBonnen(nepSupabase({ bonnen }, { kolomFout: 'btw_verlegd' }), ORG, '2026-07-01', '2026-09-30');
        expect(r.fout).toBeNull();
        expect(r.verlegd_beschikbaar).toBe(false);
        expect(r.bonnen).toHaveLength(1);
    });
});
