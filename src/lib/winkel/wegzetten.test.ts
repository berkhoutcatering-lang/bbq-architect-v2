/**
 * BA-6 — wegzet-taken: de 4 Naober uit plan v5, tegen de geheugen-opslag,
 * plus de pure regels uit wegzetten.ts.
 *
 *   - 6 liggen er, 4 gereserveerd → apart → er liggen er 2, gereserveerd 0;
 *   - nog een keer → al_apart, niets extra;
 *   - 3 op het schap en 4 nodig → WV010, en er verandert niets;
 *   - terugdraaien na ophalen → WV011, en er verandert niets.
 *
 * Dezelfde regels draaien in de database (winkel_zet_order_apart en
 * winkel_zet_order_apart_terug); die zijn los getest in
 * supabase/tests/winkel_wegzetten.sql.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MYPOS_TEST } from '@/lib/mypos/ipc';
import { maakGeheugenStore, type GeheugenStore } from './geheugenStore';
import { _resetControleKlok, plaatsOrder, type KassaContext } from './kassa';
import type { Artikel, Product, Slot } from './rekenen';
import { voorraadFout } from './voorraad';
import { afhaalTekst, dagKort, isRood, taakTekst, taakUitRij, tekortenVoorApart, vandaagApartGezet, zelfdeBedrijfsdag, type WegzetTaak } from './wegzetten';

/* ── De winkel: Naober los (wegzetten) en een cadeaudoos (inpakken) ──────── */

const artikel = (id: string, slug: string, naam: string, prijs: number, extra: Partial<Artikel> = {}): Artikel => ({
    id, slug, naam, eenheid: 'per stuk', telt: 'stuks', prijs_cents: prijs, btw_pct: 21, minimum: 1, maximum: null,
    verzendbaar: false, gekoeld: false, moment_soort: 'moment', moment_groep: 'afhalen', afhaalmoment_tekst: null,
    capaciteit_soort: 'regel', doos_klein_max: null, doos_groot: null, voorraad: null, actief: true, publiek: true, ...extra,
});
const naober = artikel('a-naober', 'roeg-naober', 'Naober', 345, { segment: 'bier', alcohol: true, afhandeling: 'wegzetten' });
const doos = artikel('a-doos', 'cadeaudoos', 'Cadeaudoos', 500);
const product = (id: string, naam: string, voorraad: number | null): Omit<Product, 'voorraad_bezet'> =>
    ({ id, naam, type: 'overig', eenheid: 'stuk', prijs_per: 1, winkelprijs_incl_cents: null, inkoop_excl_cents: null, btw_pct: 21, alcohol: false, voorraad, actief: true });
const slot = (id: string, artikelId: string, naam: string, p: string): Slot =>
    ({ id, artikel_id: artikelId, volgorde: 1, slot_type: 'overig', naam, hoeveelheid: 1, eenheid: 'stuk', per: 'stuk', standaard_product_id: p, wisselbaar: false, alternatieven: [] });
const momenten = [{ id: 'm-za', groep: 'afhalen', datum: '2026-11-21', van: '14:00:00', tot: '17:00:00', capaciteit: null, bestellen_tot: null, sluit_op: null, actief: true }];
const tenant = { orgId: 'org-1', slug: 'hop-en-bites', bedrijfsnaam: 'Hop & Bites', email: null, telefoon: null, brandColor: null, ondertitel: null };
const instellingen = { verzendkosten_cents: null, gratis_verzenden_vanaf_cents: null, verzendkosten_btw_pct: 21, reservering_minuten: 30, offerte_geldig_minuten: 15, kassa_open: true, site_url: 'https://hopbites.nl', reservering_bedrag_cents: null, qr_basis_url: null };
const NU = new Date('2026-11-20T12:00:00Z');

let store: GeheugenStore;
let ctx: KassaContext;
beforeEach(() => {
    store = maakGeheugenStore({
        tenant, artikelen: [naober, doos], momenten,
        producten: [product('p-naober', 'Naober', 6), product('p-doos', 'Doos', 10)],
        slots: [slot('s1', 'a-naober', 'Naober', 'p-naober'), slot('s2', 'a-doos', 'Doos', 'p-doos')],
        instellingen, nu: NU,
    });
    ctx = { store, mypos: MYPOS_TEST, appUrl: 'https://bbq-architect-v2.vercel.app', mail: async () => ({ success: true }), nu: () => NU };
    _resetControleKlok();
});

const contact = { naam: 'Jansen', email: 'jansen@voorbeeld.nl', telefoon: '0612345678' };
async function bestel(kort: string, regels: { slug: string; aantal: number }[], totaal: number, betaal = true) {
    const sleutel = `sleutel-${kort}`;
    const uit = await plaatsOrder(ctx, 'hop-en-bites', {
        mand: { versie: 1, regels: regels.map((r) => ({ ...r, moment: 'm-za' })) }, leverwijze: 'afhalen', momentId: null,
        contact, adres: null, opmerking: '', sleutel, terugUrl: '/bestelling', verwachtTotaalCenten: totaal,
    });
    expect(uit.body).toMatchObject({ ok: true });
    const o = store.orders.find((x) => x.sleutel === sleutel)!;
    if (betaal) await store.bevestigBetaling(o.id, { trnref: `t-${o.id}`, centen: totaal, methode: null });
    return o;
}
const stand = (id: string) => store.producten.find((p) => p.id === id)!.voorraad;
const gereserveerd = async (id: string) => (await store.laadBronnen('org-1'))!.producten.find((p) => p.id === id)!.voorraad_bezet ?? 0;

describe('apart zetten — de 4 Naober (geheugen-opslag)', () => {
    it('6 liggen er, 4 gereserveerd → apart → er liggen er 2, gereserveerd 0', async () => {
        const o = await bestel('s-1', [{ slug: 'roeg-naober', aantal: 4 }], 1380);
        expect(stand('p-naober')).toBe(6);
        expect(await gereserveerd('p-naober')).toBe(4);

        const uit = store.zetOrderApart(o.id);
        expect(uit).toEqual({ ok: true, uitkomst: 'apart', boekingen: [{ regel_id: o.regels[0]!.id, product_id: 'p-naober', hoeveelheid: -4, type: 'verkoop_online' }] });
        expect(stand('p-naober')).toBe(2);
        expect(await gereserveerd('p-naober')).toBe(0);
        expect(store.mutaties).toHaveLength(1);
    });

    it('nog een keer = al_apart, niets extra', async () => {
        const o = await bestel('s-1', [{ slug: 'roeg-naober', aantal: 4 }], 1380);
        store.zetOrderApart(o.id);
        expect(store.zetOrderApart(o.id)).toEqual({ ok: true, uitkomst: 'al_apart', boekingen: [] });
        expect(stand('p-naober')).toBe(2);
        expect(store.mutaties).toHaveLength(1);
    });

    it('3 op het schap en 4 nodig → WV010 met het tekort, en er verandert niets', async () => {
        const o = await bestel('s-1', [{ slug: 'roeg-naober', aantal: 4 }], 1380);
        /* De toonbank verkocht er 3 boven vrij (override). */
        store.producten.find((p) => p.id === 'p-naober')!.voorraad = 3;
        expect(store.zetOrderApart(o.id)).toEqual({ ok: false, code: 'WV010', tekorten: [{ product_id: 'p-naober', naam: 'Naober', ligt_er: 3, nodig: 4 }] });
        expect(stand('p-naober')).toBe(3);
        expect(store.mutaties).toHaveLength(0);
        expect(o.regels[0]!.klaargezet_at).toBeNull();
        expect(await gereserveerd('p-naober')).toBe(4);
    });

    it('terugdraaien na ophalen → WV011, en er verandert niets', async () => {
        const o = await bestel('s-1', [{ slug: 'roeg-naober', aantal: 4 }], 1380);
        store.zetOrderApart(o.id);
        o.regels[0]!.opgehaald_at = NU.toISOString();
        expect(store.zetOrderApartTerug(o.id)).toEqual({ ok: false, code: 'WV011' });
        expect(stand('p-naober')).toBe(2);
        expect(store.mutaties).toHaveLength(1);
        expect(o.regels[0]!.klaargezet_at).not.toBeNull();
    });

    it('terugdraaien op dezelfde dag = retour; de reservering is terug; een tweede keer = niet_apart', async () => {
        const o = await bestel('s-1', [{ slug: 'roeg-naober', aantal: 4 }], 1380);
        store.zetOrderApart(o.id);
        const terug = store.zetOrderApartTerug(o.id);
        expect(terug).toEqual({ ok: true, uitkomst: 'ongedaan', boekingen: [{ regel_id: o.regels[0]!.id, product_id: 'p-naober', hoeveelheid: 4, type: 'retour' }] });
        expect(stand('p-naober')).toBe(6);
        expect(await gereserveerd('p-naober')).toBe(4);
        expect(store.zetOrderApartTerug(o.id)).toEqual({ ok: true, uitkomst: 'niet_apart', boekingen: [] });
    });

    it('voorraadversie (BA-5): apart en ongedaan elk één keer omhoog; WV010, al_apart en niet_apart niet', async () => {
        const o = await bestel('s-1', [{ slug: 'roeg-naober', aantal: 4 }, { slug: 'cadeaudoos', aantal: 1 }], 1880);
        const v0 = store.voorraadVersie();
        store.producten.find((p) => p.id === 'p-naober')!.voorraad = 3;
        expect(store.zetOrderApart(o.id)).toMatchObject({ ok: false, code: 'WV010' });
        expect(store.voorraadVersie()).toBe(v0);
        store.producten.find((p) => p.id === 'p-naober')!.voorraad = 6;
        expect(store.zetOrderApart(o.id)).toMatchObject({ ok: true, uitkomst: 'apart' });
        expect(store.voorraadVersie()).toBe(v0 + 1);
        expect(store.zetOrderApart(o.id)).toMatchObject({ ok: true, uitkomst: 'al_apart' });
        expect(store.voorraadVersie()).toBe(v0 + 1);
        expect(store.zetOrderApartTerug(o.id)).toMatchObject({ ok: true, uitkomst: 'ongedaan' });
        expect(store.voorraadVersie()).toBe(v0 + 2);
        expect(store.zetOrderApartTerug(o.id)).toMatchObject({ ok: true, uitkomst: 'niet_apart' });
        expect(store.voorraadVersie()).toBe(v0 + 2);
        /* Alleen de wegzet-regel: de cadeaudoos (inpakken) blijft voor de makerij. */
        expect(o.regels.find((r) => r.slug === 'cadeaudoos')!.klaargezet_at).toBeNull();
    });

    it('terugdraaien op een latere dag = niet_zelfde_dag, er verandert niets', async () => {
        const o = await bestel('s-1', [{ slug: 'roeg-naober', aantal: 4 }], 1380);
        store.zetOrderApart(o.id);
        store.zetNu(new Date('2026-11-21T09:00:00Z'));
        expect(store.zetOrderApartTerug(o.id)).toEqual({ ok: true, uitkomst: 'niet_zelfde_dag', boekingen: [] });
        expect(stand('p-naober')).toBe(2);
    });

    it('niet betaald = WV006; een order zonder losse winkelwaar = geen_taak', async () => {
        const open = await bestel('s-1', [{ slug: 'roeg-naober', aantal: 1 }], 345, false);
        expect(store.zetOrderApart(open.id)).toEqual({ ok: false, code: 'WV006' });
        const pakket = await bestel('s-2', [{ slug: 'cadeaudoos', aantal: 1 }], 500);
        expect(store.zetOrderApart(pakket.id)).toEqual({ ok: true, uitkomst: 'geen_taak', boekingen: [] });
        expect(store.zetOrderApart(9999)).toEqual({ ok: false, code: 'onbekend' });
    });

    it('een pakketregel in dezelfde order blijft liggen voor de makerij', async () => {
        const o = await bestel('s-1', [{ slug: 'roeg-naober', aantal: 2 }, { slug: 'cadeaudoos', aantal: 1 }], 1190);
        const uit = store.zetOrderApart(o.id);
        expect(uit.ok && uit.boekingen.map((b) => b.product_id)).toEqual(['p-naober']);
        expect(stand('p-doos')).toBe(10);
        expect(o.regels.find((r) => r.slug === 'cadeaudoos')!.klaargezet_at).toBeNull();
    });
});

/* ── De pure regels ──────────────────────────────────────────────────────── */

const taak = (extra: Partial<WegzetTaak> = {}): WegzetTaak => ({
    order_id: 1042, nummer: 'HB-2026-1042', naam: 'Jansen',
    /* Zaterdag 21 november 2026, 14:00 in Amsterdam. */
    afhaalmoment: '2026-11-21T13:00:00+00:00', ophalen_binnen_24u: false,
    regels: [{ regel_id: 7, artikel: 'Naober', aantal: 4, producten: [{ product_id: 'p-naober', naam: 'Naober', hoeveelheid: 4, eenheid: 'stuk' }] }],
    ...extra,
});

describe('taakTekst', () => {
    it('Zet 4 × Naober apart voor HB-2026-1042 (Jansen, za)', () => {
        expect(taakTekst(taak())).toBe('Zet 4 × Naober apart voor HB-2026-1042 (Jansen, za)');
    });
    it('telt hetzelfde product over regels op en somt verschillende op', () => {
        const t = taak({
            regels: [
                { regel_id: 1, artikel: 'Naober', aantal: 4, producten: [{ product_id: 'p-n', naam: 'Naober', hoeveelheid: 4 }] },
                { regel_id: 2, artikel: 'Naober', aantal: 2, producten: [{ product_id: 'p-n', naam: 'Naober', hoeveelheid: 2 }] },
                { regel_id: 3, artikel: 'Roeg Blond', aantal: 1, producten: [{ product_id: 'p-b', naam: 'Roeg Blond', hoeveelheid: 1 }] },
                { regel_id: 4, artikel: 'Amandelen', aantal: 1, producten: [{ product_id: 'p-a', naam: 'BBQ-amandelen', hoeveelheid: 150, eenheid: 'gram' }] },
            ],
        });
        expect(taakTekst(t)).toBe('Zet 6 × Naober, 1 × Roeg Blond en 150 g BBQ-amandelen apart voor HB-2026-1042 (Jansen, za)');
    });
    it('zonder inhoud telt het artikel; zonder moment geen dag', () => {
        expect(taakTekst(taak({ afhaalmoment: null, regels: [{ regel_id: 1, artikel: 'Naober', aantal: 3, producten: [] }] })))
            .toBe('Zet 3 × Naober apart voor HB-2026-1042 (Jansen)');
    });
    it('de dag volgt Amsterdam, niet UTC', () => {
        /* Vrijdag 23:30 UTC = zaterdag 00:30 in Amsterdam (wintertijd). */
        expect(dagKort('2026-11-20T23:30:00Z')).toBe('za');
        expect(afhaalTekst('2026-11-21T13:00:00Z')).toBe('za 21 nov 14:00');
        expect(afhaalTekst('2026-11-20T23:00:00Z')).toBe('za 21 nov');
    });
});

describe('isRood — ophalen binnen 24 uur', () => {
    it('24 uur of minder is rood, meer niet; voorbij is ook rood', () => {
        expect(isRood(taak(), new Date('2026-11-20T13:00:00Z'))).toBe(true);
        expect(isRood(taak(), new Date('2026-11-20T12:59:00Z'))).toBe(false);
        expect(isRood(taak(), new Date('2026-11-22T09:00:00Z'))).toBe(true);
    });
    it('zonder moment: wat de database zei', () => {
        expect(isRood(taak({ afhaalmoment: null, ophalen_binnen_24u: true }), NU)).toBe(true);
        expect(isRood(taak({ afhaalmoment: null }), NU)).toBe(false);
    });
});

describe('taakUitRij — een rij uit winkel_wegzet_taken', () => {
    it('zet numeric-tekst om en laat contactgegevens weg', () => {
        const t = taakUitRij({
            id: 1042, organization_id: 'org-1', order_id: '1042', nummer: 'HB-2026-1042', naam: 'Jansen',
            afhaalmoment: '2026-11-21T13:00:00+00:00', ophalen_binnen_24u: true, contact_email: 'niet@hier.nl',
            regels: [{ regel_id: '7', artikel: 'Naober', aantal: 4, producten: [{ product_id: 'p-naober', naam: 'Naober', hoeveelheid: '4', eenheid: 'stuk' }] }],
        });
        expect(t).toEqual(taak({ ophalen_binnen_24u: true }));
        expect(t).not.toHaveProperty('contact_email');
    });
    it('weigert een rij zonder order of nummer', () => {
        expect(taakUitRij(null)).toBeNull();
        expect(taakUitRij({ nummer: 'HB-1' })).toBeNull();
        expect(taakUitRij({ order_id: 1 })).toBeNull();
    });
});

describe('tekortenVoorApart — dezelfde regel als de database', () => {
    const producten = [{ id: 'p-n', naam: 'Naober', voorraad: 3 }, { id: 'p-x', naam: 'Nooit geteld', voorraad: null }, { id: 'p-b', naam: 'Blond', voorraad: 10 }];
    it('meldt alleen bijgehouden producten waar te weinig van ligt', () => {
        expect(tekortenVoorApart([{ product_id: 'p-n', hoeveelheid: 2 }, { product_id: 'p-n', hoeveelheid: 2 }, { product_id: 'p-x', hoeveelheid: 99 }, { product_id: 'p-b', hoeveelheid: 10 }, { product_id: null, hoeveelheid: 1 }], producten))
            .toEqual([{ product_id: 'p-n', naam: 'Naober', ligt_er: 3, nodig: 4 }]);
    });
    it('precies genoeg is genoeg', () => {
        expect(tekortenVoorApart([{ product_id: 'p-n', hoeveelheid: 3 }], producten)).toEqual([]);
    });
});

describe('vandaagApartGezet — wat nog terug kan', () => {
    const regel = (id: number, artikel_id: string, klaargezet_at: string | null, opgehaald_at: string | null = null) =>
        ({ id, artikel_id, naam: artikel_id === 'a-naober' ? 'Naober' : 'Cadeaudoos', aantal: 2, klaargezet_at, opgehaald_at });
    const order = (id: number, status: string, regels: ReturnType<typeof regel>[]) =>
        ({ id, nummer: `HB-2026-${String(id).padStart(4, '0')}`, contact_naam: `Klant ${id}`, status, winkel_order_regels: regels });
    const wegzet = new Set(['a-naober']);
    const nu = new Date('2026-11-20T15:00:00Z');

    it('alleen betaald, apart gezet vandaag en niet opgehaald; nieuwste eerst', () => {
        const uit = vandaagApartGezet([
            order(1, 'betaald', [regel(11, 'a-naober', '2026-11-20T09:00:00Z')]),
            order(2, 'betaald', [regel(21, 'a-naober', '2026-11-20T14:00:00Z'), regel(22, 'a-doos', '2026-11-20T14:00:00Z')]),
            order(3, 'betaald', [regel(31, 'a-naober', '2026-11-19T09:00:00Z')]),
            order(4, 'betaald', [regel(41, 'a-naober', '2026-11-20T09:00:00Z', '2026-11-20T10:00:00Z')]),
            order(5, 'betaald', [regel(51, 'a-naober', null)]),
            order(6, 'betaald', [regel(61, 'a-doos', '2026-11-20T09:00:00Z')]),
            order(7, 'afgebroken', [regel(71, 'a-naober', '2026-11-20T09:00:00Z')]),
        ], wegzet, nu);
        expect(uit.map((x) => x.order_id)).toEqual([2, 1]);
        /* Alleen de wegzet-regel; de doos is iets voor de makerij. */
        expect(uit[0]!.regels).toEqual([{ regel_id: 21, artikel: 'Naober', aantal: 2 }]);
    });
});

describe('zelfdeBedrijfsdag', () => {
    it('rekent in Amsterdam', () => {
        expect(zelfdeBedrijfsdag('2026-11-20T22:30:00Z', new Date('2026-11-20T23:30:00Z'))).toBe(false);
        expect(zelfdeBedrijfsdag('2026-11-20T08:00:00Z', new Date('2026-11-20T22:59:00Z'))).toBe(true);
    });
});

describe('voorraadFout — WV010 en WV011', () => {
    it('WV010 met de tekorten uit DETAIL', () => {
        const details = JSON.stringify({ wv_code: 'WV010', order_id: 1042, nummer: 'HB-2026-1042', tekorten: [{ product_id: 'p', naam: 'Naober', ligt_er: 3, nodig: 4 }] });
        expect(voorraadFout('WV010', 'WV010: te weinig voorraad om HB-2026-1042 apart te zetten', details))
            .toBe('Te weinig op het schap om apart te zetten. Naober: er liggen er 3, deze order vraagt er 4. Er is niets apart gezet: tel het schap en corrigeer de voorraad.');
    });
    it('WV010 zonder bruikbare details', () => {
        expect(voorraadFout('WV010', 'WV010: te weinig', 'geen json')).toBe('Te weinig op het schap om apart te zetten. Er is niets apart gezet: tel het schap en corrigeer de voorraad.');
    });
    it('WV011, WV006 en een gewone melding', () => {
        expect(voorraadFout('WV011', 'WV011: order HB-2026-1042 is al opgehaald')).toMatch(/al opgehaald/);
        expect(voorraadFout('WV006', 'WV006: order HB-1 is niet betaald (wacht)')).toMatch(/niet betaald/);
        expect(voorraadFout('P0001', 'iets anders')).toBe('iets anders');
    });
    it('alleen de SQLSTATE telt: een code in de tekst bij P0001 wordt niet vertaald', () => {
        expect(voorraadFout('P0001', 'WV010: te weinig')).toBe('WV010: te weinig');
    });
});
