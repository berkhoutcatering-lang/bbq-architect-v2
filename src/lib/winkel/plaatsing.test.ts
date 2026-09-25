import { beforeEach, describe, expect, it } from 'vitest';
import { maakGeheugenStore, type GeheugenStore } from './geheugenStore';
import { eventNaam, hertelEvent, plaatsBestelling, telTotalen, wensenSamenvatting } from './plaatsing';
import type { Artikel } from './rekenen';
import type { OrderRegelRij, RegelOpEvent } from './store';

/* ── Catalogus ─────────────────────────────────────────────────────────────── */
const basis: Omit<Artikel, 'id' | 'slug' | 'naam'> = {
    eenheid: 'per stuk', telt: 'stuks', prijs_cents: 100, btw_pct: 9, minimum: 1, maximum: null,
    verzendbaar: true, gekoeld: false, moment_soort: 'geen', moment_groep: null, afhaalmoment_tekst: null,
    capaciteit_soort: 'aantal', doos_klein_max: null, doos_groot: null, voorraad: null, actief: true, publiek: true,
};
const KERST = 'g-kerst';
const VEGA = 'g-vega';
const artikelen: Artikel[] = [
    { ...basis, id: 'a-kerst', slug: 'kerst-box', naam: 'Kerst-Box', eenheid: 'per persoon', telt: 'personen', prijs_cents: 2350, minimum: 2, verzendbaar: false, gekoeld: true, moment_soort: 'dag', moment_groep: 'kerst-box', capaciteit_soort: 'dozen', doos_klein_max: 3, doos_groot: 5, gerecht_id: KERST },
    { ...basis, id: 'a-vega', slug: 'kerst-box-vegetarisch', naam: 'Kerst-Box vegetarisch', eenheid: 'per persoon', telt: 'personen', prijs_cents: 2350, minimum: 2, verzendbaar: false, gekoeld: true, moment_soort: 'dag', moment_groep: 'kerst-box', capaciteit_soort: 'dozen', doos_klein_max: 3, doos_groot: 5, gerecht_id: VEGA, dieet: 'vegetarisch', publiek: false },
    { ...basis, id: 'a-plank', slug: 'borrel-journey', naam: 'Borrel Journey', eenheid: 'per persoon', telt: 'personen', prijs_cents: 1495, minimum: 8, verzendbaar: false, gekoeld: true, moment_soort: 'moment', moment_groep: 'agenda', capaciteit_soort: 'regel' },
    { ...basis, id: 'a-bier', slug: 'drenthe-bieravond', naam: 'Drenthe bieravond', eenheid: 'per doos', prijs_cents: 2995, inventory_id: 7, inkoop_per_stuk: 3 },
];
const momenten = [
    { id: 'd-23', groep: 'kerst-box', datum: '2026-12-23', van: null, tot: null, capaciteit: 25, bestellen_tot: null, actief: true },
    { id: 'd-24', groep: 'kerst-box', datum: '2026-12-24', van: null, tot: null, capaciteit: 25, bestellen_tot: null, actief: true },
    { id: 'm-1', groep: 'agenda', datum: '2026-10-16', van: '12:00:00', tot: '13:00:00', capaciteit: 4, bestellen_tot: null, actief: true },
];
const tenant = { orgId: 'org-1', slug: 'hop-en-bites', bedrijfsnaam: 'Hop & Bites', email: null, telefoon: null, brandColor: null, ondertitel: null };
const nu = new Date('2026-09-25T10:00:00Z');

let store: GeheugenStore;
beforeEach(() => {
    store = maakGeheugenStore({
        tenant, artikelen, momenten, nu,
        instellingen: { verzendkosten_cents: 695, gratis_verzenden_vanaf_cents: null, verzendkosten_btw_pct: 21, reservering_minuten: 30, offerte_geldig_minuten: 15, kassa_open: true, site_url: null },
    });
});

/** Een betaalde order rechtstreeks in de opslag — de kassa zelf is elders getest. */
async function betaaldeOrder(nummerHint: string, regels: { artikel: Artikel; aantal: number; moment: string | null }[], opties: { momentId?: string | null; naam?: string; opmerking?: string } = {}) {
    const uit = await store.plaatsOrder({
        orgId: tenant.orgId, sleutel: `s-${nummerHint}`, token: `t-${nummerHint}`, leverwijze: 'afhalen', momentId: opties.momentId ?? null,
        contact: { naam: opties.naam ?? 'Jan Jansen', email: 'jan@voorbeeld.nl', telefoon: '' }, adres: null, opmerking: opties.opmerking ?? '',
        subtotaalCenten: 0, leverkostenCenten: 0, totaalCenten: 0, btwCenten: {}, terugUrl: '/b',
        regels: regels.map((r) => ({
            slug: r.artikel.slug, naam: r.artikel.naam, aantal: r.aantal, eenheid: r.artikel.eenheid, stukCenten: r.artikel.prijs_cents ?? 0, bedragCenten: 0, afhaalmoment: null,
            artikel_id: r.artikel.id, btw_pct: 9, moment_id: r.moment, eenheden: 1, voorraad_eenheden: 0,
        })),
    });
    if (uit.ok === false) throw new Error(uit.code);
    await store.startBetaalpoging(uit.waarde.id);
    await store.bevestigBetaling(uit.waarde.id, { trnref: `trn-${nummerHint}`, centen: 0, methode: '2' });
    return (await store.vindOrderOpToken(tenant.orgId, `t-${nummerHint}`))!;
}

/* ── Zuiver ────────────────────────────────────────────────────────────────── */
describe('eventNaam', () => {
    it('noemt de artikelen, tot twee', () => {
        expect(eventNaam(['Kerst-Box', 'Kerst-Box', 'Kerst-Box vegetarisch'], 'kerst-box')).toBe('Kerst-Box + Kerst-Box vegetarisch · afhalen');
    });
    it('valt terug op de groep bij meer dan twee', () => {
        expect(eventNaam(['A', 'B', 'C'], 'kerst-box')).toBe('Kerst-box · afhalen');
        expect(eventNaam([], 'agenda')).toBe('Webshop · afhalen');
    });
});

describe('wensenSamenvatting', () => {
    it('zegt alleen wat er staat', () => {
        expect(wensenSamenvatting({ vegetarisch: 1, veganistisch: 0, glutenvrij: 0, allergenen: ['noten'], overig: [] })).toBe('1 vegetarisch · allergie: noten');
        expect(wensenSamenvatting({ vegetarisch: 0, veganistisch: 0, glutenvrij: 0, allergenen: [], overig: [] })).toBeNull();
        expect(wensenSamenvatting(null)).toBeNull();
    });
});

describe('telTotalen', () => {
    const art = new Map(artikelen.map((a) => [a.id, a]));
    const regel = (id: number, a: Artikel, aantal: number): OrderRegelRij => ({
        id, artikel_id: a.id, slug: a.slug, naam: a.naam, aantal, eenheid: a.eenheid, stuk_cents: 0, bedrag_cents: 0, btw_pct: 9,
        moment_id: 'd-23', eenheden: 1, voorraad_eenheden: 0, afhaalmoment_tekst: null, klaar_op: '2026-12-23', event_id: 1, klaargezet_at: null,
    });
    it('telt per gerecht en telt vegetarisch uit artikel én opmerking, zonder dubbel', () => {
        const rijen: RegelOpEvent[] = [
            { regel: regel(1, artikelen[0], 4), order: { id: 1, nummer: 'HB-2026-0001', contact_naam: 'Jan Jansen', opmerking: '4 personen waarvan 1 vega', wensen: { vegetarisch: 1, veganistisch: 0, glutenvrij: 0, allergenen: [], overig: [] } } },
            { regel: regel(2, artikelen[0], 10), order: { id: 2, nummer: 'HB-2026-0002', contact_naam: 'Fam. de Vries', opmerking: null, wensen: null } },
            /* Deze order heeft al een vegetarische box; "2 vega" in de opmerking is dezelfde mensen. */
            { regel: regel(3, artikelen[0], 3), order: { id: 3, nummer: 'HB-2026-0003', contact_naam: 'Bakkerij Smit', opmerking: 'geen noten, 2 vega', wensen: { vegetarisch: 2, veganistisch: 0, glutenvrij: 0, allergenen: ['noten'], overig: [] } } },
            { regel: regel(4, artikelen[1], 2), order: { id: 3, nummer: 'HB-2026-0003', contact_naam: 'Bakkerij Smit', opmerking: 'geen noten, 2 vega', wensen: { vegetarisch: 2, veganistisch: 0, glutenvrij: 0, allergenen: ['noten'], overig: [] } } },
        ];
        const t = telTotalen(rijen, art);
        expect(t.guests).toBe(19);
        expect(t.veg_guests).toBe(3); // 2 (artikel) + 1 (opmerking order 1); order 3 niet dubbel
        expect(t.menu).toEqual([KERST, VEGA]);
        expect(t.menu_gasten).toEqual({ [KERST]: 17, [VEGA]: 2 });
        expect(t.notitie.split('\n')).toEqual([
            'HB-2026-0001 · Jan Jansen · 4× Kerst-Box · uit opmerking: 1 vegetarisch',
            'HB-2026-0002 · Fam. de Vries · 10× Kerst-Box',
            'HB-2026-0003 · Bakkerij Smit · 3× Kerst-Box, 2× Kerst-Box vegetarisch · uit opmerking: 2 vegetarisch · allergie: noten',
        ]);
    });
    it('zet een ongelezen opmerking letterlijk in de notitie', () => {
        const t = telTotalen([{ regel: regel(1, artikelen[0], 4), order: { id: 1, nummer: 'HB-2026-0001', contact_naam: 'Jan', opmerking: 'graag bellen', wensen: null } }], art);
        expect(t.notitie).toBe('HB-2026-0001 · Jan · 4× Kerst-Box · opmerking: "graag bellen"');
    });
    it('artikel zonder gerecht telt wel mee in de gasten, niet in het menu', () => {
        const t = telTotalen([{ regel: regel(1, artikelen[2], 8), order: { id: 1, nummer: 'HB-2026-0001', contact_naam: 'Jan', opmerking: null, wensen: null } }], art);
        expect(t.guests).toBe(8);
        expect(t.menu).toEqual([]);
    });
});

/* ── Met de opslag ─────────────────────────────────────────────────────────── */
describe('plaatsBestelling', () => {
    it('maakt één event per afhaaldag en telt op', async () => {
        const o1 = await betaaldeOrder('1', [{ artikel: artikelen[0], aantal: 4, moment: 'd-23' }], { opmerking: '' });
        const u1 = await plaatsBestelling(store, tenant, o1, nu);
        expect(u1.status).toBe('geplaatst');
        expect(store.events).toHaveLength(1);
        expect(store.events[0]).toMatchObject({ name: 'Kerst-Box · afhalen', date: '2026-12-23', winkel_moment_id: 'd-23', status: 'confirmed', type: 'Webshop', guests: 4, menu: [KERST], menu_gasten: { [KERST]: 4 } });
        expect(store.orders[0].regels[0]).toMatchObject({ klaar_op: '2026-12-23', event_id: store.events[0].id });
        expect(store.orders[0]).toMatchObject({ plaatsing_status: 'geplaatst', plaatsing_fout: null });

        const o2 = await betaaldeOrder('2', [{ artikel: artikelen[1], aantal: 3, moment: 'd-23' }], { naam: 'Fam. de Vries' });
        await plaatsBestelling(store, tenant, o2, nu);
        expect(store.events).toHaveLength(1);
        expect(store.events[0]).toMatchObject({ guests: 7, veg_guests: 3, menu: [KERST, VEGA], menu_gasten: { [KERST]: 4, [VEGA]: 3 } });
        expect(store.events[0].notitie).toBe('HB-2026-0001 · Jan Jansen · 4× Kerst-Box\nHB-2026-0002 · Fam. de Vries · 3× Kerst-Box vegetarisch');

        const o3 = await betaaldeOrder('3', [{ artikel: artikelen[0], aantal: 2, moment: 'd-24' }]);
        await plaatsBestelling(store, tenant, o3, nu);
        expect(store.events.map((e) => e.date)).toEqual(['2026-12-23', '2026-12-24']);
    });

    it('is idempotent: twee keer plaatsen verandert niets', async () => {
        const o = await betaaldeOrder('1', [{ artikel: artikelen[0], aantal: 4, moment: 'd-23' }]);
        await plaatsBestelling(store, tenant, o, nu);
        const voor = JSON.stringify([store.events, store.orders]);
        await plaatsBestelling(store, tenant, o, nu);
        expect(JSON.stringify([store.events, store.orders])).toBe(voor);
    });

    it('een plank op een agenda-moment krijgt het tijdvak van dat moment', async () => {
        const o = await betaaldeOrder('1', [{ artikel: artikelen[2], aantal: 8, moment: 'm-1' }], { momentId: 'm-1' });
        await plaatsBestelling(store, tenant, o, nu);
        expect(store.events[0]).toMatchObject({ name: 'Borrel Journey · afhalen', date: '2026-10-16', start_time: '12:00:00', end_time: '13:00:00', guests: 8, menu: [] });
        expect(store.orders[0].regels[0].klaar_op).toBe('2026-10-16');
    });

    it('losse producten gaan in de vaste bak van vandaag, zonder event', async () => {
        const o = await betaaldeOrder('1', [{ artikel: artikelen[3], aantal: 5, moment: null }]);
        const u = await plaatsBestelling(store, tenant, o, nu);
        expect(u).toEqual({ status: 'vaste_bak', eventIds: [] });
        expect(store.events).toHaveLength(0);
        expect(store.orders[0].regels[0]).toMatchObject({ klaar_op: '2026-09-25', event_id: null });
        expect(store.orders[0].plaatsing_status).toBe('vaste_bak');
    });

    it('een onbetaalde order wordt niet geplaatst, met de reden in de order', async () => {
        const uit = await store.plaatsOrder({
            orgId: tenant.orgId, sleutel: 's-x', token: 't-x', leverwijze: 'afhalen', momentId: null,
            contact: { naam: 'Jan', email: 'j@v.nl', telefoon: '' }, adres: null, opmerking: '',
            subtotaalCenten: 0, leverkostenCenten: 0, totaalCenten: 0, btwCenten: {}, terugUrl: '/b',
            regels: [{ slug: 'kerst-box', naam: 'Kerst-Box', aantal: 2, eenheid: 'per persoon', stukCenten: 2350, bedragCenten: 4700, afhaalmoment: null, artikel_id: 'a-kerst', btw_pct: 9, moment_id: 'd-23', eenheden: 1, voorraad_eenheden: 0 }],
        });
        if (uit.ok === false) throw new Error(uit.code);
        const u = await plaatsBestelling(store, tenant, uit.waarde, nu);
        expect(u.status).toBe('mislukt');
        expect(store.orders[0].plaatsing_fout).toMatch(/niet betaald/);
        expect(store.events).toHaveLength(0);
    });

    it('hertelEvent telt een event opnieuw uit wat er betaald op ligt', async () => {
        const o = await betaaldeOrder('1', [{ artikel: artikelen[0], aantal: 4, moment: 'd-23' }]);
        await plaatsBestelling(store, tenant, o, nu);
        /* Order teruggedraaid: telt niet meer mee bij de volgende hertelling. */
        await store.zetStatus(o.id, 'mislukt', 'teruggedraaid-door-mypos');
        const t = await hertelEvent(store, tenant.orgId, store.events[0].id);
        expect(t.guests).toBe(0);
        expect(store.events[0].guests).toBe(0);
    });
});
