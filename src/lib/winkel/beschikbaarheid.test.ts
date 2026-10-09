/**
 * BA-5b — GET /api/public-winkel/{slug}/beschikbaarheid (haalBeschikbaarheid),
 * tegen de geheugen-opslag. De website krijgt per artikel dat actief én
 * publiek is alleen een stand ('op' | 'nog' | 'ruim' | 'onbeperkt') en bij
 * 'nog' het getal tot en met de grens. De Vier Naober: 6 geteld → ruim;
 * order van 4 → nog 2; nog 2 verkocht → op.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MYPOS_TEST } from '@/lib/mypos/ipc';
import { maakGeheugenStore, type GeheugenStore } from './geheugenStore';
import { _resetControleKlok, haalBeschikbaarheid, plaatsOrder, type Beschikbaarheid, type KassaContext } from './kassa';
import type { Artikel, Product, Slot } from './rekenen';

const product = (id: string, naam: string, voorraad: number | null): Omit<Product, 'voorraad_bezet'> =>
    ({ id, naam, type: 'bier', eenheid: 'stuk', prijs_per: 1, winkelprijs_incl_cents: 345, inkoop_excl_cents: null, btw_pct: 21, alcohol: true, voorraad, actief: true });
const slot = (id: string, artikelId: string, hoeveelheid: number, p: string): Slot =>
    ({ id, artikel_id: artikelId, volgorde: 1, slot_type: 'bier', naam: id, hoeveelheid, eenheid: 'stuk', per: 'stuk', standaard_product_id: p, wisselbaar: false, alternatieven: [] });
const basis: Omit<Artikel, 'id' | 'slug' | 'naam'> = {
    eenheid: 'per stuk', telt: 'stuks', prijs_cents: 345, btw_pct: 21, minimum: 1, maximum: null,
    verzendbaar: false, gekoeld: false, moment_soort: 'geen', moment_groep: null, afhaalmoment_tekst: null,
    capaciteit_soort: 'aantal', doos_klein_max: null, doos_groot: null, voorraad: null, actief: true, publiek: true, alcohol: true,
};
const artikelen: Artikel[] = [
    { ...basis, id: 'a-naober', slug: 'roeg-naober', naam: 'Naober' },
    /* Twee Naober per verpakking: uit 6 vrij zijn er 3 te maken. */
    { ...basis, id: 'a-duo', slug: 'naober-duo', naam: 'Naober duo', prijs_cents: 690 },
    /* Niet publiek (geheim menu) en niet actief: nooit in de lijst. */
    { ...basis, id: 'a-geheim', slug: 'geheim', naam: 'Geheim', publiek: false },
    { ...basis, id: 'a-uit', slug: 'uit', naam: 'Uit', actief: false },
    /* Geen slots, geen quotum: op bestelling gemaakt. */
    { ...basis, id: 'a-vrij', slug: 'borrelplank', naam: 'Borrelplank', alcohol: false },
];
const slots = [slot('s1', 'a-naober', 1, 'p-naober'), slot('s2', 'a-duo', 2, 'p-naober'), slot('s3', 'a-geheim', 1, 'p-naober'), slot('s4', 'a-uit', 1, 'p-naober')];
const tenant = { orgId: 'org-e2e', slug: 'e2e-hop-en-bites', bedrijfsnaam: 'E2E Hop & Bites', email: null, telefoon: null, brandColor: null, ondertitel: null };
const instellingen = { verzendkosten_cents: null, gratis_verzenden_vanaf_cents: null, verzendkosten_btw_pct: 21, reservering_minuten: 30, offerte_geldig_minuten: 15, kassa_open: true, site_url: 'http://localhost:3001', reservering_bedrag_cents: null, qr_basis_url: null };

let nu: Date;
let store: GeheugenStore;
let ctx: KassaContext;
function maak(extra: { beschikbaar_grens?: number } = {}) {
    nu = new Date('2027-03-04T12:00:00Z');
    store = maakGeheugenStore({ tenant, artikelen, momenten: [], instellingen: { ...instellingen, ...extra }, nu, producten: [product('p-naober', 'Naober', 6)], slots });
    ctx = { store, mypos: MYPOS_TEST, appUrl: 'http://localhost:3000', mail: async () => ({ success: true }), nu: () => nu };
}
beforeEach(() => {
    maak();
    _resetControleKlok();
});

const bestel = (sleutel: string, aantal: number) => plaatsOrder(ctx, 'e2e-hop-en-bites', {
    mand: { versie: 1, regels: [{ slug: 'roeg-naober', aantal, moment: null }] }, leverwijze: 'afhalen', momentId: null,
    contact: { naam: 'Jansen', email: 'jansen@voorbeeld.nl', telefoon: '' }, adres: null, opmerking: '', sleutel,
    terugUrl: '/bestelling', verwachtTotaalCenten: aantal * 345,
});
async function betaal(sleutel: string, aantal: number) {
    expect((await bestel(sleutel, aantal)).status).toBe(200);
    const o = store.orders.at(-1)!;
    expect(await store.bevestigBetaling(o.id, { trnref: `t-${o.id}`, centen: aantal * 345, methode: null })).toBe('betaald');
    return o;
}
async function haal(): Promise<Beschikbaarheid> {
    const uit = await haalBeschikbaarheid(ctx, 'e2e-hop-en-bites');
    expect(uit.status).toBe(200);
    return uit.body as Beschikbaarheid;
}

describe('beschikbaarheid voor de website (BA-5b)', () => {
    it('alleen actief én publiek; zonder grens onbeperkt; 6 vrij boven de grens = ruim zonder getal', async () => {
        const b = await haal();
        expect(b.ok).toBe(true);
        expect(b.artikelen).toEqual([
            { slug: 'borrelplank', stand: 'onbeperkt', nog: null },
            { slug: 'naober-duo', stand: 'nog', nog: 3 },
            { slug: 'roeg-naober', stand: 'ruim', nog: null },
        ]);
        expect(JSON.stringify(b)).not.toMatch(/geheim|"uit"|p-naober|Jansen/);
    });

    it('de Vier Naober: een betaalde order van 4 → nog 2; nog 2 erbij → op', async () => {
        await betaal('vier-naober', 4);
        let b = await haal();
        expect(b.artikelen.find((a) => a.slug === 'roeg-naober')).toEqual({ slug: 'roeg-naober', stand: 'nog', nog: 2 });
        expect(b.artikelen.find((a) => a.slug === 'naober-duo')).toEqual({ slug: 'naober-duo', stand: 'nog', nog: 1 });
        await betaal('laatste-twee', 2);
        b = await haal();
        expect(b.artikelen.find((a) => a.slug === 'roeg-naober')).toEqual({ slug: 'roeg-naober', stand: 'op', nog: 0 });
        expect(b.artikelen.find((a) => a.slug === 'naober-duo')).toEqual({ slug: 'naober-duo', stand: 'op', nog: 0 });
    });

    it('versie en vrij_verloopt_at: een lopende reservering zegt wanneer opnieuw vragen; verlopen = weer ruim', async () => {
        const voor = await haal();
        expect(voor.versie).toBe(0);
        expect(voor.vrij_verloopt_at).toBeNull();
        expect((await bestel('sleutel-wacht', 4)).status).toBe(200);
        const tijdens = await haal();
        expect(tijdens.versie).toBe(1);
        expect(tijdens.vrij_verloopt_at).toBe(store.orders[0]!.reservering_tot);
        expect(tijdens.artikelen.find((a) => a.slug === 'roeg-naober')?.stand).toBe('nog');
        /* Niemand schrijft iets, de versie blijft gelijk — maar na vrij_verloopt_at is het weer ruim. */
        nu = new Date(new Date(tijdens.vrij_verloopt_at!).getTime() + 1000);
        store.zetNu(nu);
        const na = await haal();
        expect(na.versie).toBe(1);
        expect(na.vrij_verloopt_at).toBeNull();
        expect(na.artikelen.find((a) => a.slug === 'roeg-naober')).toEqual({ slug: 'roeg-naober', stand: 'ruim', nog: null });
    });

    it('de grens komt uit winkel_instellingen.beschikbaar_grens', async () => {
        maak({ beschikbaar_grens: 10 });
        expect((await haal()).artikelen.find((a) => a.slug === 'roeg-naober')).toEqual({ slug: 'roeg-naober', stand: 'nog', nog: 6 });
        maak({ beschikbaar_grens: 0 });
        expect((await haal()).artikelen.find((a) => a.slug === 'naober-duo')).toEqual({ slug: 'naober-duo', stand: 'ruim', nog: null });
    });

    it('onbekende winkel → 404; een storing → 503 (de website toont dan geen badge)', async () => {
        expect((await haalBeschikbaarheid(ctx, 'bestaat-niet')).status).toBe(404);
        const kapot: KassaContext = { ...ctx, store: { ...store, laadBeschikbaarheid: async () => { throw new Error('db weg'); } } };
        const uit = await haalBeschikbaarheid(kapot, 'e2e-hop-en-bites');
        expect(uit.status).toBe(503);
        expect(uit.body).toMatchObject({ ok: false, soort: 'niet-beschikbaar' });
    });

    it('de opslag rekent per artikel hetzelfde als winkel_vrij_artikelen', async () => {
        expect((await bestel('sleutel-artikel', 4)).status).toBe(200);
        const b = await store.laadBeschikbaarheid('org-e2e');
        expect(b?.grens).toBe(5);
        expect(b?.artikelen.find((a) => a.artikel_id === 'a-naober')).toEqual({ artikel_id: 'a-naober', slug: 'roeg-naober', vrij: 2, beperkend_product_id: 'p-naober', bijgehouden: true });
        expect(await store.laadBeschikbaarheid('andere-org')).toBeNull();
    });
});
