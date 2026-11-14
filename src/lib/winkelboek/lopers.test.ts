import { describe, expect, it } from 'vitest';
import { cijfersPerProduct, deelLopersIn, lopersVoorKeuze, middenLooptDoor, type LoperInvoer } from './lopers';
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
        expect(l.lijst[0]).toMatchObject({ product_id: 'worst', dagen_voorraad: 2, krap: true });
        expect(l.lijst[1]).toMatchObject({ product_id: 'kaas', dagen_voorraad: 25, krap: false, actie: null });
    });
    it('een product op gewicht krijgt geen dagen: stuks en grammen zijn niet te vergelijken', () => {
        expect(deelLopersIn([p('kaas', 1000, { eenheid: 'gram', voorraad: 7100 })], kort).lijst[0]).toMatchObject({ dagen_voorraad: null, krap: false });
    });
    it('een trage loper krijgt "afprijzen"', () => {
        expect(deelLopersIn(tien, lang).lijst.find((x) => x.product_id === 'p9')).toMatchObject({ groep: 'traag', actie: 'afprijzen' });
    });
    it('een trage loper die bijna op is krijgt geen advies: er valt niets af te prijzen', () => {
        const l = deelLopersIn([...tien.slice(0, 9), p('p9', 100, { voorraad: 1, verkocht: 24 })], lang);
        expect(l.lijst.find((x) => x.product_id === 'p9')).toMatchObject({ groep: 'traag', krap: true, actie: null });
    });
    it('voorraad onder nul: geen dagen en geen "bijna op", wel het advies om te tellen', () => {
        const l = deelLopersIn([p('hard', 90000, { voorraad: -16 }), p('traag', 100, { voorraad: -2 })], lang);
        expect(l.lijst.find((x) => x.product_id === 'hard')).toMatchObject({ onder_nul: true, dagen_voorraad: null, krap: false, actie: 'tellen' });
        expect(l.lijst.find((x) => x.product_id === 'traag')).toMatchObject({ onder_nul: true, dagen_voorraad: null, actie: 'tellen' });
        expect(deelLopersIn(tien, lang).lijst.every((x) => x.onder_nul === false)).toBe(true);
    });
    it('één stilliggend product zonder waarde maakt het totaal onbekend', () => {
        expect(deelLopersIn([p('a', 0, { voorraad: 3, voorraad_waarde_cents: null }), p('b', 0, { voorraad: 2 })], lang).stil_waarde_cents).toBeNull();
    });
    it('zonder producten: alles nul', () => {
        expect(deelLopersIn([], { verkoopdagen: 0, dagen_open: 0 })).toEqual({ voorlopig: true, verkoopdagen: 0, dagen_open: 0, lijst: [], aantallen: { hard: 0, midden: 0, traag: 0, stil: 0 }, stil_waarde_cents: 0 });
    });
});

describe('bijbestellen volgt de Bestellijst', () => {
    const snel = { verkocht: 74, voorraad: 30 };
    it('"Bijbestellen" alleen als het product op de Bestellijst staat, niet omdat het bijna op is', () => {
        const l = deelLopersIn([p('wel', 40000, { ...snel, op_bestellijst: true }), p('niet', 39000, { ...snel, op_bestellijst: false })], kort);
        expect(l.lijst.find((x) => x.product_id === 'wel')).toMatchObject({ krap: true, actie: 'bijbestellen' });
        expect(l.lijst.find((x) => x.product_id === 'niet')).toMatchObject({ krap: true, actie: null });
    });
    it('al besteld en nog onderweg: niet op de Bestellijst, dus geen "Bijbestellen", en het aantal onderweg staat erbij', () => {
        const [x] = deelLopersIn([p('blond', 40000, { ...snel, op_bestellijst: false, onderweg: 480 })], kort).lijst;
        expect(x).toMatchObject({ actie: null, onderweg: 480 });
    });
    it('op de Bestellijst met ruim voorraad (hoog minimum): toch "Bijbestellen"', () => {
        const [x] = deelLopersIn([p('ruim', 40000, { verkocht: 10, voorraad: 500, op_bestellijst: true })], kort).lijst;
        expect(x).toMatchObject({ krap: false, actie: 'bijbestellen' });
    });
    it('een trage loper op de Bestellijst krijgt geen "Bijbestellen"', () => {
        const l = deelLopersIn([...tien.slice(0, 9), p('p9', 100, { op_bestellijst: true })], lang);
        expect(l.lijst.find((x) => x.product_id === 'p9')).toMatchObject({ groep: 'traag', actie: 'afprijzen' });
    });
});

describe('het minimum naast de verkoopsnelheid', () => {
    /* 60 verkocht in 5 verkoopdagen = 12 per dag. */
    const basis = { verkocht: 60, voorraad: 200, op_bestellijst: false };
    it('minimum lager dan wat er tijdens de levertijd verkocht wordt: voorstel = verkoop per dag × levertijd, naar boven afgerond', () => {
        const [x] = deelLopersIn([p('a', 40000, { ...basis, minimum: 20, levertijd_dagen: 3 })], kort).lijst;
        expect(x).toMatchObject({ minimum_voorstel: 36, levertijd_ontbreekt: false, actie: 'minimum' });
        expect(deelLopersIn([p('a', 40000, { ...basis, verkocht: 61, minimum: 20, levertijd_dagen: 3 })], kort).lijst[0].minimum_voorstel).toBe(37);
    });
    it('minimum hoog genoeg: geen voorstel en geen stap', () => {
        const [x] = deelLopersIn([p('a', 40000, { ...basis, minimum: 36, levertijd_dagen: 3 })], kort).lijst;
        expect(x).toMatchObject({ minimum_voorstel: null, actie: null });
    });
    it('geen minimum ingesteld telt als te laag', () => {
        const [x] = deelLopersIn([p('a', 40000, { ...basis, minimum: null, levertijd_dagen: 2 })], kort).lijst;
        expect(x).toMatchObject({ minimum_voorstel: 24, actie: 'minimum' });
    });
    it('levertijd niet ingevuld: dat staat er, en er komt geen voorstel', () => {
        const [x] = deelLopersIn([p('a', 40000, { ...basis, minimum: 5, levertijd_dagen: null })], kort).lijst;
        expect(x).toMatchObject({ minimum_voorstel: null, levertijd_ontbreekt: true, actie: null });
    });
    it('staat het al op de Bestellijst, dan is "Bijbestellen" de stap; het voorstel voor het minimum blijft erbij staan', () => {
        const [x] = deelLopersIn([p('a', 40000, { ...basis, op_bestellijst: true, minimum: 20, levertijd_dagen: 3 })], kort).lijst;
        expect(x).toMatchObject({ actie: 'bijbestellen', minimum_voorstel: 36 });
    });
    it('niet voor trage lopers, niet voor producten op gewicht, niet onder nul', () => {
        const traag = deelLopersIn([...tien.slice(0, 9), p('p9', 100, { minimum: 0, levertijd_dagen: 5, op_bestellijst: false })], lang).lijst.find((x) => x.product_id === 'p9');
        expect(traag).toMatchObject({ minimum_voorstel: null, levertijd_ontbreekt: false });
        const [gram] = deelLopersIn([p('kaas', 40000, { ...basis, eenheid: 'gram', minimum: 0, levertijd_dagen: 3 })], kort).lijst;
        expect(gram).toMatchObject({ minimum_voorstel: null, levertijd_ontbreekt: false, actie: null });
        const [nul] = deelLopersIn([p('a', 40000, { ...basis, voorraad: -4, minimum: 0, levertijd_dagen: 3 })], kort).lijst;
        expect(nul).toMatchObject({ minimum_voorstel: null, actie: 'tellen' });
    });
    it('zonder gegevens van de Bestellijst (niet geladen): geen stap en geen melding over de levertijd', () => {
        const [x] = deelLopersIn([p('a', 40000, { verkocht: 74, voorraad: 30 })], kort).lijst;
        expect(x).toMatchObject({ actie: null, minimum_voorstel: null, levertijd_ontbreekt: false });
    });
});

describe('lopersVoorKeuze', () => {
    it('een artikel uit de middenmoot dat op de Bestellijst staat, staat bij de hardlopers', () => {
        const l = deelLopersIn([...tien.slice(0, 3), p('p3', 5000, { verkocht: 60, voorraad: 5, op_bestellijst: true }), ...tien.slice(4)], kort);
        const hard = lopersVoorKeuze(l, 'hard');
        expect(hard.map((x) => x.product_id)).toEqual(['p0', 'p1', 'p2', 'p3']);
        expect(hard[3]).toMatchObject({ groep: 'midden', krap: true, actie: 'bijbestellen' });
        expect(lopersVoorKeuze(l, 'traag').every((x) => x.groep === 'traag')).toBe(true);
        expect(middenLooptDoor(l)).toBe(0);
    });
    it('een middenmoter met genoeg voorraad loopt gewoon door en staat nergens', () => {
        const l = deelLopersIn(tien, lang);
        expect(lopersVoorKeuze(l, 'hard').map((x) => x.product_id)).toEqual(['p0', 'p1', 'p2']);
        expect(middenLooptDoor(l)).toBe(1);
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
        expect(uit.get('p-worst')).toEqual({ verkocht: 3, omzet_cents: 1800, marge_cents: 721, geschat: false });
    });
    it('een marge die met de inkoopprijs van nu is gerekend heet geschat', () => {
        const uit = cijfersPerProduct([regel({}), regel({ regel_id: 2, inkoop_bron: 'prijs_nu' })]);
        expect(uit.get('p-worst')).toMatchObject({ geschat: true });
    });
    it('een onbekende marge is niet geschat', () => {
        const uit = cijfersPerProduct([regel({ inkoop_bron: 'prijs_nu' }), regel({ regel_id: 2, inkoop_cents: null, inkoop_bron: null })]);
        expect(uit.get('p-worst')).toMatchObject({ marge_cents: null, geschat: false });
    });
    it('één regel zonder inkoopwaarde maakt de marge van het product onbekend', () => {
        const uit = cijfersPerProduct([regel({}), regel({ regel_id: 2, inkoop_cents: null, inkoop_bron: null })]);
        expect(uit.get('p-worst')).toMatchObject({ verkocht: 4, marge_cents: null });
    });
});
