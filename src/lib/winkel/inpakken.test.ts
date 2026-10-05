/**
 * W3 — afboeken bij inpakken, tegen de geheugen-opslag. De "klaar wanneer"
 * uit de opdracht (docs/OPDRACHT-BBQ-ARCHITECT-WINKELVOORRAAD.md):
 *
 *   - drie Bierpakketten € 35 boeken na inpakken precies 15 bier, 3 worsten,
 *     450 g amandelen, 3 bakjes crackers en 3 dozen af;
 *   - een vierde bestelling wordt geweigerd als er nog maar 17 bieren zijn;
 *   - een afgebroken betaling boekt niets af.
 *
 * Dezelfde regel draait in de database (winkel_zet_klaargezet); die is los
 * getest in supabase/tests/winkel_inpakken.sql.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MYPOS_TEST } from '@/lib/mypos/ipc';
import { maakGeheugenStore, type GeheugenStore } from './geheugenStore';
import { _resetControleKlok, plaatsOrder, type KassaContext } from './kassa';
import type { Artikel, Product, Slot } from './rekenen';
import { regelBoekingen } from './voorraad';

const bier35: Artikel = {
    id: 'a-bier-35', slug: 'bierpakket-35', naam: 'Bierpakket € 35', eenheid: 'per stuk', telt: 'stuks', prijs_cents: 3500, btw_pct: 21, minimum: 1, maximum: null,
    verzendbaar: false, gekoeld: false, moment_soort: 'moment', moment_groep: 'geschenkpakket', afhaalmoment_tekst: null,
    capaciteit_soort: 'aantal', doos_klein_max: null, doos_groot: null, voorraad: null, actief: true, publiek: true, segment: 'bier', alcohol: true,
};
const product = (id: string, naam: string, eenheid: 'stuk' | 'gram', voorraad: number | null): Omit<Product, 'voorraad_bezet'> =>
    ({ id, naam, type: 'overig', eenheid, prijs_per: eenheid === 'gram' ? 100 : 1, winkelprijs_incl_cents: null, inkoop_excl_cents: null, btw_pct: 21, alcohol: false, voorraad, actief: true });
const producten = [
    product('p-bier', 'Bier', 'stuk', 17),
    product('p-worst', 'Droge worst', 'stuk', 10),
    product('p-amandel', 'BBQ-amandelen', 'gram', 1000),
    product('p-cracker', 'Crackers', 'stuk', 8),
    product('p-doos', 'Geschenkdoos € 35', 'stuk', 12),
];
const slot = (id: string, naam: string, hoeveelheid: number, p: string, eenheid: 'stuk' | 'gram' = 'stuk'): Slot =>
    ({ id, artikel_id: 'a-bier-35', volgorde: 0, slot_type: 'overig', naam, hoeveelheid, eenheid, per: 'stuk', standaard_product_id: p, wisselbaar: false, alternatieven: [] });
/* Zoals in scripts/winkel-seed-hop-en-bites.mjs: 5 bier, worst, 150 g amandelen, crackers, doos. */
const slots = [slot('s1', 'Bier', 5, 'p-bier'), slot('s2', 'Droge worst', 1, 'p-worst'), slot('s3', 'BBQ-amandelen', 150, 'p-amandel', 'gram'), slot('s4', 'Crackers', 1, 'p-cracker'), slot('s5', 'Doos', 1, 'p-doos')];
const momenten = [{ id: 'm-pakket', groep: 'geschenkpakket', datum: '2026-12-05', van: '10:00:00', tot: '12:00:00', capaciteit: null, bestellen_tot: null, sluit_op: null, actief: true }];
const tenant = { orgId: 'org-1', slug: 'hop-en-bites', bedrijfsnaam: 'Hop & Bites', email: null, telefoon: null, brandColor: null, ondertitel: null };
const instellingen = { verzendkosten_cents: null, gratis_verzenden_vanaf_cents: null, verzendkosten_btw_pct: 21, reservering_minuten: 30, offerte_geldig_minuten: 15, kassa_open: true, site_url: 'https://hopbites.nl', reservering_bedrag_cents: null, qr_basis_url: null };

let store: GeheugenStore;
let ctx: KassaContext;
beforeEach(() => {
    store = maakGeheugenStore({ tenant, artikelen: [bier35], momenten, producten, slots, instellingen, nu: new Date('2026-11-20T12:00:00Z') });
    ctx = { store, mypos: MYPOS_TEST, appUrl: 'https://bbq-architect-v2.vercel.app', mail: async () => ({ success: true }), nu: () => new Date('2026-11-20T12:00:00Z') };
    _resetControleKlok();
});

const contact = { naam: 'Jan Jansen', email: 'jan@voorbeeld.nl', telefoon: '0612345678' };
const bestel = (sleutel: string) => plaatsOrder(ctx, 'hop-en-bites', {
    mand: { versie: 1, regels: [{ slug: 'bierpakket-35', aantal: 1, moment: 'm-pakket' }] }, leverwijze: 'afhalen', momentId: null,
    contact, adres: null, opmerking: '', sleutel, terugUrl: '/bestelling', verwachtTotaalCenten: 3500,
});
const stand = (id: string) => store.producten.find((p) => p.id === id)!.voorraad;
const regelVan = (orderId: number) => store.orders.find((o) => o.id === orderId)!.regels[0]!.id;

async function drieBetaald() {
    for (const s of ['a', 'b', 'c']) expect((await bestel(`sleutel-${s}`)).status).toBe(200);
    for (const o of store.orders) await store.bevestigBetaling(o.id, { trnref: `t-${o.id}`, centen: 3500, methode: null });
}

describe('afboeken bij inpakken (W3)', () => {
    it('bestellen reserveert alleen; inpakken boekt precies 15 bier, 3 worst, 450 g amandelen, 3 crackers, 3 dozen af', async () => {
        await drieBetaald();
        expect(stand('p-bier')).toBe(17);
        for (const o of store.orders) expect(store.pakIn(regelVan(o.id), true)).toEqual({ ok: true });
        expect([stand('p-bier'), stand('p-worst'), stand('p-amandel'), stand('p-cracker'), stand('p-doos')]).toEqual([2, 7, 550, 5, 9]);
        const af = (id: string) => -store.mutaties.filter((m) => m.product_id === id && m.type === 'verkoop_online').reduce((s, m) => s + m.hoeveelheid, 0);
        expect([af('p-bier'), af('p-worst'), af('p-amandel'), af('p-cracker'), af('p-doos')]).toEqual([15, 3, 450, 3, 3]);
    });

    it('een vierde bestelling wordt geweigerd als er nog maar 17 bieren zijn', async () => {
        await drieBetaald();
        const vierde = await bestel('sleutel-d');
        expect(vierde.status).toBe(400);
        expect(vierde.body).toMatchObject({ ok: false, soort: 'validatie' });
    });

    it('ook na inpakken: ingepakt telt niet dubbel, de vierde blijft geweigerd', async () => {
        await drieBetaald();
        for (const o of store.orders) store.pakIn(regelVan(o.id), true);
        /* 2 bier over, 0 gereserveerd: een pakket van 5 past niet. */
        expect((await bestel('sleutel-d')).status).toBe(400);
    });

    it('een afgebroken betaling boekt niets af, en inpakken wordt geweigerd', async () => {
        expect((await bestel('sleutel-x')).status).toBe(200);
        const o = store.orders[0]!;
        await store.zetStatus(o.id, 'afgebroken');
        expect(store.pakIn(regelVan(o.id), true)).toEqual({ ok: false, code: 'WV006' });
        expect(store.mutaties).toHaveLength(0);
        expect(stand('p-bier')).toBe(17);
    });

    it('twee keer inpakken boekt niets extra; uitpakken boekt retour', async () => {
        await drieBetaald();
        const r = regelVan(store.orders[0]!.id);
        store.pakIn(r, true);
        store.pakIn(r, true);
        expect(stand('p-bier')).toBe(12);
        store.pakIn(r, false);
        expect(stand('p-bier')).toBe(17);
        expect(store.mutaties.filter((m) => m.type === 'retour')).toHaveLength(5);
    });
});

describe('regelBoekingen — de netto-regel', () => {
    const comps = [{ product_id: 'p-bier', hoeveelheid: 5 }, { product_id: 'p-amandel', hoeveelheid: 150 }, { product_id: null, hoeveelheid: 1 }];
    const alles = () => true;
    it('ingepakt en betaald: alles eraf', () => {
        expect(regelBoekingen(comps, { ingepakt: true, betaald: true }, new Map(), alles))
            .toEqual([{ product_id: 'p-amandel', hoeveelheid: -150, type: 'verkoop_online' }, { product_id: 'p-bier', hoeveelheid: -5, type: 'verkoop_online' }]);
    });
    it('niet betaald: niets (of terug wat er stond)', () => {
        expect(regelBoekingen(comps, { ingepakt: true, betaald: false }, new Map(), alles)).toEqual([]);
        expect(regelBoekingen(comps, { ingepakt: true, betaald: false }, new Map([['p-bier', -5]]), alles))
            .toEqual([{ product_id: 'p-bier', hoeveelheid: 5, type: 'retour' }]);
    });
    it('niet bijgehouden en nooit geboekt: blokkeert nooit, boekt niets', () => {
        expect(regelBoekingen(comps, { ingepakt: true, betaald: true }, new Map(), (id) => id === 'p-bier'))
            .toEqual([{ product_id: 'p-bier', hoeveelheid: -5, type: 'verkoop_online' }]);
    });
});
