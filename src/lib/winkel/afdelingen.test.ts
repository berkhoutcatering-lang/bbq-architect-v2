import { describe, expect, it } from 'vitest';
import {
    afdelingTegels, datumGroepen, datumNL, dagenTot, productCijfers, productVanRegel, regelsPerProduct, trendVan, urgentie,
    type Afdeling, type BonRegelRij, type StukRij, type WinkelProductRij,
} from './afdelingen';

const nu = new Date('2026-11-25T15:00:00+01:00');
const dagenTerug = (n: number) => new Date(nu.getTime() - n * 86_400_000).toISOString();
const regel = (product: string | string[], aantal: number, cents: number, terug: number): BonRegelRij => ({
    aantal, bedrag_cents: cents, op: dagenTerug(terug),
    onderdelen: (Array.isArray(product) ? product : [product]).map((p) => ({ product_id: p })),
});
const product = (id: string, actief = true): WinkelProductRij => ({ id, naam: id, type: 'overig', actief, eenheid: 'stuk', voorraad: null, tht: null, foto: null });
const stuk = (id: string, product_id: string, tht: string, status = 'op_voorraad'): StukRij => ({ id, product_id, code: id, tht, status, gewicht_g: 100, prijs_cents: 500, partij_id: null });

describe('datums', () => {
    it('vandaag in Nederlandse tijd, ook vlak na middernacht UTC', () => {
        expect(datumNL(new Date('2026-11-24T23:30:00Z'))).toBe('2026-11-25');
    });
    it('urgentie: over, vandaag, morgen, bijna (2 dagen), later', () => {
        expect(urgentie('2026-11-24', '2026-11-25')).toBe('over');
        expect(urgentie('2026-11-25', '2026-11-25')).toBe('vandaag');
        expect(urgentie('2026-11-26', '2026-11-25')).toBe('morgen');
        expect(urgentie('2026-11-27', '2026-11-25')).toBe('bijna');
        expect(urgentie('2026-11-28', '2026-11-25')).toBe('later');
        expect(dagenTot('2026-03-30', '2026-03-28')).toBe(2); // over de zomertijd heen
    });
});

describe('regels', () => {
    it('één product = dat product; een pakket of open prijs = geen', () => {
        expect(productVanRegel({ onderdelen: [{ product_id: 'a' }] })).toBe('a');
        expect(productVanRegel({ onderdelen: [{ product_id: 'a' }, { product_id: 'a' }] })).toBe('a');
        expect(productVanRegel({ onderdelen: [{ product_id: 'a' }, { product_id: 'b' }] })).toBeNull();
        expect(productVanRegel({ onderdelen: [] })).toBeNull();
        const { perProduct, pakketten } = regelsPerProduct([regel('a', 1, 100, 1), regel(['a', 'b'], 1, 900, 1)]);
        expect(perProduct.get('a')).toHaveLength(1);
        expect(pakketten).toHaveLength(1);
    });
    it('productcijfers: 7 en 28 dagen, tegenbon negatief, laatste verkoop', () => {
        const c = productCijfers([regel('a', 2, 700, 1), regel('a', -1, -350, 2), regel('a', 3, 1050, 10), regel('a', 1, 350, 40)], nu);
        expect(c).toMatchObject({ verkocht7: 1, omzet7_cents: 350, verkocht28: 4, omzet28_cents: 1400 });
        expect(c.laatsteVerkoop).toBe(dagenTerug(1));
    });
    it('trend: binnen 5 % (minstens € 1) gelijk, zonder verkoop geen pijl', () => {
        expect(trendVan(0, 0)).toBeNull();
        expect(trendVan(10_000, 9_800)).toBe('gelijk');
        expect(trendVan(12_000, 10_000)).toBe('op');
        expect(trendVan(500, 2_000)).toBe('neer');
        expect(trendVan(150, 0)).toBe('op');
    });
});

describe('afdelingTegels', () => {
    const afd: Afdeling[] = [
        { id: 'vlees', code: 'WINKEL-VLEES', naam: 'Vlees (slager)', volgorde: 5 },
        { id: 'kaas', code: 'WINKEL-KAZEN', naam: 'Kazen', volgorde: 4 },
    ];
    const plaatsingen = [
        { product_id: 'nagelhout', locatie_id: 'vlees' },
        { product_id: 'riblap', locatie_id: 'vlees' },
        { product_id: 'oud', locatie_id: 'kaas' },
        { product_id: 'weg', locatie_id: 'kaas' },
        { product_id: 'nagelhout', locatie_id: 'lade-makerij' },
    ];
    const producten = [product('nagelhout'), product('riblap'), product('oud'), product('weg', false)];
    const regels = [
        regel('nagelhout', 1, 695, 1), regel('nagelhout', 1, 712, 3), regel('riblap', 1, 1953, 9),
        regel('oud', 1, 1028, 2), regel(['oud', 'nagelhout'], 1, 2500, 1),
    ];
    const stuks = [
        stuk('s1', 'nagelhout', '2026-11-26'), stuk('s2', 'nagelhout', '2026-11-24'), stuk('s3', 'riblap', '2026-12-05'),
        stuk('s4', 'riblap', '2026-11-25', 'verkocht'), stuk('s5', 'oud', '2026-11-27'),
    ];
    const t = afdelingTegels(afd, plaatsingen, producten, regels, stuks, nu);

    it('volgorde van de winkel; alleen actieve producten tellen', () => {
        expect(t.map((x) => x.afdeling.id)).toEqual(['kaas', 'vlees']);
        expect(t[0]!.producten).toBe(1);
        expect(t[1]!.producten).toBe(2);
    });
    it('omzet 7 dagen tegen de 7 dagen ervoor; pakket telt niet mee', () => {
        expect(t[1]).toMatchObject({ omzet7_cents: 1407, omzetVorige7_cents: 1953, verkocht7: 2, trend: 'neer' });
        expect(t[0]).toMatchObject({ omzet7_cents: 1028, omzetVorige7_cents: 0, trend: 'op' });
    });
    it('bijna en over alleen van stuks die nog liggen', () => {
        expect(t[1]).toMatchObject({ bijna: 1, over: 1 });
        expect(t[0]).toMatchObject({ bijna: 1, over: 0 });
    });
    it('datumgroepen per product en THT, vroegste eerst; alleen urgent', () => {
        const g = datumGroepen(stuks, nu, true);
        expect(g.map((x) => [x.product_id, x.tht, x.urgentie])).toEqual([
            ['nagelhout', '2026-11-24', 'over'], ['nagelhout', '2026-11-26', 'morgen'], ['oud', '2026-11-27', 'bijna'],
        ]);
        expect(datumGroepen(stuks, nu)).toHaveLength(4);
    });
});
