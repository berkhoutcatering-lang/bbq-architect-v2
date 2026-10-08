import { beforeEach, describe, expect, it } from 'vitest';
import { maakGeheugenStore, type GeheugenStore } from './geheugenStore';
import {
    isKerstLead, kerstMailsVoorVandaag, kerstMand, kerstOpmerking, kerstTotaalCenten, leesKerstLead, plaatsKerstBestelling,
    type KerstAanvraag, type KerstContext,
} from './kerst';
import type { Artikel } from './rekenen';

/* De bon zoals de site hem sinds 5 oktober 2026 in `bericht` zet. */
const BON = [
    'Kerst-Box',
    '',
    'Personen.......... 6',
    'Levering.......... Afhalen Schoonoord',
    'Afhalen op........ 2026-12-24',
    'Totaal............ € 141,00 (vaste prijs)',
    'Betalen........... bij het afhalen, met pin of contant',
    '',
    'Opmerking van de klant:',
    'Waarvan vegetarisch: 2',
    'Graag zonder noten.',
    '',
    'Besteld via hopbites.nl.',
].join('\n');

describe('leesKerstLead', () => {
    it('herkent een Kerst-Box op event_type of op het gestructureerde veld', () => {
        expect(isKerstLead({ event_type: 'Kerst-Box' })).toBe(true);
        expect(isKerstLead({ event_type: 'kerstbox' })).toBe(true);
        expect(isKerstLead({ event_type: 'Borrel Journey' })).toBe(false);
        expect(isKerstLead({ event_type: 'Aanvraag', bestelling: { artikel: 'kerst-box' } })).toBe(true);
        expect(leesKerstLead({ event_type: 'Catering', gasten: 40, event_datum: '2026-12-24' })).toBeNull();
    });

    it('leest het gestructureerde veld', () => {
        const a = leesKerstLead({
            event_type: 'Kerst-Box',
            bestelling: { artikel: 'kerst-box', personen: 5, vegetarisch: 1, onzeker: true, afhaaldag: '2026-12-23', bierproeverij: 5, wijnproeverij: 2, opmerking: 'Waarvan vegetarisch: 1\nLactosevrij graag' },
        });
        expect(a).toEqual({ personen: 5, vegetarisch: 1, onzeker: true, afhaaldag: '2026-12-23', bier: 5, wijn: 2, cremant: 0, champagne: 0, opmerking: 'Lactosevrij graag' });
    });

    it('valt terug op de bon van een oudere site', () => {
        const a = leesKerstLead({ event_type: 'Kerst-Box', event_datum: '2026-12-24', gasten: 6, bericht: BON });
        expect(a).toEqual({ personen: 6, vegetarisch: 2, onzeker: false, afhaaldag: '2026-12-24', bier: 0, wijn: 0, cremant: 0, champagne: 0, opmerking: 'Graag zonder noten.' });
    });

    it('leest de bubbels: gestructureerd, en uit de bon onder hun eigen naam', () => {
        const a = leesKerstLead({
            event_type: 'Kerst-Box',
            bestelling: { artikel: 'kerst-box', personen: 6, afhaaldag: '2026-12-24', bierproeverij: 6, wijnproeverij: 2, cremant: 1, champagne: 2 },
        });
        expect(a).toMatchObject({ bier: 6, wijn: 2, cremant: 1, champagne: 2 });
        const bon = BON.replace('Levering..........', [
            "'Louis' Crémant de Loire 1 × € 22,50 = € 22,50",
            'Champagne Grande Réserve 2 × € 42,50 = € 85,00',
            'Bierproeverij..... 6 × € 9,50 = € 57,00',
            'Levering..........',
        ].join('\n'));
        expect(leesKerstLead({ event_type: 'Kerst-Box', event_datum: '2026-12-24', gasten: 6, bericht: bon })).toMatchObject({ bier: 6, wijn: 0, cremant: 1, champagne: 2 });
    });

    it('ziet "weet het nog niet precies" in de bon', () => {
        const bon = BON.replace('Personen.......... 6', 'Personen.......... 6 (ongeveer — klant weet het nog niet precies)');
        expect(leesKerstLead({ event_type: 'Kerst-Box', event_datum: '2026-12-24', gasten: 6, bericht: bon })?.onzeker).toBe(true);
    });

    it('nooit meer vegetarisch dan personen', () => {
        const a = leesKerstLead({ event_type: 'Kerst-Box', bestelling: { artikel: 'kerst-box', personen: 2, vegetarisch: 5, afhaaldag: '2026-12-23' } });
        expect(a?.vegetarisch).toBe(2);
    });

    it('zonder dag of aantal geen bestelling', () => {
        expect(leesKerstLead({ event_type: 'Kerst-Box', gasten: 4, bericht: 'Kerst-Box' })).toBeNull();
        expect(leesKerstLead({ event_type: 'Kerst-Box', event_datum: '2026-12-24', bericht: '' })).toBeNull();
    });
});

const aanvraag = (x: Partial<KerstAanvraag> = {}): KerstAanvraag => ({ personen: 6, vegetarisch: 2, onzeker: false, afhaaldag: '2026-12-24', bier: 0, wijn: 0, cremant: 0, champagne: 0, opmerking: '', ...x });

describe('kerstMand en totaal', () => {
    it('splitst vega af als er een vega-artikel aan staat', () => {
        const mand = kerstMand(aanvraag({ bier: 3 }), 'd-24', [{ slug: 'kerst-box', actief: true }, { slug: 'kerst-box-vegetarisch', actief: true }]);
        expect(mand.regels).toEqual([
            { slug: 'kerst-box', aantal: 4, moment: 'd-24' },
            { slug: 'kerst-box-vegetarisch', aantal: 2, moment: 'd-24' },
            { slug: 'kerst-bierproeverij', aantal: 3, moment: 'd-24' },
        ]);
    });
    it('alles op de gewone box als vega er niet (aan) is', () => {
        const mand = kerstMand(aanvraag(), 'd-24', [{ slug: 'kerst-box', actief: true }, { slug: 'kerst-box-vegetarisch', actief: false }]);
        expect(mand.regels).toEqual([{ slug: 'kerst-box', aantal: 6, moment: 'd-24' }]);
    });
    it('de bubbels in de mand, per fles', () => {
        const mand = kerstMand(aanvraag({ vegetarisch: 0, cremant: 1, champagne: 2, wijn: 2 }), 'd-24', [{ slug: 'kerst-box', actief: true }]);
        expect(mand.regels).toEqual([
            { slug: 'kerst-box', aantal: 6, moment: 'd-24' },
            { slug: 'kerst-wijnproeverij', aantal: 2, moment: 'd-24' },
            { slug: 'kerst-cremant', aantal: 1, moment: 'd-24' },
            { slug: 'kerst-champagne', aantal: 2, moment: 'd-24' },
        ]);
        expect(kerstTotaalCenten(aanvraag({ cremant: 1, champagne: 2 }), [{ slug: 'kerst-cremant', prijs_cents: 2250 }, { slug: 'kerst-champagne', prijs_cents: 4250 }])).toBe(14100 + 2250 + 8500);
    });
    it('totaal: personen × prijs plus de proeverijen met prijs', () => {
        expect(kerstTotaalCenten(aanvraag(), [])).toBe(14100);
        expect(kerstTotaalCenten(aanvraag({ bier: 2, wijn: 1 }), [{ slug: 'kerst-bierproeverij', prijs_cents: 750 }, { slug: 'kerst-wijnproeverij', prijs_cents: 1950 }])).toBe(14100 + 1500 + 1950);
    });
    it('de opmerking op de order', () => {
        expect(kerstOpmerking(aanvraag({ opmerking: 'Zonder noten', onzeker: true }))).toBe('Waarvan vegetarisch: 2\nAantal nog niet zeker (klant weet het nog niet precies).\nZonder noten');
        expect(kerstOpmerking(aanvraag({ vegetarisch: 0 }))).toBe('');
    });
});

describe('kerstMailsVoorVandaag', () => {
    const o = { status: 'betaald', afhaaldag: '2026-12-24', aantal_onzeker: true, navraag_verstuurd_at: null, herinnering_verstuurd_at: null, opgehaald: false };
    const op = (iso: string) => new Date(`${iso}T09:00:00Z`);
    it('navraag vijf dagen ervoor, en alsnog als hij gemist is, tot twee dagen ervoor', () => {
        expect(kerstMailsVoorVandaag(o, op('2026-12-18')).navraag).toBe(false);
        expect(kerstMailsVoorVandaag(o, op('2026-12-19')).navraag).toBe(true);
        expect(kerstMailsVoorVandaag(o, op('2026-12-22')).navraag).toBe(true);
        expect(kerstMailsVoorVandaag(o, op('2026-12-23')).navraag).toBe(false);
        expect(kerstMailsVoorVandaag({ ...o, aantal_onzeker: false }, op('2026-12-19')).navraag).toBe(false);
        expect(kerstMailsVoorVandaag({ ...o, navraag_verstuurd_at: '2026-12-19' }, op('2026-12-20')).navraag).toBe(false);
    });
    it('herinnering alleen de dag ervoor, één keer, niet na ophalen of annuleren', () => {
        expect(kerstMailsVoorVandaag(o, op('2026-12-23')).herinnering).toBe(true);
        expect(kerstMailsVoorVandaag(o, op('2026-12-22')).herinnering).toBe(false);
        expect(kerstMailsVoorVandaag({ ...o, herinnering_verstuurd_at: 'x' }, op('2026-12-23')).herinnering).toBe(false);
        expect(kerstMailsVoorVandaag({ ...o, opgehaald: true }, op('2026-12-23')).herinnering).toBe(false);
        expect(kerstMailsVoorVandaag({ ...o, status: 'geannuleerd' }, op('2026-12-23')).herinnering).toBe(false);
    });
});

/* ── Plaatsen, met de geheugen-opslag ──────────────────────────────────────── */

const basis: Omit<Artikel, 'id' | 'slug' | 'naam'> = {
    eenheid: 'per persoon', telt: 'personen', prijs_cents: 2350, btw_pct: 9, minimum: 2, maximum: null,
    verzendbaar: false, gekoeld: true, moment_soort: 'dag', moment_groep: 'kerst-box', afhaalmoment_tekst: 'Afhalen op 23 of 24 december',
    capaciteit_soort: 'dozen', doos_klein_max: 3, doos_groot: 5, voorraad: null, actief: true, publiek: true,
};
const tenant = { orgId: 'org-1', slug: 'hop-en-bites', bedrijfsnaam: 'Hop & Bites', email: 'info@hopbites.nl', telefoon: '06-1', brandColor: null, ondertitel: null };
const lead = { id: 42, naam: 'Anne de Vries', email: 'anne@voorbeeld.nl', telefoon: '0612345678' };

let store: GeheugenStore;
let ctx: KerstContext;
let mails: { nummer: string; personen: number }[];

function opzet(o: { kassaOpen?: boolean; capaciteit?: number | null; vega?: boolean } = {}) {
    mails = [];
    store = maakGeheugenStore({
        tenant,
        artikelen: [
            { ...basis, id: 'a-kerst', slug: 'kerst-box', naam: 'Kerst-Box' },
            { ...basis, id: 'a-vega', slug: 'kerst-box-vegetarisch', naam: 'Kerst-Box vegetarisch', dieet: 'vegetarisch', actief: o.vega ?? true, publiek: false },
        ],
        momenten: [{ id: 'd-23', groep: 'kerst-box', datum: '2026-12-23', van: null, tot: null, capaciteit: o.capaciteit === undefined ? 25 : o.capaciteit, bestellen_tot: null, actief: true }],
        nu: new Date('2026-10-05T12:00:00Z'),
        instellingen: { verzendkosten_cents: null, gratis_verzenden_vanaf_cents: null, verzendkosten_btw_pct: 21, reservering_minuten: 30, offerte_geldig_minuten: 15, kassa_open: o.kassaOpen ?? false, site_url: 'https://hopbites.nl' },
    });
    ctx = {
        store,
        mail: async ({ order, aanvraag: a }) => { mails.push({ nummer: order.nummer, personen: a.personen }); return { success: true }; },
        nu: () => new Date('2026-10-05T12:00:00Z'),
    };
}

describe('plaatsKerstBestelling', () => {
    beforeEach(() => opzet());

    it('maakt een betaalde order met alles als rest, ook als de kassa dicht is', async () => {
        const uit = await plaatsKerstBestelling(ctx, tenant, lead, aanvraag({ afhaaldag: '2026-12-23' }));
        expect(uit.ok).toBe(true);
        const o = store.orders[0]!;
        expect(o.status).toBe('betaald');
        expect(o.betaalwijze).toBe('bij_afhalen');
        expect(o.nu_te_betalen_cents).toBe(0);
        expect(o.rest_cents).toBe(14100);
        expect(o.totaal_cents).toBe(14100);
        expect(o.contact_naam).toBe('Anne de Vries');
        expect(o.sleutel).toBe('lead-42');
        expect(o.regels.map((r) => [r.slug, r.aantal])).toEqual([['kerst-box', 4], ['kerst-box-vegetarisch', 2]]);
        expect(o.mail_status).toBe('verstuurd');
        expect((o as unknown as { lead_id: number }).lead_id).toBe(42);
        expect(mails).toEqual([{ nummer: o.nummer, personen: 6 }]);
    });

    it('het minimum geldt voor de hele bestelling, niet per variant', async () => {
        const uit = await plaatsKerstBestelling(ctx, tenant, lead, aanvraag({ personen: 3, vegetarisch: 2, afhaaldag: '2026-12-23' }));
        expect(uit.ok).toBe(true);
        expect(store.orders[0]!.regels.map((r) => [r.slug, r.aantal])).toEqual([['kerst-box', 1], ['kerst-box-vegetarisch', 2]]);
        const te = await plaatsKerstBestelling(ctx, tenant, { ...lead, id: 43 }, aanvraag({ personen: 1, vegetarisch: 0, afhaaldag: '2026-12-23' }));
        expect(te.ok).toBe(false);
    });

    it('idempotent op de lead: geen tweede order en geen tweede mail', async () => {
        await plaatsKerstBestelling(ctx, tenant, lead, aanvraag({ afhaaldag: '2026-12-23' }));
        const twee = await plaatsKerstBestelling(ctx, tenant, lead, aanvraag({ afhaaldag: '2026-12-23' }));
        expect(twee.ok && twee.nieuw).toBe(false);
        expect(store.orders).toHaveLength(1);
        expect(mails).toHaveLength(1);
    });

    it('een ontbrekende kerstdag wordt aangemaakt, zonder grens', async () => {
        const uit = await plaatsKerstBestelling(ctx, tenant, lead, aanvraag({ afhaaldag: '2026-12-26' }));
        expect(uit.ok).toBe(true);
        const dag = (await store.laadBronnen('org-1'))!.momenten.find((m) => m.datum === '2026-12-26');
        expect(dag?.capaciteit).toBeNull();
        expect(store.orders[0]!.regels[0]!.klaar_op).toBe('2026-12-26');
    });

    it('een dag buiten de kerstdagen wordt niet aangemaakt', async () => {
        const uit = await plaatsKerstBestelling(ctx, tenant, lead, aanvraag({ afhaaldag: '2026-12-27' }));
        expect(uit).toMatchObject({ ok: false });
        expect(store.orders).toHaveLength(0);
    });

    it('een volle dag geeft een reden en geen mail', async () => {
        opzet({ capaciteit: 1 });
        const uit = await plaatsKerstBestelling(ctx, tenant, lead, aanvraag({ personen: 8, vegetarisch: 0, afhaaldag: '2026-12-23' }));
        expect(uit.ok).toBe(false);
        if (uit.ok === false) expect(uit.reden).toMatch(/vol/);
        expect(mails).toHaveLength(0);
    });

    it('zonder vega-artikel alles op de gewone box, vega in de opmerking', async () => {
        opzet({ vega: false });
        await plaatsKerstBestelling(ctx, tenant, lead, aanvraag({ afhaaldag: '2026-12-23' }));
        const o = store.orders[0]!;
        expect(o.regels.map((r) => [r.slug, r.aantal])).toEqual([['kerst-box', 6]]);
        expect(o.opmerking).toContain('Waarvan vegetarisch: 2');
    });

    it('een proeverij zonder prijs houdt de bestelling tegen met een duidelijke reden', async () => {
        const uit = await plaatsKerstBestelling(ctx, tenant, lead, aanvraag({ afhaaldag: '2026-12-23', bier: 2 }));
        expect(uit.ok).toBe(false);
    });
});
