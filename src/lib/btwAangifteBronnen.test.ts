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
    const orders: Rij[] = [
        { id: 1, organization_id: ORG, status: 'paid', created_at: '2026-08-29T12:00:00Z' },
        { id: 2, organization_id: ORG, status: 'voided', created_at: '2026-08-29T12:05:00Z' },
        { id: 3, organization_id: ORG, status: 'refunded', created_at: '2026-08-30T12:00:00Z' },
        { id: 4, organization_id: 'andere-org', status: 'paid', created_at: '2026-08-29T12:00:00Z' },
        { id: 5, organization_id: ORG, status: 'paid', created_at: '2026-09-30T23:30:00Z' }, /* = 1 okt NL */
    ];
    const items: Rij[] = [
        { id: 10, order_id: 1, product_name: 'Pulled pork', btw_rate: 9, line_excl_cents: 596, line_btw_cents: 54 },
        { id: 11, order_id: 1, product_name: 'Bier', btw_rate: 0.21, line_excl_cents: 300, line_btw_cents: 63 },
        { id: 12, order_id: 2, product_name: 'Pulled pork', btw_rate: 9, line_excl_cents: 596, line_btw_cents: 54 },
        { id: 13, order_id: 3, product_name: 'Pulled pork', btw_rate: 9, line_excl_cents: 596, line_btw_cents: 54 },
        { id: 14, order_id: 5, product_name: 'Pulled pork', btw_rate: 9, line_excl_cents: 596, line_btw_cents: 54 },
    ];

    it('telt alleen niet-geannuleerde bonnen van deze organisatie in de periode', async () => {
        const sb = nepSupabase({ pos_orders: orders, pos_order_items: items });
        const r = await laadKassa(sb, ORG, '2026-07-01', '2026-09-30');
        expect(r.fout).toBeNull();
        expect(r.regels).toEqual([
            { datum: '2026-08-29', btw_pct: 9, omzet: 5.96, btw: 0.54, omschrijving: 'Pulled pork', referentie: 'kassa #1' },
            { datum: '2026-08-29', btw_pct: 21, omzet: 3, btw: 0.63, omschrijving: 'Bier', referentie: 'kassa #1' },
        ]);
        expect(r.statussen).toEqual({ paid: 1, voided: 1, refunded: 1 });
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
            pos_order_items: [{ id: 10, order_id: 1, product_name: 'x', prijs: 6.5 }],
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
