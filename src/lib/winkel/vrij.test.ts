/**
 * BA-5a — "BA weet wat vrij is", met de getallen van de Vier Naober (plan v5):
 *
 *   - 6 Naober geteld, een webshoporder van 4 → ligt er 6, gereserveerd 4, vrij 2;
 *   - een verlopen reservering telt niet meer → vrij weer 6;
 *   - na apart zetten (inpakken) → ligt er 2, gereserveerd 0, vrij 2;
 *   - een pakket is het minimum over zijn onderdelen.
 *
 * Dezelfde regels draaien in de database (winkel_vrij_producten,
 * winkel_vrij_artikelen); die zijn los getest in supabase/tests/winkel_vrij.sql.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MYPOS_TEST } from '@/lib/mypos/ipc';
import { maakGeheugenStore, type GeheugenStore } from './geheugenStore';
import { _resetControleKlok, plaatsOrder, type KassaContext } from './kassa';
import type { Artikel, Product, Slot } from './rekenen';
import { kassaPil, standVoorWebsite, vrijArtikel, vrijProducten, type VrijProduct } from './vrij';

const product = (id: string, naam: string, voorraad: number | null, eenheid: 'stuk' | 'gram' = 'stuk'): Omit<Product, 'voorraad_bezet'> =>
    ({ id, naam, type: 'overig', eenheid, prijs_per: eenheid === 'gram' ? 100 : 1, winkelprijs_incl_cents: null, inkoop_excl_cents: null, btw_pct: 21, alcohol: false, voorraad, actief: true });
const slot = (id: string, artikelId: string, volgorde: number, hoeveelheid: number, p: string | null, eenheid: 'stuk' | 'gram' = 'stuk'): Slot =>
    ({ id, artikel_id: artikelId, volgorde, slot_type: 'overig', naam: id, hoeveelheid, eenheid, per: 'stuk', standaard_product_id: p, wisselbaar: false, alternatieven: [] });

const naober: Artikel = {
    id: 'a-naober', slug: 'roeg-naober', naam: 'Naober', eenheid: 'per stuk', telt: 'stuks', prijs_cents: 345, btw_pct: 21, minimum: 1, maximum: null,
    verzendbaar: false, gekoeld: false, moment_soort: 'geen', moment_groep: null, afhaalmoment_tekst: null,
    capaciteit_soort: 'aantal', doos_klein_max: null, doos_groot: null, voorraad: null, actief: true, publiek: true, alcohol: true,
};
const tenant = { orgId: 'org-e2e', slug: 'e2e-hop-en-bites', bedrijfsnaam: 'E2E Hop & Bites', email: null, telefoon: null, brandColor: null, ondertitel: null };
const instellingen = { verzendkosten_cents: null, gratis_verzenden_vanaf_cents: null, verzendkosten_btw_pct: 21, reservering_minuten: 30, offerte_geldig_minuten: 15, kassa_open: true, site_url: 'http://localhost:3001', reservering_bedrag_cents: null, qr_basis_url: null };

let nu: Date;
let store: GeheugenStore;
let ctx: KassaContext;
beforeEach(() => {
    nu = new Date('2027-03-04T12:00:00Z');
    store = maakGeheugenStore({
        tenant, artikelen: [naober], momenten: [], instellingen, nu,
        producten: [product('p-naober', 'Naober', 6)],
        slots: [slot('s-naober', 'a-naober', 1, 1, 'p-naober')],
    });
    ctx = { store, mypos: MYPOS_TEST, appUrl: 'http://localhost:3000', mail: async () => ({ success: true }), nu: () => nu };
    _resetControleKlok();
});

const bestelNaober = (sleutel: string, aantal: number) => plaatsOrder(ctx, 'e2e-hop-en-bites', {
    mand: { versie: 1, regels: [{ slug: 'roeg-naober', aantal, moment: null }] }, leverwijze: 'afhalen', momentId: null,
    contact: { naam: 'Jansen', email: 'jansen@voorbeeld.nl', telefoon: '' }, adres: null, opmerking: '', sleutel,
    terugUrl: '/bestelling', verwachtTotaalCenten: aantal * 345,
});
const naoberVrij = async () => (await store.laadVrij('org-e2e')).find((p) => p.product_id === 'p-naober')!;

describe('vrij per product — de Vier Naober', () => {
    it('6 geteld + een betaalde order van 4 → ligt er 6, gereserveerd 4, vrij 2', async () => {
        expect((await bestelNaober('sleutel-vier-naober', 4)).status).toBe(200);
        await store.bevestigBetaling(store.orders[0]!.id, { trnref: 't-1', centen: 1380, methode: null });
        expect(await naoberVrij()).toEqual({ product_id: 'p-naober', naam: 'Naober', eenheid: 'stuk', ligt_er: 6, gereserveerd: 4, vrij: 2, bijgehouden: true });
    });

    it('een lopende reservering telt mee; verlopen → vrij weer 6', async () => {
        await bestelNaober('sleutel-wacht', 4);
        expect((await naoberVrij()).vrij).toBe(2);
        nu = new Date(nu.getTime() + 31 * 60_000);
        store.zetNu(nu);
        expect(await naoberVrij()).toMatchObject({ ligt_er: 6, gereserveerd: 0, vrij: 6 });
    });

    it('apart gezet (ingepakt): ligt er 2, gereserveerd 0, vrij blijft 2', async () => {
        await bestelNaober('sleutel-apart', 4);
        await store.bevestigBetaling(store.orders[0]!.id, { trnref: 't-2', centen: 1380, methode: null });
        expect(store.pakIn(store.orders[0]!.regels[0]!.id, true)).toEqual({ ok: true });
        expect(await naoberVrij()).toMatchObject({ ligt_er: 2, gereserveerd: 0, vrij: 2 });
    });

    it('vrij mag onder nul (tekort) en null = niet bijgehouden', () => {
        const uit = vrijProducten([product('p-a', 'A', 3), product('p-b', 'B', null)], new Map([['p-a', 4], ['p-b', 2]]));
        expect(uit).toEqual([
            { product_id: 'p-a', naam: 'A', eenheid: 'stuk', ligt_er: 3, gereserveerd: 4, vrij: -1, bijgehouden: true },
            { product_id: 'p-b', naam: 'B', eenheid: 'stuk', ligt_er: null, gereserveerd: 2, vrij: null, bijgehouden: false },
        ]);
    });

    it('de voorraadversie gaat omhoog bij bestellen, betalen en inpakken — niet bij een dubbele klik', async () => {
        expect(store.voorraadVersie()).toBe(0);
        await bestelNaober('sleutel-versie', 4);
        expect(store.voorraadVersie()).toBe(1);
        await store.bevestigBetaling(store.orders[0]!.id, { trnref: 't-3', centen: 1380, methode: null });
        expect(store.voorraadVersie()).toBe(2);
        const regel = store.orders[0]!.regels[0]!.id;
        store.pakIn(regel, true);
        expect(store.voorraadVersie()).toBe(3);
        store.pakIn(regel, true);
        expect(store.voorraadVersie()).toBe(3);
    });
});

describe('vrij per artikel — pakket = minimum', () => {
    /* Naober vrij 2 (6 − 4), worst 10, amandelen 1000 g. */
    const producten: VrijProduct[] = vrijProducten(
        [product('p-naober', 'Naober', 6), product('p-worst', 'Worst', 10), product('p-amandel', 'Amandelen', 1000, 'gram'), product('p-los', 'Los', null)],
        new Map([['p-naober', 4]]),
    );
    const artikel = (id: string, voorraad: number | null = null, voorraad_bezet?: number) => ({ id, slug: id, voorraad, voorraad_bezet });

    it('pakket: 2 Naober, 1 worst, 150 g amandelen → 1, Naober beperkt', () => {
        const slots = [slot('s1', 'pakket', 1, 2, 'p-naober'), slot('s2', 'pakket', 2, 1, 'p-worst'), slot('s3', 'pakket', 3, 150, 'p-amandel', 'gram')];
        expect(vrijArtikel(artikel('pakket'), slots, producten)).toEqual({ artikel_id: 'pakket', slug: 'pakket', vrij: 1, beperkend_product_id: 'p-naober', bijgehouden: true });
    });

    it('losse Naober (1 per stuk) → 2', () => {
        expect(vrijArtikel(artikel('los-naober'), [slot('s1', 'los-naober', 1, 1, 'p-naober')], producten))
            .toMatchObject({ vrij: 2, beperkend_product_id: 'p-naober' });
    });

    it('een slot zonder product → 0, geen beperkend product', () => {
        const slots = [slot('s1', 'leeg', 1, 1, 'p-naober'), slot('s2', 'leeg', 2, 1, null)];
        expect(vrijArtikel(artikel('leeg'), slots, producten)).toMatchObject({ vrij: 0, beperkend_product_id: null, bijgehouden: true });
    });

    it('geen slots en geen quotum → geen grens (niet bijgehouden)', () => {
        expect(vrijArtikel(artikel('vrij'), [], producten)).toMatchObject({ vrij: null, beperkend_product_id: null, bijgehouden: false });
    });

    it('een onderdeel dat niet wordt bijgehouden begrenst niets; het quotum wel', () => {
        const slots = [slot('s1', 'quotum', 1, 1, 'p-los')];
        expect(vrijArtikel(artikel('quotum', 3), slots, producten)).toMatchObject({ vrij: 3, beperkend_product_id: null, bijgehouden: true });
        expect(vrijArtikel(artikel('quotum', 3, 2), slots, producten)).toMatchObject({ vrij: 1 });
        expect(vrijArtikel(artikel('quotum', 3, 5), slots, producten)).toMatchObject({ vrij: 0 });
    });

    it('quotum strenger dan de onderdelen: vrij = quotum, geen beperkend product', () => {
        const slots = [slot('s1', 'q', 1, 1, 'p-worst')];
        expect(vrijArtikel(artikel('q', 4), slots, producten)).toMatchObject({ vrij: 4, beperkend_product_id: null });
        expect(vrijArtikel(artikel('q', 40), slots, producten)).toMatchObject({ vrij: 10, beperkend_product_id: 'p-worst' });
    });
});

describe('standVoorWebsite', () => {
    it('onbeperkt, op, nog n en ruim', () => {
        expect(standVoorWebsite(null, false)).toEqual({ stand: 'onbeperkt', nog: null });
        expect(standVoorWebsite(0, true)).toEqual({ stand: 'op', nog: 0 });
        expect(standVoorWebsite(-1, true)).toEqual({ stand: 'op', nog: 0 });
        expect(standVoorWebsite(2, true)).toEqual({ stand: 'nog', nog: 2 });
        expect(standVoorWebsite(5, true)).toEqual({ stand: 'nog', nog: 5 });
        expect(standVoorWebsite(6, true)).toEqual({ stand: 'ruim', nog: null });
    });
    it('de grens is in te stellen; 0 = nooit een getal', () => {
        expect(standVoorWebsite(6, true, 10)).toEqual({ stand: 'nog', nog: 6 });
        expect(standVoorWebsite(1, true, 0)).toEqual({ stand: 'ruim', nog: null });
        expect(standVoorWebsite(0, true, 0)).toEqual({ stand: 'op', nog: 0 });
    });
});

describe('kassaPil — de vaste woorden uit prototype v4', () => {
    it('de tabel uit het contract (§1.9)', () => {
        expect(kassaPil(0, 0)?.tekst).toBe('op');
        expect(kassaPil(3, 4)).toEqual({ soort: 'tekort', tekst: '4 webshop · 1 tekort', aria: '0 vrij · 4 webshop · 1 tekort' });
        expect(kassaPil(6, 4)).toEqual({ soort: 'webshop', tekst: '2 vrij · 4 webshop', aria: '2 vrij · 4 webshop' });
        expect(kassaPil(4, 0)).toEqual({ soort: 'nog', tekst: 'nog 4', aria: 'nog 4' });
        expect(kassaPil(30, 0)).toEqual({ soort: 'ruim', tekst: 'ruim', aria: 'ruim' });
    });
    it('na apart zetten: "nog 2"; precies op: "0 vrij · 4 webshop"', () => {
        expect(kassaPil(2, 0)?.tekst).toBe('nog 2');
        expect(kassaPil(4, 4)?.tekst).toBe('0 vrij · 4 webshop');
    });
    it('op gaat voor alles; niet bijgehouden = geen pil; grens instelbaar', () => {
        expect(kassaPil(0, 4)?.tekst).toBe('op');
        expect(kassaPil(null, 3)).toBeNull();
        expect(kassaPil(6, 0, 10)?.tekst).toBe('nog 6');
        expect(kassaPil(5, 0)?.tekst).toBe('nog 5');
        expect(kassaPil(1250, 450)?.tekst).toBe('800 vrij · 450 webshop');
    });
});
