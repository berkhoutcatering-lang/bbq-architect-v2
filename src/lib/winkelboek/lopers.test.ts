import { describe, expect, it } from 'vitest';
import { cijfersPerProduct, deelLopersIn, type LoperInvoer } from './lopers';
import type { VerkoopRegel } from './verkoop';

const p = (id: string, omzet: number, x: Partial<LoperInvoer> = {}): LoperInvoer => ({
    product_id: id, naam: id, afdeling: 'x', eenheid: 'stuk', voorraad: 100, voorraad_waarde_cents: 10000, tht: null,
    verkocht: omzet > 0 ? 10 : 0, omzet_cents: omzet, marge_cents: null, ...x,
});
const tien = [400, 300, 200, 50, 30, 10, 5, 3, 1, 1].map((o, i) => p(`p${i}`, o * 100));
const lang = { verkoopdagen: 24, dagen_open: 40 };
const kort = { verkoopdagen: 5, dagen_open: 7 };

describe('deelLopersIn', () => {
    it('verdeelt op opgeteld omzetaandeel: tot 80% hardloper, tot 95% middenmoot, daarna traag', () => {
        const l = deelLopersIn(tien, lang);
        expect(l.aantallen).toEqual({ hard: 3, midden: 1, traag: 6, stil: 0 });
        expect(l.lijst.filter((x) => x.groep === 'hard').map((x) => x.product_id)).toEqual(['p0', 'p1', 'p2']);
        expect(l.voorlopig).toBe(false);
    });
    it('voorlopig zolang de winkel nog geen 28 dagen verkoopt, ook met sluitingsdagen', () => {
        expect(deelLopersIn(tien, kort)).toMatchObject({ voorlopig: true, verkoopdagen: 5, dagen_open: 7 });
        expect(deelLopersIn(tien, { verkoopdagen: 20, dagen_open: 28 }).voorlopig).toBe(false);
    });
    it('ligt stil: niets verkocht en wel voorraad; zonder verkoop en zonder voorraad valt een product weg', () => {
        const l = deelLopersIn([p('a', 1000), p('stil', 0, { voorraad: 6, voorraad_waarde_cents: 8100 }), p('leeg', 0, { voorraad: 0 }), p('ongeteld', 0, { voorraad: null })], lang);
        expect(l.aantallen.stil).toBe(1);
        expect(l.lijst.map((x) => x.product_id)).toEqual(['a', 'stil']);
        expect(l.stil_waarde_cents).toBe(8100);
        expect(l.lijst.find((x) => x.product_id === 'stil')?.actie).toBe('uit_assortiment');
    });
    it('rekent hoeveel dagen de voorraad nog reikt en wat krap is', () => {
        const l = deelLopersIn([p('worst', 40000, { verkocht: 74, voorraad: 30 }), p('kaas', 39000, { verkocht: 60, voorraad: 300 })], kort);
        expect(l.lijst[0]).toMatchObject({ product_id: 'worst', dagen_voorraad: 2, krap: true, actie: 'bijbestellen' });
        expect(l.lijst[1]).toMatchObject({ product_id: 'kaas', dagen_voorraad: 25, krap: false, actie: null });
    });
    it('een product op gewicht krijgt geen dagen: stuks en grammen zijn niet te vergelijken', () => {
        expect(deelLopersIn([p('kaas', 1000, { eenheid: 'gram', voorraad: 7100 })], kort).lijst[0]).toMatchObject({ dagen_voorraad: null, krap: false });
    });
    it('een trage loper krijgt "afprijzen"', () => {
        expect(deelLopersIn(tien, lang).lijst.find((x) => x.product_id === 'p9')).toMatchObject({ groep: 'traag', actie: 'afprijzen' });
    });
    it('één stilliggend product zonder waarde maakt het totaal onbekend', () => {
        expect(deelLopersIn([p('a', 0, { voorraad: 3, voorraad_waarde_cents: null }), p('b', 0, { voorraad: 2 })], lang).stil_waarde_cents).toBeNull();
    });
    it('zonder producten: alles nul', () => {
        expect(deelLopersIn([], { verkoopdagen: 0, dagen_open: 0 })).toEqual({ voorlopig: true, verkoopdagen: 0, dagen_open: 0, lijst: [], aantallen: { hard: 0, midden: 0, traag: 0, stil: 0 }, stil_waarde_cents: 0 });
    });
});

describe('cijfersPerProduct', () => {
    const regel = (r: Partial<VerkoopRegel>): VerkoopRegel => ({
        regel_id: 1, bedrijfsdag: '2026-11-28', op: '2026-11-28T12:00:00Z', artikel_id: 'a-worst', naam: 'Droge worst naturel',
        open_prijs_groep: null, aantal: 2, bedrag_cents: 1200, btw: [{ pct: 9, incl_cents: 1200 }],
        onderdelen: [{ product_id: 'p-worst', hoeveelheid: 1, eenheid: 'stuk' }], goederen_terug: null,
        inkoop_cents: 620, inkoop_bron: 'logboek', ...r,
    });
    it('telt verkocht, omzet en marge per product; een pakketregel wordt overgeslagen', () => {
        const uit = cijfersPerProduct([
            regel({}),
            regel({ regel_id: 2, aantal: 1, bedrag_cents: 600, btw: [{ pct: 9, incl_cents: 600 }], inkoop_cents: 310 }),
            regel({ regel_id: 3, artikel_id: 'a-pakket', onderdelen: [{ product_id: 'p-worst', hoeveelheid: 1, eenheid: 'stuk' }, { product_id: 'p-bier', hoeveelheid: 4, eenheid: 'stuk' }] }),
        ]);
        expect([...uit.keys()]).toEqual(['p-worst']);
        expect(uit.get('p-worst')).toEqual({ verkocht: 3, omzet_cents: 1800, marge_cents: 721 });
    });
    it('één regel zonder inkoopwaarde maakt de marge van het product onbekend', () => {
        const uit = cijfersPerProduct([regel({}), regel({ regel_id: 2, inkoop_cents: null, inkoop_bron: null })]);
        expect(uit.get('p-worst')).toMatchObject({ verkocht: 4, marge_cents: null });
    });
});
