/**
 * W4 — let op, bijna op. De "klaar wanneer" uit de opdracht: een bestelling
 * die een product onder de drempel brengt geeft precies één melding, met
 * product, wat er nog is en wat er besteld staat.
 */
import { describe, expect, it } from 'vitest';
import type { Slot } from '@/lib/winkel/rekenen';
import {
    artikelDichtMeldingen, keukenMeldingen, tekortVooruitMeldingen, verschil, winkelProductMeldingen,
    type Melding, type WinkelProduct,
} from './meldingRegels';

const slot = (id: string, artikel_id: string, naam: string, hoeveelheid: number, product: string | null): Slot =>
    ({ id, artikel_id, volgorde: 0, slot_type: 'overig', naam, hoeveelheid, eenheid: 'stuk', per: 'stuk', standaard_product_id: product, wisselbaar: false, alternatieven: [] });

const slots: Slot[] = [
    slot('b1', 'bier-35', 'Bier', 5, 'p-bier'),
    slot('b2', 'bier-35', 'Worst', 1, 'p-worst'),
    slot('c1', 'bier-50', 'Bier', 4, 'p-bier'),
    slot('c2', 'bier-50', 'Mr. Hop', 1, 'p-mrhop'),
];
const actief = new Set(['bier-35', 'bier-50']);
const prod = (id: string, naam: string, voorraad: number | null, bezet = 0, drempel: number | null = null): WinkelProduct =>
    ({ id, naam, eenheid: 'stuk', voorraad, voorraad_bezet: bezet, drempel, actief: true });

describe('bijna op en op', () => {
    it('onder de voorgestelde drempel (5 × 5 bier = 25) is bijna op, met stand en bestelling', () => {
        const m = winkelProductMeldingen([prod('p-bier', 'Bier', 40, 20)], slots, actief);
        expect(m).toHaveLength(1);
        expect(m[0].soort).toBe('voorraad_laag');
        expect(m[0].titel).toBe('Tijd om bij te bestellen: Bier — nog 20 st.');
        expect(m[0].tekst).toContain('Er is 40 st., besteld en nog niet ingepakt 20 st.');
    });
    it('met besteleenheid: de melding zegt wat er op de bestellijst komt (voorbeeld Mathijs)', () => {
        const p = { ...prod('p-bier', 'Bier', 9, 0, 10), par_niveau: 30, bestel_hoeveelheid: 24, bestel_eenheid_naam: 'krat' };
        const m = winkelProductMeldingen([p], slots, actief);
        expect(m[0].titel).toBe('Tijd om bij te bestellen: Bier — nog 9 st.');
        expect(m[0].tekst).toContain('Op de bestellijst: 1 krat (24).');
        expect(m[0].link).toBe('/inkoop');
    });
    it('een eigen drempel wint', () => {
        expect(winkelProductMeldingen([prod('p-bier', 'Bier', 40, 20, 10)], slots, actief)).toHaveLength(0);
    });
    it('0 beschikbaar = op; meer besteld dan er ligt = tekort, niet stil op nul', () => {
        expect(winkelProductMeldingen([prod('p-mrhop', 'Mr. Hop', 3, 3)], slots, actief)[0].titel).toBe('Mr. Hop is op');
        expect(winkelProductMeldingen([prod('p-bier', 'Bier', 17, 20)], slots, actief)[0].titel).toBe('Bier: 3 st. te kort');
    });
    it('niet bijgehouden geeft nooit een melding', () => {
        expect(winkelProductMeldingen([prod('p-bier', 'Bier', null)], slots, actief)).toHaveLength(0);
    });
});

describe('artikel dicht', () => {
    it('"Bierpakket € 50 kan niet meer besteld worden: Mr. Hop is op"', () => {
        const producten = [prod('p-bier', 'Bier', 40), prod('p-worst', 'Worst', 10), prod('p-mrhop', 'Mr. Hop', 0)];
        const m = artikelDichtMeldingen([{ id: 'bier-35', naam: 'Bierpakket € 35', actief: true }, { id: 'bier-50', naam: 'Bierpakket € 50', actief: true }], producten, slots);
        expect(m.map((x) => x.titel)).toEqual(['Bierpakket € 50 kan niet meer besteld worden: Mr. Hop is op']);
    });
    it('een inactief artikel meldt niets', () => {
        const producten = [prod('p-mrhop', 'Mr. Hop', 0)];
        expect(artikelDichtMeldingen([{ id: 'bier-50', naam: 'x', actief: false }], producten, slots)).toHaveLength(0);
    });
});

describe('vooruitkijken', () => {
    it('"voor zaterdag 6 pakketten, 30 bier nodig, er zijn er 24"', () => {
        const m = tekortVooruitMeldingen([prod('p-bier', 'Bier', 24)], [
            { product_id: 'p-bier', klaar_op: '2026-12-02', hoeveelheid: 10, pakketten: 2 },
            { product_id: 'p-bier', klaar_op: '2026-12-05', hoeveelheid: 20, pakketten: 4 },
        ]);
        expect(m).toHaveLength(1);
        expect(m[0].titel).toBe('Tekort Bier voor zaterdag 5 december');
        expect(m[0].tekst).toContain('staan 6 pakketten besteld');
        expect(m[0].tekst).toContain('30 st. Bier voor nodig, er is 24 st.');
    });
    it('past het, dan geen melding', () => {
        expect(tekortVooruitMeldingen([prod('p-bier', 'Bier', 30)], [{ product_id: 'p-bier', klaar_op: '2026-12-05', hoeveelheid: 30, pakketten: 6 }])).toHaveLength(0);
    });
});

describe('keuken in dezelfde vorm', () => {
    it('onder min_stock = bijna op; zonder min_stock niets', () => {
        const m = keukenMeldingen([
            { id: 1, naam: 'Pekelzout', unit: 'kg', current_stock: 1, min_stock: 2 },
            { id: 2, naam: 'Brisket', unit: 'kg', current_stock: 0, min_stock: 5 },
            { id: 3, naam: 'Truffelzout', unit: 'g', current_stock: 10, min_stock: null },
        ]);
        expect(m.map((x) => [x.item_id, x.soort])).toEqual([['1', 'voorraad_laag'], ['2', 'voorraad_op']]);
    });
});

describe('één melding per keer dat hij eronder zakt', () => {
    /* De staat zoals meldingen.ts hem bijhoudt, in het klein. */
    function simuleer(standen: [number, number][]): Melding[] {
        let aan: Melding[] = [];
        const gemaakt: Melding[] = [];
        for (const [voorraad, bezet] of standen) {
            const gewenst = winkelProductMeldingen([prod('p-bier', 'Bier', voorraad, bezet)], slots, actief);
            const { nieuw, weg } = verschil(aan, gewenst, () => true);
            gemaakt.push(...nieuw);
            aan = [...aan.filter((a) => !weg.some((w) => w.soort === a.soort && w.item_id === a.item_id)), ...nieuw];
        }
        return gemaakt;
    }

    it('een bestelling die het onder de drempel brengt: precies één melding, ook bij een tweede bestelling eronder', () => {
        const m = simuleer([[40, 0], [40, 20], [40, 25]]);
        expect(m).toHaveLength(1);
        expect(m[0].soort).toBe('voorraad_laag');
    });
    it('weer erboven en opnieuw eronder = een nieuwe melding', () => {
        expect(simuleer([[40, 20], [80, 20], [40, 20]])).toHaveLength(2);
    });
    it('van bijna op naar op = één melding voor op erbij', () => {
        expect(simuleer([[40, 20], [40, 40]]).map((x) => x.soort)).toEqual(['voorraad_laag', 'voorraad_op']);
    });
    it('alleen bekeken items verdwijnen uit de staat', () => {
        const aan = [{ bron: 'winkel' as const, item_id: 'p-andere', soort: 'voorraad_laag' as const }];
        expect(verschil(aan, [], (m) => m.item_id === 'p-bier').weg).toHaveLength(0);
    });
});
