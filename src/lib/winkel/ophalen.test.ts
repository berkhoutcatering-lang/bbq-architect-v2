/**
 * BA-2 — ophaallek dichten. De pure regels (welke stap, welke melding) en de
 * geheugen-opslag, die dezelfde regels volgt als winkel_order_ophalen.
 *
 * De databasefunctie zelf is los getest in supabase/tests/winkel_ophalen.sql
 * (alleen op de dev-database).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MYPOS_TEST } from '@/lib/mypos/ipc';
import { maakGeheugenStore, type GeheugenStore } from './geheugenStore';
import { _resetControleKlok, plaatsOrder, type KassaContext } from './kassa';
import {
    euro, ophaalBlokkade, ophaalMelding, opDezelfdeDag, terugMelding, welkeStapNodig,
    type OphaalOrder, type OphaalUitkomst, type TerugUitkomst,
} from './ophalen';
import type { Artikel, Product, Slot } from './rekenen';

/* ── Pure regels ─────────────────────────────────────────────────────────── */

const order = (o: Partial<OphaalOrder> = {}): OphaalOrder => ({
    status: 'betaald', betaalwijze: 'volledig', rest_cents: 0, rest_betaald_at: null,
    regels: [{ alcohol: false, opgehaald_at: null }],
    ...o,
});
const metAlcohol = (o: Partial<OphaalOrder> = {}) => order({ regels: [{ alcohol: true, opgehaald_at: null }], ...o });
const metRest = (o: Partial<OphaalOrder> = {}) => order({ betaalwijze: 'reservering', rest_cents: 3250, ...o });

describe('welkeStapNodig — wat de balie eerst moet doen', () => {
    it('niet betaald en al opgehaald gaan voor alles', () => {
        expect(welkeStapNodig(order({ status: 'wacht' }))).toBe('niet_betaald');
        expect(welkeStapNodig(order({ regels: [{ alcohol: true, opgehaald_at: '2026-11-20T12:00:00Z' }] }))).toBe('al_opgehaald');
    });

    it('alcohol en open rest: eerst 18+, dan de rest, dan Opgehaald', () => {
        const o = metAlcohol({ betaalwijze: 'reservering', rest_cents: 3250 });
        expect(welkeStapNodig(o)).toBe('leeftijd');
        expect(welkeStapNodig(o, { leeftijd: 'vastgesteld' })).toBe('rest');
        expect(welkeStapNodig(o, { leeftijd: 'vastgesteld', restMethode: 'pin' })).toBe('ophalen');
        expect(welkeStapNodig(o, { leeftijd: 'geweigerd' })).toBe('geweigerd');
    });

    it('zonder alcohol en zonder rest: meteen Opgehaald', () => {
        expect(welkeStapNodig(order())).toBe('ophalen');
        expect(welkeStapNodig(metRest({ rest_betaald_at: '2026-11-20T10:00:00Z' }))).toBe('ophalen');
        expect(welkeStapNodig(order({ betaalwijze: 'volledig', rest_cents: 500 }))).toBe('ophalen');
    });

    it('alcohol in een regel die al (via een doos) is meegegeven telt niet meer', () => {
        const o = order({ regels: [{ alcohol: true, opgehaald_at: '2026-11-20T12:00:00Z' }, { alcohol: false, opgehaald_at: null }] });
        expect(welkeStapNodig(o)).toBe('ophalen');
    });
});

describe('ophaalBlokkade — dezelfde volgorde als winkel_order_ophalen', () => {
    it('geweigerd gaat vóór de rest: wie niets meekrijgt, betaalt geen rest', () => {
        expect(ophaalBlokkade(metAlcohol({ betaalwijze: 'reservering', rest_cents: 100 }), { leeftijd: 'geweigerd' })).toBe('geweigerd');
    });
    it('daarna eerst de rest, dan de leeftijd', () => {
        const o = metAlcohol({ betaalwijze: 'reservering', rest_cents: 100 });
        expect(ophaalBlokkade(o)).toBe('rest_nodig');
        expect(ophaalBlokkade(o, { restMethode: 'contant' })).toBe('leeftijd_nodig');
        expect(ophaalBlokkade(o, { restMethode: 'contant', leeftijd: 'vastgesteld' })).toBeNull();
    });
    it('niet betaald vóór al opgehaald', () => {
        expect(ophaalBlokkade(order({ status: 'afgebroken', regels: [{ opgehaald_at: '2026-11-20T12:00:00Z' }] }))).toBe('niet_betaald');
    });
});

describe('ophaalMelding — elke uitkomst in mensentaal', () => {
    const basis = { order_id: 7, nummer: 'HB-2026-0007', klant: 'Jan', nog_open: 1, alcohol: true, rest_cents: 0 };
    const gevallen: [OphaalUitkomst, 'success' | 'error' | 'info', RegExp][] = [
        [{ uitkomst: 'onbekend', order_id: 7 }, 'error', /kennen we niet/],
        [{ ...basis, uitkomst: 'niet_betaald', status: 'verlopen' }, 'error', /HB-2026-0007 is niet betaald \(reservering verlopen\)\. Niet meegeven/],
        [{ ...basis, uitkomst: 'al_opgehaald', opgehaald_at: '2026-11-20T12:00:00Z' }, 'info', /al opgehaald om .*niets dubbel geboekt/],
        [{ ...basis, uitkomst: 'geweigerd', geweigerd_at: '2026-11-20T12:00:00Z' }, 'info', /niet meegegeven: leeftijd niet vastgesteld\. De weigering is vastgelegd.*geen rest geboekt/],
        [{ ...basis, uitkomst: 'rest_nodig', rest_cents: 3250, reeds_cents: 250 }, 'info', /Eerst de rest: € 32,50 contant of pin \(reeds betaald € 2,50\)/],
        [{ ...basis, uitkomst: 'leeftijd_nodig' }, 'info', /alcohol: eerst de leeftijd vaststellen/],
        [{ ...basis, uitkomst: 'te_weinig_voorraad', melding: 'onder nul: Naober (er is 2, gevraagd 4)' }, 'error', /te weinig om in te pakken\. Er is niets geboekt.*\(onder nul: Naober/],
        [{ ...basis, uitkomst: 'opgehaald', rest_cents: 3250, opgehaald_at: '2026-11-20T12:00:00Z', nog_open: 0, regels: 1, rest_geboekt: 'pin', leeftijd: 'vastgesteld',
            boekingen: [{ product_id: 'p1', hoeveelheid: -4, voorraad: 2 }, { product_id: 'p2', hoeveelheid: -1, voorraad: 0 }] },
            'success', /^HB-2026-0007 opgehaald · rest € 32,50 pin geboekt · 18\+ vastgesteld · ingepakt en afgeboekt \(2 producten\)\.$/],
    ];
    for (const [u, soort, tekst] of gevallen) {
        it(u.uitkomst, () => {
            const m = ophaalMelding(u);
            expect(m.soort).toBe(soort);
            expect(m.tekst).toMatch(tekst);
        });
    }
    it('opgehaald zonder rest en zonder boekingen: kort', () => {
        expect(ophaalMelding({ ...basis, alcohol: false, uitkomst: 'opgehaald', opgehaald_at: 'x', nog_open: 0, regels: 1, rest_geboekt: null, leeftijd: null, boekingen: [] }).tekst)
            .toBe('HB-2026-0007 opgehaald.');
    });
});

describe('terugMelding', () => {
    const gevallen: [TerugUitkomst, 'success' | 'error' | 'info', RegExp][] = [
        [{ uitkomst: 'onbekend', order_id: 1 }, 'error', /kennen we niet/],
        [{ uitkomst: 'niet_opgehaald', order_id: 1, nummer: 'HB-1' }, 'info', /stond niet op opgehaald/],
        [{ uitkomst: 'niet_zelfde_dag', order_id: 1, nummer: 'HB-1', opgehaald_at: '2026-11-19T12:00:00Z' }, 'error', /eerdere dag/],
        [{ uitkomst: 'teruggezet', order_id: 1, nummer: 'HB-1', regels: 1, dozen: 0 }, 'success', /voorraad blijft afgeboekt/],
    ];
    for (const [u, soort, tekst] of gevallen) {
        it(u.uitkomst, () => {
            expect(terugMelding(u).soort).toBe(soort);
            expect(terugMelding(u).tekst).toMatch(tekst);
        });
    }
});

describe('hulpjes', () => {
    it('euro', () => {
        expect(euro(3250)).toBe('€ 32,50');
        expect(euro(5)).toBe('€ 0,05');
    });
    it('opDezelfdeDag rekent in Nederlandse tijd', () => {
        /* 20 nov 23:30 UTC = 21 nov 00:30 in Amsterdam (CET). */
        expect(opDezelfdeDag('2026-11-20T23:30:00Z', new Date('2026-11-21T10:00:00Z'))).toBe(true);
        expect(opDezelfdeDag('2026-11-20T22:30:00Z', new Date('2026-11-21T10:00:00Z'))).toBe(false);
    });
});

/* ── De geheugen-opslag: dezelfde regels als de database ─────────────────── */

const basisArtikel = {
    eenheid: 'per stuk', telt: 'stuks' as const, minimum: 1, maximum: null, verzendbaar: false, gekoeld: false, moment_soort: 'moment' as const,
    moment_groep: 'geschenkpakket', afhaalmoment_tekst: null, capaciteit_soort: 'aantal' as const, doos_klein_max: null, doos_groot: null,
    voorraad: null, actief: true, publiek: true,
};
const bier35: Artikel = { ...basisArtikel, id: 'a-bier-35', slug: 'bierpakket-35', naam: 'Bierpakket € 35', prijs_cents: 3500, btw_pct: 21, segment: 'bier', alcohol: true };
const kaas: Artikel = { ...basisArtikel, id: 'a-kaas', slug: 'kaasplankje', naam: 'Kaasplankje', prijs_cents: 1500, btw_pct: 9, segment: null, alcohol: false };
const product = (id: string, naam: string, voorraad: number | null): Omit<Product, 'voorraad_bezet'> =>
    ({ id, naam, type: 'overig', eenheid: 'stuk', prijs_per: 1, winkelprijs_incl_cents: null, inkoop_excl_cents: null, btw_pct: 21, alcohol: false, voorraad, actief: true });
const producten = [product('p-bier', 'Bier', 17), product('p-doos', 'Geschenkdoos', 12), product('p-kaas', 'Kaas', 4)];
const slot = (id: string, artikel: string, hoeveelheid: number, p: string): Slot =>
    ({ id, artikel_id: artikel, volgorde: 0, slot_type: 'overig', naam: p, hoeveelheid, eenheid: 'stuk', per: 'stuk', standaard_product_id: p, wisselbaar: false, alternatieven: [] });
const slots = [slot('s1', 'a-bier-35', 5, 'p-bier'), slot('s2', 'a-bier-35', 1, 'p-doos'), slot('s3', 'a-kaas', 2, 'p-kaas')];
const momenten = [{ id: 'm-pakket', groep: 'geschenkpakket', datum: '2026-12-05', van: '10:00:00', tot: '12:00:00', capaciteit: null, bestellen_tot: null, sluit_op: null, actief: true }];
const tenant = { orgId: 'org-1', slug: 'hop-en-bites', bedrijfsnaam: 'Hop & Bites', email: null, telefoon: null, brandColor: null, ondertitel: null };
const instellingen = { verzendkosten_cents: null, gratis_verzenden_vanaf_cents: null, verzendkosten_btw_pct: 21, reservering_minuten: 30, offerte_geldig_minuten: 15, kassa_open: true, site_url: 'https://hopbites.nl', reservering_bedrag_cents: null, qr_basis_url: null };
const NU = new Date('2026-11-20T12:00:00Z');

let store: GeheugenStore;
let ctx: KassaContext;
beforeEach(() => {
    store = maakGeheugenStore({ tenant, artikelen: [bier35, kaas], momenten, producten, slots, instellingen, nu: NU });
    ctx = { store, mypos: MYPOS_TEST, appUrl: 'https://bbq-architect-v2.vercel.app', mail: async () => ({ success: true }), nu: () => NU };
    _resetControleKlok();
});

const contact = { naam: 'Jan Jansen', email: 'jan@voorbeeld.nl', telefoon: '0612345678' };
async function betaaldeOrder(sleutel: string, regels: { slug: string; aantal: number }[] = [{ slug: 'bierpakket-35', aantal: 1 }]) {
    const totaal = regels.reduce((s, r) => s + r.aantal * (r.slug === 'kaasplankje' ? 1500 : 3500), 0);
    const uit = await plaatsOrder(ctx, 'hop-en-bites', {
        mand: { versie: 1, regels: regels.map((r) => ({ ...r, moment: 'm-pakket' })) }, leverwijze: 'afhalen', momentId: null,
        contact, adres: null, opmerking: '', sleutel: `sleutel-${sleutel}`, terugUrl: '/bestelling', verwachtTotaalCenten: totaal,
    });
    expect(uit.status, JSON.stringify(uit.body)).toBe(200);
    const o = store.orders.at(-1)!;
    await store.bevestigBetaling(o.id, { trnref: `t-${o.id}`, centen: totaal, methode: null });
    return o;
}
const stand = (id: string) => store.producten.find((p) => p.id === id)!.voorraad;
const zetReservering = (o: GeheugenStore['orders'][number], rest = 3250) => { o.betaalwijze = 'reservering'; o.nu_te_betalen_cents = 3500 - rest; o.rest_cents = rest; };

describe('haalOp (geheugen) — elke uitkomst', () => {
    it('onbekend: geen order, of een order van een andere organisatie', async () => {
        const o = await betaaldeOrder('a');
        expect(store.haalOp('org-1', 999)).toEqual({ uitkomst: 'onbekend', order_id: 999 });
        expect(store.haalOp('org-2', o.id, { leeftijd: 'vastgesteld' })).toEqual({ uitkomst: 'onbekend', order_id: o.id });
        expect(o.regels[0]!.opgehaald_at).toBeNull();
    });

    it('niet_betaald: een order die nog op de betaling wacht gaat niet mee', async () => {
        await plaatsOrder(ctx, 'hop-en-bites', {
            mand: { versie: 1, regels: [{ slug: 'bierpakket-35', aantal: 1, moment: 'm-pakket' }] }, leverwijze: 'afhalen', momentId: null,
            contact, adres: null, opmerking: '', sleutel: 'sleutel-wacht', terugUrl: '/bestelling', verwachtTotaalCenten: 3500,
        });
        const o = store.orders[0]!;
        expect(store.haalOp('org-1', o.id, { leeftijd: 'vastgesteld' })).toMatchObject({ uitkomst: 'niet_betaald', status: 'wacht' });
        expect(o.regels[0]!.opgehaald_at).toBeNull();
        expect(store.mutaties).toHaveLength(0);
    });

    it('opgehaald: een niet-ingepakte regel wordt bij het ophalen afgeboekt', async () => {
        const o = await betaaldeOrder('a');
        expect(o.regels[0]!.klaargezet_at).toBeNull();
        const u = store.haalOp('org-1', o.id, { leeftijd: 'vastgesteld', doorUserId: 'user-1' });
        expect(u).toMatchObject({ uitkomst: 'opgehaald', nummer: o.nummer, nog_open: 0, regels: 1, rest_geboekt: null, leeftijd: 'vastgesteld' });
        expect([stand('p-bier'), stand('p-doos')]).toEqual([12, 11]);
        expect(store.mutaties.map((m) => [m.product_id, m.hoeveelheid, m.type])).toEqual([['p-bier', -5, 'verkoop_online'], ['p-doos', -1, 'verkoop_online']]);
        if (u.uitkomst === 'opgehaald') expect(u.boekingen).toEqual([{ product_id: 'p-bier', hoeveelheid: -5, voorraad: 12 }, { product_id: 'p-doos', hoeveelheid: -1, voorraad: 11 }]);
        const r = o.regels[0]!;
        expect(r.klaargezet_at).not.toBeNull();
        expect(r).toMatchObject({ opgehaald_at: NU.toISOString(), opgehaald_door: 'user-1', opgehaald_bron: 'ba', leeftijd_vastgesteld_at: NU.toISOString() });
    });

    it('opgehaald: al ingepakt = niets extra geboekt', async () => {
        const o = await betaaldeOrder('a');
        store.pakIn(o.regels[0]!.id, true);
        const voor = store.mutaties.length;
        const u = store.haalOp('org-1', o.id, { leeftijd: 'vastgesteld' });
        expect(u).toMatchObject({ uitkomst: 'opgehaald', boekingen: [] });
        expect(store.mutaties).toHaveLength(voor);
        expect(stand('p-bier')).toBe(12);
    });

    it('al_opgehaald: twee keer ophalen boekt niets dubbel', async () => {
        const o = await betaaldeOrder('a');
        store.haalOp('org-1', o.id, { leeftijd: 'vastgesteld' });
        const u = store.haalOp('org-1', o.id, { leeftijd: 'vastgesteld', restMethode: 'pin' });
        expect(u).toMatchObject({ uitkomst: 'al_opgehaald', opgehaald_at: NU.toISOString(), nog_open: 0 });
        expect(store.mutaties).toHaveLength(2);
        expect(stand('p-bier')).toBe(12);
    });

    it('rest_nodig: open rest zonder methode, en er verandert niets', async () => {
        const o = await betaaldeOrder('a', [{ slug: 'kaasplankje', aantal: 1 }]);
        zetReservering(o, 1250);
        const u = store.haalOp('org-1', o.id);
        expect(u).toMatchObject({ uitkomst: 'rest_nodig', rest_cents: 1250, reeds_cents: 2250 });
        expect(o.rest_betaald_at).toBeNull();
        expect(o.regels[0]!.opgehaald_at).toBeNull();
        expect(store.mutaties).toHaveLength(0);
    });

    it('open rest met pin: rest geboekt, ingepakt en opgehaald in één stap', async () => {
        const o = await betaaldeOrder('a', [{ slug: 'kaasplankje', aantal: 1 }]);
        zetReservering(o, 1250);
        const u = store.haalOp('org-1', o.id, { restMethode: 'pin' });
        expect(u).toMatchObject({ uitkomst: 'opgehaald', rest_cents: 1250, rest_geboekt: 'pin', leeftijd: null });
        expect(o).toMatchObject({ rest_betaald_at: NU.toISOString(), rest_betaalmethode: 'pin' });
        expect(stand('p-kaas')).toBe(2);
    });

    it('rest al betaald: geen rest_nodig en niets opnieuw geboekt', async () => {
        const o = await betaaldeOrder('a', [{ slug: 'kaasplankje', aantal: 1 }]);
        zetReservering(o, 1250);
        await store.boekRest(o.id, 'contant');
        const u = store.haalOp('org-1', o.id, { restMethode: 'pin' });
        expect(u).toMatchObject({ uitkomst: 'opgehaald', rest_cents: 0, rest_geboekt: null });
        expect(o.rest_betaalmethode).toBe('contant');
    });

    it('leeftijd_nodig: alcohol zonder leeftijd, en er verandert niets', async () => {
        const o = await betaaldeOrder('a');
        expect(o.regels[0]!.alcohol).toBe(true);
        expect(store.haalOp('org-1', o.id)).toMatchObject({ uitkomst: 'leeftijd_nodig', alcohol: true });
        expect(o.regels[0]!.opgehaald_at).toBeNull();
        expect(o.regels[0]!.klaargezet_at).toBeNull();
        expect(store.mutaties).toHaveLength(0);
    });

    it('geweigerd: alleen de weigering vastgelegd, geen rest, ook bij open rest', async () => {
        const o = await betaaldeOrder('a');
        zetReservering(o);
        const u = store.haalOp('org-1', o.id, { leeftijd: 'geweigerd', doorUserId: 'user-1' });
        expect(u).toMatchObject({ uitkomst: 'geweigerd', rest_cents: 3250 });
        expect(u.uitkomst === 'geweigerd' && u.geweigerd_at).toBeTruthy();
        expect(o.leeftijd_geweigerd_at).toBeTruthy();
        expect(o.leeftijd_geweigerd_door).toBe('user-1');
        expect(o.rest_betaald_at).toBeNull();
        expect(o.regels[0]!.opgehaald_at).toBeNull();
        expect(o.regels[0]!.klaargezet_at).toBeNull();
        expect(store.mutaties).toHaveLength(0);
        expect(stand('p-bier')).toBe(17);
    });

    it('te_weinig_voorraad: alles of niets, ook over regels heen; rest niet geboekt', async () => {
        const o = await betaaldeOrder('a', [{ slug: 'bierpakket-35', aantal: 1 }, { slug: 'kaasplankje', aantal: 1 }]);
        zetReservering(o);
        /* Na het bestellen geteld: er liggen nog maar 1 kaas (regel 2 vraagt er 2). */
        store.producten.find((p) => p.id === 'p-kaas')!.voorraad = 1;
        const u = store.haalOp('org-1', o.id, { leeftijd: 'vastgesteld', restMethode: 'contant' });
        expect(u).toMatchObject({ uitkomst: 'te_weinig_voorraad', nummer: o.nummer });
        expect([stand('p-bier'), stand('p-doos'), stand('p-kaas')]).toEqual([17, 12, 1]);
        expect(store.mutaties).toHaveLength(0);
        expect(o.regels.map((r) => [r.klaargezet_at, r.opgehaald_at])).toEqual([[null, null], [null, null]]);
        expect(o.rest_betaald_at).toBeNull();
    });

    it('voorraadversie (BA-5): één handeling = één keer omhoog, ook met twee regels; niets gebeurd = niet omhoog', async () => {
        const o = await betaaldeOrder('a', [{ slug: 'bierpakket-35', aantal: 1 }, { slug: 'kaasplankje', aantal: 1 }]);
        const v0 = store.voorraadVersie();
        expect(store.haalOp('org-1', o.id)).toMatchObject({ uitkomst: 'leeftijd_nodig' });
        expect(store.haalOp('org-1', o.id, { leeftijd: 'geweigerd' })).toMatchObject({ uitkomst: 'geweigerd' });
        expect(store.voorraadVersie()).toBe(v0);
        expect(store.haalOp('org-1', o.id, { leeftijd: 'vastgesteld' })).toMatchObject({ uitkomst: 'opgehaald' });
        expect(store.mutaties.length).toBeGreaterThan(1);
        expect(store.voorraadVersie()).toBe(v0 + 1);
        expect(store.haalOpTerug('org-1', o.id)).toMatchObject({ uitkomst: 'teruggezet' });
        expect(store.voorraadVersie()).toBe(v0 + 2);
    });

    it('de dozen van de order gaan mee op opgehaald; een al gescande doos blijft zoals hij was', async () => {
        const o = await betaaldeOrder('a');
        const regel = o.regels[0]!.id;
        store.dozen.push({ id: 1, order_id: o.id, order_regel_id: regel, opgehaald_at: null, opgehaald_door: null },
            { id: 2, order_id: o.id, order_regel_id: regel, opgehaald_at: '2026-11-20T11:00:00.000Z', opgehaald_door: 'scan' });
        store.haalOp('org-1', o.id, { leeftijd: 'vastgesteld', doorUserId: 'user-1' });
        expect(store.dozen.map((d) => [d.opgehaald_at, d.opgehaald_door])).toEqual([[NU.toISOString(), 'user-1'], ['2026-11-20T11:00:00.000Z', 'scan']]);
    });

    it('bron, medewerker en leeftijd alleen op regels met alcohol', async () => {
        const o = await betaaldeOrder('a', [{ slug: 'bierpakket-35', aantal: 1 }, { slug: 'kaasplankje', aantal: 1 }]);
        store.haalOp('org-1', o.id, { leeftijd: 'vastgesteld', bron: 'toonbank', medewerkerId: 'pers-1' });
        expect(o.regels.map((r) => [r.alcohol, r.opgehaald_bron, r.opgehaald_medewerker_id, r.leeftijd_vastgesteld_at]))
            .toEqual([[true, 'toonbank', 'pers-1', NU.toISOString()], [false, 'toonbank', 'pers-1', null]]);
    });
});

describe('haalOpTerug (geheugen) — alleen status, alleen dezelfde dag', () => {
    it('zelfde dag: opgehaald eraf, voorraad en rest blijven', async () => {
        const o = await betaaldeOrder('a');
        zetReservering(o);
        const regel = o.regels[0]!.id;
        store.dozen.push({ id: 1, order_id: o.id, order_regel_id: regel, opgehaald_at: null, opgehaald_door: null });
        store.haalOp('org-1', o.id, { leeftijd: 'vastgesteld', restMethode: 'pin' });
        const mutatiesNa = store.mutaties.length;

        store.zetNu(new Date('2026-11-20T16:00:00Z'));
        expect(store.haalOpTerug('org-1', o.id)).toEqual({ uitkomst: 'teruggezet', order_id: o.id, nummer: o.nummer, regels: 1, dozen: 1 });
        expect(o.regels[0]).toMatchObject({ opgehaald_at: null, opgehaald_door: null, opgehaald_bron: null, leeftijd_vastgesteld_at: null });
        expect(o.regels[0]!.klaargezet_at).not.toBeNull();
        expect(store.dozen[0]!.opgehaald_at).toBeNull();
        expect(store.mutaties).toHaveLength(mutatiesNa);
        expect(stand('p-bier')).toBe(12);
        expect(o.rest_betaalmethode).toBe('pin');

        /* En daarna weer gewoon op te halen, zonder dubbele boeking of rest. */
        expect(store.haalOp('org-1', o.id, { leeftijd: 'vastgesteld' })).toMatchObject({ uitkomst: 'opgehaald', boekingen: [], rest_geboekt: null });
        expect(stand('p-bier')).toBe(12);
    });

    it('een dag later: niet_zelfde_dag, niets gewijzigd', async () => {
        const o = await betaaldeOrder('a');
        store.haalOp('org-1', o.id, { leeftijd: 'vastgesteld' });
        store.zetNu(new Date('2026-11-21T09:00:00Z'));
        expect(store.haalOpTerug('org-1', o.id)).toMatchObject({ uitkomst: 'niet_zelfde_dag', opgehaald_at: NU.toISOString() });
        expect(o.regels[0]!.opgehaald_at).toBe(NU.toISOString());
    });

    it('niet opgehaald of onbekend', async () => {
        const o = await betaaldeOrder('a');
        expect(store.haalOpTerug('org-1', o.id)).toEqual({ uitkomst: 'niet_opgehaald', order_id: o.id, nummer: o.nummer });
        expect(store.haalOpTerug('org-2', o.id)).toEqual({ uitkomst: 'onbekend', order_id: o.id });
    });
});
