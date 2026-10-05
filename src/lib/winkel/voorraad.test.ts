/**
 * Winkelvoorraad — de rekenregels (plan docs/voorraad-bouwplan.md §3, W1/W2/W4).
 * Het Bierpakket € 35 zoals in de seed: 5 bier, 1 worst, 150 g amandelen,
 * 1 bakje crackers, 1 doos.
 */
import { describe, expect, it } from 'vitest';
import type { Product, Slot } from './rekenen';
import { beperkendProduct, beschikbaar, drempelVoorstel, geldendeDrempel, hoeveelheidKort, pakkettenTeMaken, voorraadFout, voorraadstatus, waardeCenten } from './voorraad';

const slot = (id: string, artikel_id: string, naam: string, hoeveelheid: number, product: string | null, extra: Partial<Slot> = {}): Slot =>
    ({ id, artikel_id, volgorde: 0, slot_type: 'overig', naam, hoeveelheid, eenheid: 'stuk', per: 'stuk', standaard_product_id: product, wisselbaar: false, alternatieven: [], ...extra });

const slots: Slot[] = [
    slot('b1', 'bier-35', 'Bier', 5, 'p-bier'),
    slot('b2', 'bier-35', 'Droge worst', 1, 'p-worst'),
    slot('b3', 'bier-35', 'BBQ-amandelen', 150, 'p-amandel', { eenheid: 'gram' }),
    slot('b4', 'bier-35', 'Crackers', 1, 'p-cracker'),
    slot('b5', 'bier-35', 'Doos', 1, 'p-doos'),
    /* Bier € 50: 4 bier + 1 Mr. Hop, 2 worst, 200 g amandelen. */
    slot('c1', 'bier-50', 'Bier', 4, 'p-bier'),
    slot('c2', 'bier-50', 'Mr. Hop', 1, 'p-mrhop'),
    slot('c3', 'bier-50', 'Droge worst', 2, 'p-worst'),
    slot('c4', 'bier-50', 'BBQ-amandelen', 200, 'p-amandel', { eenheid: 'gram' }),
    /* Nog niet af: een slot zonder product. */
    slot('d1', 'bier-20', 'Voordelig bier', 1, null),
    slot('d2', 'bier-20', 'Droge worst', 1, 'p-worst'),
];

type P = Pick<Product, 'id' | 'naam' | 'voorraad' | 'voorraad_bezet'>;
const p = (id: string, voorraad: number | null, bezet = 0): P => ({ id, naam: id, voorraad, voorraad_bezet: bezet });

describe('beschikbaar = aanwezig − gereserveerd', () => {
    it('trekt het gereserveerde af', () => {
        expect(beschikbaar(p('x', 30, 15))).toBe(15);
    });
    it('niet bijgehouden blijft null, nooit 0', () => {
        expect(beschikbaar(p('x', null, 5))).toBeNull();
    });
    it('rondt niet stil op nul: meer besteld dan er ligt is negatief', () => {
        expect(beschikbaar(p('x', 17, 20))).toBe(-3);
    });
});

describe('pakketten te maken — het kleinste over de slots', () => {
    const producten = [p('p-bier', 17), p('p-worst', 10), p('p-amandel', 1000), p('p-cracker', 8), p('p-doos', 12), p('p-mrhop', 0)];

    it('17 bier = 3 Bierpakketten € 35 (bier beperkt)', () => {
        expect(pakkettenTeMaken('bier-35', slots, producten)).toBe(3);
        expect(beperkendProduct('bier-35', slots, producten)?.id).toBe('p-bier');
    });
    it('Mr. Hop op = 0 pakketten € 50, en Mr. Hop is de oorzaak', () => {
        expect(pakkettenTeMaken('bier-50', slots, producten)).toBe(0);
        expect(beperkendProduct('bier-50', slots, producten)?.id).toBe('p-mrhop');
    });
    it('gereserveerd telt mee', () => {
        const metBezet = producten.map((x) => (x.id === 'p-bier' ? p('p-bier', 17, 15) : x));
        expect(pakkettenTeMaken('bier-35', slots, metBezet)).toBe(0);
    });
    it('een slot zonder product = niet te maken', () => {
        expect(pakkettenTeMaken('bier-20', slots, producten)).toBe(0);
    });
    it('niets bijgehouden = geen grens bekend (null)', () => {
        expect(pakkettenTeMaken('bier-35', slots, [])).toBeNull();
    });
    it('geen slots = null', () => {
        expect(pakkettenTeMaken('los-artikel', slots, producten)).toBeNull();
    });
});

describe('drempel — voorstel of eigen getal', () => {
    it('voorstel = 5 × het artikel dat het meeste vraagt', () => {
        expect(drempelVoorstel('p-amandel', slots)).toBe(1000); // 5 × 200 g (€ 50)
        expect(drempelVoorstel('p-bier', slots)).toBe(25);      // 5 × 5 (€ 35)
        expect(drempelVoorstel('p-worst', slots)).toBe(10);     // 5 × 2 (€ 50)
    });
    it('alleen actieve artikelen tellen mee', () => {
        expect(drempelVoorstel('p-amandel', slots, new Set(['bier-35']))).toBe(750);
    });
    it('product in geen artikel = geen voorstel', () => {
        expect(drempelVoorstel('p-los', slots)).toBeNull();
    });
    it('een eigen getal wint', () => {
        expect(geldendeDrempel({ id: 'p-bier', drempel: 12 }, slots)).toEqual({ waarde: 12, bron: 'eigen' });
        expect(geldendeDrempel({ id: 'p-bier', drempel: null }, slots)).toEqual({ waarde: 25, bron: 'voorstel' });
    });
});

describe('status', () => {
    it.each([
        [null, 10, 'niet_bijgehouden'],
        [-3, 10, 'tekort'],
        [0, 10, 'op'],
        [10, 10, 'laag'],
        [11, 10, 'ok'],
        [4, null, 'ok'],
    ] as const)('beschikbaar %s, drempel %s → %s', (b, d, verwacht) => {
        expect(voorraadstatus(b, d)).toBe(verwacht);
    });
});

describe('waarde en tekst', () => {
    it('waarde tegen inkoop per prijs_per — zelfde som als de database', () => {
        expect(waardeCenten({ inkoop_excl_cents: 140, prijs_per: 100 }, -50)).toBe(-70);
        expect(waardeCenten({ inkoop_excl_cents: null, prijs_per: 1 }, 3)).toBeNull();
    });
    it('hoeveelheden leesbaar', () => {
        expect(hoeveelheidKort(450, 'gram')).toBe('450 g');
        expect(hoeveelheidKort(1950, 'gram')).toBe('1,95 kg');
        expect(hoeveelheidKort(15, 'stuk')).toBe('15 st.');
    });
    it('foutcodes in mensentaal', () => {
        expect(voorraadFout('WV002', 'x')).toMatch(/Tel het eerst/);
        expect(voorraadFout('WV001', 'onder nul: Bier (er is 3, gevraagd 5)')).toMatch(/onder nul\. Bier/);
    });
});
