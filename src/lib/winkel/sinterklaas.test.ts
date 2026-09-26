/**
 * Sinterklaas 2026 — de blokken S1 t/m S6 tegen de geheugen-opslag.
 * Opdracht: docs/OVERDRACHT-BBQ-ARCHITECT-SINTERKLAAS.md · plan: docs/sinterklaas-bouwplan.md
 *
 * Wat hier bewezen wordt:
 *   S1  pakket als template met slots; de plank als receptuur per persoon
 *   S2  niet verkoopbaar zonder product in elk slot; voorraad per product
 *   S3  momenten per groep, onbeperkt of met grens, deadline met tijd
 *   S4  schaalverdeling en het minimum van 2 personen
 *   S5  twee betaalwijzen: zelfde totaal, ander bedrag naar myPOS; de balie boekt de rest
 *   S6  btw naar rato van de winkelwaarde, per regel opgeslagen
 */
import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MYPOS_TEST, onderteken, type MyposConfig, type Velden } from '@/lib/mypos/ipc';
import { maakGeheugenStore, type GeheugenStore } from './geheugenStore';
import { _resetControleKlok, betaalPagina, haalMomenten, haalStatus, offreer, plaatsOrder, verwerkBetaalbericht, type KassaContext } from './kassa';
import { bevestigingsmailInhoud } from './mail';
import { berekenOfferte, btwDeel, btwVerdeling, componentenVan, telSchalen, verdeelSchalen, verkoopbaar, ONBEPERKT, type Artikel, type Product, type Slot } from './rekenen';
import type { Mand } from './types';

/* ── myPOS van de test ─────────────────────────────────────────────────────── */
const paar = generateKeyPairSync('rsa', { modulusLength: 2048 });
const myposPriv = paar.privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
const myposPub = paar.publicKey.export({ type: 'spki', format: 'pem' }) as string;
const mypos: MyposConfig = { ...MYPOS_TEST, myposCert: myposPub, ipcUrl: 'https://mypos.test/ipc' };
function bericht(v: Record<string, string>): string {
    const velden = Object.entries(v) as Velden;
    return new URLSearchParams([...velden, ['Signature', onderteken(velden, myposPriv)]]).toString();
}

/* ── Catalogus: de acht artikelen (verkort) ───────────────────────────────── */
const basis: Omit<Artikel, 'id' | 'slug' | 'naam'> = {
    eenheid: 'per stuk', telt: 'stuks', prijs_cents: 100, btw_pct: 9, minimum: 1, maximum: null,
    verzendbaar: false, gekoeld: false, moment_soort: 'moment', moment_groep: 'sint-pakket', afhaalmoment_tekst: null,
    capaciteit_soort: 'aantal', doos_klein_max: null, doos_groot: null, voorraad: null, actief: true, publiek: true,
};
const plank: Artikel = { ...basis, id: 'a-plank', slug: 'sinterklaas-borrelplank', naam: 'Sinterklaas-borrelplank', eenheid: 'per persoon', telt: 'personen', prijs_cents: 1495, minimum: 2, gekoeld: true, moment_groep: 'sint-plank', schaal_verdeling: true, doos_klein_max: 3, doos_groot: 5 };
const bier20: Artikel = { ...basis, id: 'a-bier-20', slug: 'sint-bier-20', naam: 'Bierpakket € 20', prijs_cents: 2000, btw_pct: 21, segment: 'bier', alcohol: true };
const combi35: Artikel = { ...basis, id: 'a-combi-35', slug: 'sint-bier-wijn-35', naam: 'Bier & wijn € 35', prijs_cents: 3500, btw_pct: 21, segment: 'combi', alcohol: true };
const wijn35: Artikel = { ...basis, id: 'a-wijn-35', slug: 'sint-wijn-35', naam: 'Wijnpakket € 35', prijs_cents: 3500, btw_pct: 21, segment: 'wijn', alcohol: true };

const producten: Omit<Product, 'voorraad_bezet'>[] = [
    { id: 'p-wijn', naam: 'Huiswijn rood', type: 'wijn', eenheid: 'stuk', prijs_per: 1, winkelprijs_incl_cents: 1150, inkoop_excl_cents: 700, btw_pct: 21, alcohol: true, voorraad: null, actief: true },
    { id: 'p-bier-lokaal', naam: 'Lokaal bier', type: 'bier', eenheid: 'stuk', prijs_per: 1, winkelprijs_incl_cents: 495, inkoop_excl_cents: 275, btw_pct: 21, alcohol: true, voorraad: 6, actief: true },
    { id: 'p-bier-gh', naam: 'Groothandel-bier', type: 'bier', eenheid: 'stuk', prijs_per: 1, winkelprijs_incl_cents: 350, inkoop_excl_cents: 170, btw_pct: 21, alcohol: true, voorraad: null, actief: true },
    { id: 'p-worst', naam: 'Droge worst naturel', type: 'worst', eenheid: 'stuk', prijs_per: 1, winkelprijs_incl_cents: 495, inkoop_excl_cents: 246, btw_pct: 9, alcohol: false, voorraad: null, actief: true },
    /* Winkelprijs per 150 g = € 3,95, precies het voorbeeld uit de overdracht (S6). */
    { id: 'p-amandel', naam: 'BBQ-amandelen', type: 'amandelen', eenheid: 'gram', prijs_per: 150, winkelprijs_incl_cents: 395, inkoop_excl_cents: 206, btw_pct: 9, alcohol: false, voorraad: null, actief: true },
    { id: 'p-cracker', naam: 'Pizza-dipcrackers 60 g', type: 'crackers', eenheid: 'stuk', prijs_per: 1, winkelprijs_incl_cents: 250, inkoop_excl_cents: 70, btw_pct: 9, alcohol: false, voorraad: null, actief: true },
    { id: 'p-doos', naam: 'Geschenkdoos € 35', type: 'doos', eenheid: 'stuk', prijs_per: 1, winkelprijs_incl_cents: null, inkoop_excl_cents: 250, btw_pct: 21, alcohol: false, voorraad: null, actief: true },
    { id: 'p-pastrami', naam: 'Pastrami', type: 'vleeswaar', eenheid: 'gram', prijs_per: 100, winkelprijs_incl_cents: null, inkoop_excl_cents: null, btw_pct: 9, alcohol: false, voorraad: null, actief: true },
    { id: 'p-grillworst', naam: 'Eigen grillworst', type: 'vleeswaar', eenheid: 'gram', prijs_per: 100, winkelprijs_incl_cents: null, inkoop_excl_cents: null, btw_pct: 9, alcohol: false, voorraad: null, actief: true },
];
const slot = (id: string, artikel_id: string, volgorde: number, slot_type: string, naam: string, hoeveelheid: number, standaard_product_id: string | null, extra: Partial<Slot> = {}): Slot =>
    ({ id, artikel_id, volgorde, slot_type, naam, hoeveelheid, eenheid: 'stuk', per: 'stuk', standaard_product_id, wisselbaar: false, alternatieven: [], ...extra });
const slots: Slot[] = [
    /* Bier & wijn € 35: 1 wijn, 3 lokale bieren, 1 worst, 150 g amandelen, 1 bakje crackers, doos. */
    slot('s-c1', 'a-combi-35', 1, 'wijn', 'Fles wijn', 1, 'p-wijn'),
    slot('s-c2', 'a-combi-35', 2, 'bier', 'Lokaal bier', 3, 'p-bier-lokaal'),
    slot('s-c3', 'a-combi-35', 3, 'worst', 'Droge worst', 1, 'p-worst'),
    slot('s-c4', 'a-combi-35', 4, 'amandelen', 'BBQ-amandelen', 150, 'p-amandel', { eenheid: 'gram' }),
    slot('s-c5', 'a-combi-35', 5, 'crackers', 'Pizza-dipcrackers', 1, 'p-cracker'),
    slot('s-c6', 'a-combi-35', 6, 'doos', 'Geschenkdoos', 1, 'p-doos'),
    /* Bier € 20: drie bieren, worst, 100 g amandelen — het groothandel-slot is nog leeg. */
    slot('s-b1', 'a-bier-20', 1, 'bier', 'Voordelig bier (groothandel)', 1, null),
    slot('s-b2', 'a-bier-20', 2, 'bier', 'Lokaal bier', 1, 'p-bier-lokaal'),
    slot('s-b3', 'a-bier-20', 3, 'worst', 'Droge worst', 1, 'p-worst'),
    slot('s-b4', 'a-bier-20', 4, 'amandelen', 'BBQ-amandelen', 100, 'p-amandel', { eenheid: 'gram' }),
    /* Wijn € 35: alleen wijn en worst, voor de btw-test met overschrijving. */
    slot('s-w1', 'a-wijn-35', 1, 'wijn', 'Fles wijn', 2, 'p-wijn'),
    slot('s-w2', 'a-wijn-35', 2, 'worst', 'Droge worst', 1, 'p-worst'),
    /* De plank: per persoon, in grammen (verkort tot twee onderdelen). */
    slot('s-p1', 'a-plank', 1, 'vleeswaar', 'Pastrami', 20, 'p-pastrami', { eenheid: 'gram', per: 'persoon' }),
    slot('s-p2', 'a-plank', 2, 'vleeswaar', 'Eigen grillworst', 40, 'p-grillworst', { eenheid: 'gram', per: 'persoon' }),
    slot('s-p3', 'a-plank', 3, 'amandelen', 'BBQ-amandelen', 15, 'p-amandel', { eenheid: 'gram', per: 'persoon' }),
];

/* Afhaalmomenten: één tijdvak, twee groepen (twee tellingen). Plank onbeperkt, pakketten 10. */
const momenten = [
    { id: 'm-plank', groep: 'sint-plank', datum: '2026-12-04', van: '16:00:00', tot: '18:00:00', capaciteit: null, bestellen_tot: null, sluit_op: '2026-12-01T12:00:00Z', actief: true },
    { id: 'm-pakket', groep: 'sint-pakket', datum: '2026-12-04', van: '16:00:00', tot: '18:00:00', capaciteit: 10, bestellen_tot: null, sluit_op: '2026-12-01T12:00:00Z', actief: true },
    { id: 'm-pakket-2', groep: 'sint-pakket', datum: '2026-12-05', van: '10:00:00', tot: '12:00:00', capaciteit: 10, bestellen_tot: null, sluit_op: null, actief: true },
];
const tenant = { orgId: 'org-1', slug: 'hop-en-bites', bedrijfsnaam: 'Hop & Bites', email: 'info@hopbites.nl', telefoon: '06-1', brandColor: null, ondertitel: null };
const instellingen = { verzendkosten_cents: 695, gratis_verzenden_vanaf_cents: null, verzendkosten_btw_pct: 21, reservering_minuten: 30, offerte_geldig_minuten: 15, kassa_open: true, site_url: 'https://hopbites.nl', reservering_bedrag_cents: 250, qr_basis_url: 'https://experience.hopbites.nl' };

let store: GeheugenStore;
let ctx: KassaContext;
let mails: string[];
let nu: Date;
beforeEach(() => {
    nu = new Date('2026-11-20T12:00:00Z');
    mails = [];
    store = maakGeheugenStore({ tenant, artikelen: [plank, bier20, combi35, wijn35], momenten, producten, slots, instellingen, nu });
    ctx = { store, mypos, appUrl: 'https://bbq-architect-v2.vercel.app', mail: async ({ order }) => { mails.push(order.nummer); return { success: true }; }, nu: () => nu };
    _resetControleKlok();
});

const bron = () => ({ artikelen: [plank, bier20, combi35, wijn35], momenten: momenten.map((m) => ({ ...m, bezet: 0 })), producten: producten as Product[], slots, instellingen, nu: new Date('2026-11-20T12:00:00Z') });
function mand(regels: { slug: string; aantal: number; moment?: string | null; keuzes?: unknown }[]): Mand {
    return { versie: 1, regels: regels.map((r) => ({ moment: null, ...r })) } as Mand;
}
const contact = { naam: 'Sint Nicolaas', email: 'sint@voorbeeld.nl', telefoon: '0612345678' };
const order = (sleutel: string, regels: Mand['regels'], extra: Record<string, unknown> = {}) => ({
    mand: { versie: 1, regels }, leverwijze: 'afhalen', momentId: null, contact, adres: null, opmerking: '', sleutel, terugUrl: '/bestelling', ...extra,
});

/* ── S4 · schalen ──────────────────────────────────────────────────────────── */
describe('verdeelSchalen (S4)', () => {
    it('volgt de tabel uit de overdracht', () => {
        const t = (n: number) => verdeelSchalen(n).map((s) => `${s.maat}(${s.personen})`).join(' + ');
        expect(t(2)).toBe('klein(2)');
        expect(t(3)).toBe('klein(3)');
        expect(t(4)).toBe('groot(4)');
        expect(t(5)).toBe('groot(5)');
        expect(t(6)).toBe('groot(4) + klein(2)');
        expect(t(7)).toBe('groot(5) + klein(2)');
        expect(t(8)).toBe('groot(5) + klein(3)');
        expect(t(9)).toBe('groot(5) + groot(4)');
        expect(t(10)).toBe('groot(5) + groot(5)');
        expect(t(11)).toBe('groot(5) + groot(4) + klein(2)');
        expect(t(12)).toBe('groot(5) + groot(5) + klein(2)');
    });
    it('nooit een schaal met één persoon, en de personen tellen altijd op', () => {
        for (let n = 2; n <= 60; n++) {
            const s = verdeelSchalen(n);
            expect(s.every((x) => x.personen >= 2 && x.personen <= 5)).toBe(true);
            expect(s.every((x) => (x.maat === 'klein' ? x.personen <= 3 : x.personen >= 4))).toBe(true);
            expect(s.reduce((t, x) => t + x.personen, 0)).toBe(n);
        }
        expect(verdeelSchalen(1)).toEqual([]);
        expect(telSchalen(verdeelSchalen(11))).toEqual({ klein: 1, groot: 2, totaal: 3 });
    });
});

/* ── S1 · template ─────────────────────────────────────────────────────────── */
describe('template (S1)', () => {
    it('componenten van een pakket zijn slot × aantal; van de plank slot × personen', () => {
        expect(componentenVan('a-combi-35', slots, 2).map((c) => `${c.naam} ${c.hoeveelheid} ${c.eenheid}`)).toEqual([
            'Fles wijn 2 stuk', 'Lokaal bier 6 stuk', 'Droge worst 2 stuk', 'BBQ-amandelen 300 gram', 'Pizza-dipcrackers 2 stuk', 'Geschenkdoos 2 stuk',
        ]);
        expect(componentenVan('a-plank', slots, 7).map((c) => `${c.naam} ${c.hoeveelheid} g`)).toEqual(['Pastrami 140 g', 'Eigen grillworst 280 g', 'BBQ-amandelen 105 g']);
        expect(componentenVan('a-onbekend', slots, 3)).toEqual([]);
    });
    it('keuzes op een regel: het pakket is vast', () => {
        const uit = berekenOfferte(bron(), mand([{ slug: 'sint-bier-wijn-35', aantal: 1, moment: 'm-pakket', keuzes: { wijn: 'x' } }]), 'afhalen', null);
        expect(uit).toMatchObject({ ok: false, soort: 'validatie', fouten: ['Bier & wijn € 35 is een vast pakket; kiezen kan nog niet.'] });
    });
});

/* ── S2 · verkoopbaar en productvoorraad ───────────────────────────────────── */
describe('verkoopbaarheid en voorraad per product (S2)', () => {
    it('een pakket met een leeg slot is niet verkoopbaar — dezelfde zin als prijs volgt', () => {
        expect(verkoopbaar('a-bier-20', slots)).toBe(false);
        expect(verkoopbaar('a-combi-35', slots)).toBe(true);
        expect(verkoopbaar('a-zonder-slots', slots)).toBe(true);
        const uit = berekenOfferte(bron(), mand([{ slug: 'sint-bier-20', aantal: 1, moment: 'm-pakket' }]), 'afhalen', null);
        expect(uit).toMatchObject({ ok: false, soort: 'validatie', fouten: ['Bierpakket € 20 kan op dit moment niet besteld worden.'] });
    });
    it('reserveert de componenten: 6 lokale bieren op voorraad = twee combi-pakketten, niet drie', async () => {
        const a = await plaatsOrder(ctx, 'hop-en-bites', order('sleutel-1', [{ slug: 'sint-bier-wijn-35', aantal: 2, moment: 'm-pakket' }], { verwachtTotaalCenten: 7000 }));
        expect(a.status).toBe(200);
        expect(store.componenten.filter((c) => c.product_id === 'p-bier-lokaal').reduce((s, c) => s + c.hoeveelheid, 0)).toBe(6);
        const b = await offreer(ctx, 'hop-en-bites', { mand: mand([{ slug: 'sint-bier-wijn-35', aantal: 1, moment: 'm-pakket' }]), leverwijze: 'afhalen' });
        expect(b.status).toBe(400);
        expect(b.body).toMatchObject({ ok: false, soort: 'validatie', fouten: ['Bier & wijn € 35 is uitverkocht: Lokaal bier is op.'] });
    });
    it('twee klanten tegelijk op de laatste bieren: de opslag telt onder vergrendeling (WK009)', async () => {
        const [a, b] = await Promise.all([
            plaatsOrder(ctx, 'hop-en-bites', order('sleutel-a', [{ slug: 'sint-bier-wijn-35', aantal: 1, moment: 'm-pakket' }], { verwachtTotaalCenten: 3500 })),
            plaatsOrder(ctx, 'hop-en-bites', order('sleutel-b', [{ slug: 'sint-bier-wijn-35', aantal: 1, moment: 'm-pakket' }], { verwachtTotaalCenten: 3500 })),
        ]);
        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        /* Zes bieren: precies twee pakketten. Een derde tegelijk stuit op de opslag. */
        const c = await plaatsOrder(ctx, 'hop-en-bites', order('sleutel-c', [{ slug: 'sint-bier-wijn-35', aantal: 1, moment: 'm-pakket' }], { verwachtTotaalCenten: 3500 }));
        expect(c.status).toBe(400);
        expect(c.body).toMatchObject({ ok: false, soort: 'validatie' });
    });
    it('een product zonder voorraadgetal blokkeert nooit (verkopen op inkoopplanning)', () => {
        const uit = berekenOfferte(bron(), mand([{ slug: 'sint-wijn-35', aantal: 500, moment: 'm-pakket-2' }]), 'afhalen', null);
        expect(uit.ok).toBe(false);
        /* Niet de wijn (voorraad null) maar de pakketcapaciteit van het moment is de grens. */
        expect(uit).toMatchObject({ soort: 'moment-vol' });
    });
});

/* ── S3 · momenten per groep ───────────────────────────────────────────────── */
describe('momenten per groep (S3)', () => {
    it('?artikel= geeft de momenten van de groep van dat artikel; onbeperkt is een groot getal', async () => {
        const p = await haalMomenten(ctx, 'hop-en-bites', 'sinterklaas-borrelplank');
        expect(p.body).toEqual({ momenten: [{ id: 'm-plank', datum: '2026-12-04', van: '16:00:00', tot: '18:00:00', vrij: ONBEPERKT }] });
        const k = await haalMomenten(ctx, 'hop-en-bites', 'sint-wijn-35');
        expect((k.body as { momenten: { id: string; vrij: number }[] }).momenten.map((m) => `${m.id}:${m.vrij}`)).toEqual(['m-pakket:10', 'm-pakket-2:10']);
    });
    it('plank én pakket in hetzelfde tijdvak: één afhaalmoment, twee tellingen', async () => {
        const uit = await plaatsOrder(ctx, 'hop-en-bites', order('sleutel-1', [
            { slug: 'sinterklaas-borrelplank', aantal: 4, moment: 'm-plank' },
            { slug: 'sint-bier-wijn-35', aantal: 1, moment: 'm-pakket' },
        ], { verwachtTotaalCenten: 4 * 1495 + 3500 }));
        expect(uit.status).toBe(200);
        const o = store.orders[0]!;
        expect(o.moment_id).toBe('m-plank');
        expect(o.regels.map((r) => `${r.moment_id}:${r.eenheden}`)).toEqual(['m-plank:4', 'm-pakket:1']);
        const k = await haalMomenten(ctx, 'hop-en-bites', 'sint-wijn-35');
        expect((k.body as { momenten: { id: string; vrij: number }[] }).momenten[0]).toMatchObject({ id: 'm-pakket', vrij: 9 });
    });
    it('twee verschillende tijdvakken in één order blijft één afspraak te veel', () => {
        const uit = berekenOfferte(bron(), mand([{ slug: 'sinterklaas-borrelplank', aantal: 2, moment: 'm-plank' }, { slug: 'sint-bier-wijn-35', aantal: 1, moment: 'm-pakket-2' }]), 'afhalen', null);
        expect(uit).toMatchObject({ ok: false, soort: 'validatie', fouten: ['Kies één afhaalmoment voor de hele bestelling.'] });
    });
    it('na de besteldeadline (met tijd) verdwijnt het moment en geeft een order moment-verlopen', async () => {
        nu = new Date('2026-12-01T12:00:01Z');
        store.zetNu(nu);
        const m = await haalMomenten(ctx, 'hop-en-bites', 'sint-wijn-35');
        expect((m.body as { momenten: { id: string }[] }).momenten.map((x) => x.id)).toEqual(['m-pakket-2']);
        const uit = await plaatsOrder(ctx, 'hop-en-bites', order('sleutel-1', [{ slug: 'sint-bier-wijn-35', aantal: 1, moment: 'm-pakket' }], { verwachtTotaalCenten: 3500 }));
        expect(uit.status).toBe(409);
        expect(uit.body).toMatchObject({ ok: false, soort: 'moment-verlopen' });
    });
    it('een vol pakketslot geeft moment-vol voor pakketten, niet voor de plank', () => {
        const b = bron();
        b.momenten = b.momenten.map((m) => (m.id === 'm-pakket' ? { ...m, bezet: 10 } : m));
        expect(berekenOfferte(b, mand([{ slug: 'sint-bier-wijn-35', aantal: 1, moment: 'm-pakket' }]), 'afhalen', null)).toMatchObject({ ok: false, soort: 'moment-vol' });
        expect(berekenOfferte(b, mand([{ slug: 'sinterklaas-borrelplank', aantal: 40, moment: 'm-plank' }]), 'afhalen', null).ok).toBe(true);
    });
});

/* ── S4 · het minimum van de plank ─────────────────────────────────────────── */
describe('plank (S4)', () => {
    it('1 persoon is validatie; 2 mag', () => {
        expect(berekenOfferte(bron(), mand([{ slug: 'sinterklaas-borrelplank', aantal: 1, moment: 'm-plank' }]), 'afhalen', null))
            .toMatchObject({ ok: false, soort: 'validatie', fouten: ['Sinterklaas-borrelplank gaat vanaf 2 personen.'] });
        const uit = berekenOfferte(bron(), mand([{ slug: 'sinterklaas-borrelplank', aantal: 2, moment: 'm-plank' }]), 'afhalen', null);
        expect(uit.ok && uit.intern.offerte.totaalCenten).toBe(2990);
        expect(uit.ok && uit.intern.btwCenten).toEqual({ '9': btwDeel(2990, 9) });
    });
});

/* ── S5 · twee betaalwijzen ────────────────────────────────────────────────── */
describe('betaalwijze (S5)', () => {
    const regels = [{ slug: 'sint-bier-wijn-35', aantal: 1, moment: 'm-pakket' }];
    it('dezelfde mand: zelfde totaal, ander bedrag nu — de reservering is geen toeslag', async () => {
        const vol = await offreer(ctx, 'hop-en-bites', { mand: mand(regels), leverwijze: 'afhalen' });
        const res = await offreer(ctx, 'hop-en-bites', { mand: mand(regels), leverwijze: 'afhalen', betaalwijze: 'reservering' });
        expect(vol.body).toMatchObject({ offerte: { betaalwijze: 'volledig', totaalCenten: 3500, nuTeBetalenCenten: 3500, restInWinkelCenten: 0, reserveringCenten: 0 } });
        expect(res.body).toMatchObject({ offerte: { betaalwijze: 'reservering', totaalCenten: 3500, nuTeBetalenCenten: 250, restInWinkelCenten: 3250, reserveringCenten: 250 } });
    });
    it('zonder ingesteld bedrag, of bij verzenden, is reserveren validatie', async () => {
        const uit = berekenOfferte({ ...bron(), instellingen: { ...instellingen, reservering_bedrag_cents: null } }, mand(regels), 'afhalen', null, 'reservering');
        expect(uit).toMatchObject({ ok: false, soort: 'validatie' });
        const b = bron();
        b.artikelen = [{ ...combi35, verzendbaar: true, moment_soort: 'geen', moment_groep: null }];
        expect(berekenOfferte(b, mand([{ slug: 'sint-bier-wijn-35', aantal: 1 }]), 'verzenden', null, 'reservering')).toMatchObject({ ok: false, soort: 'validatie', fouten: ['Reserveren kan alleen bij afhalen in de winkel.'] });
    });
    it('myPOS int € 2,50; het volledige bedrag als betaalbericht wijkt af; de status noemt het rest en de balie boekt het', async () => {
        const o = await plaatsOrder(ctx, 'hop-en-bites', order('sleutel-1', regels, { verwachtTotaalCenten: 3500, betaalwijze: 'reservering' }));
        expect(o.status).toBe(200);
        expect(store.orders[0]).toMatchObject({ betaalwijze: 'reservering', totaal_cents: 3500, nu_te_betalen_cents: 250, rest_cents: 3250, rest_betaald_at: null });
        const token = (o.body as { token: string }).token;

        const pagina = await betaalPagina(ctx, 'hop-en-bites', token);
        expect(pagina.soort === 'html' && pagina.html).toContain('name="Amount" value="2.50"');
        expect(pagina.soort === 'html' && pagina.html).toContain('rest € 32,50 in de winkel');

        const orderId = store.orders[0]!.mypos_order_id!;
        const notify = (amount: string, trn: string) => bericht({ IPCmethod: 'IPCPurchaseNotify', SID: mypos.sid, Amount: amount, Currency: 'EUR', OrderID: orderId, IPC_Trnref: trn, RequestDateTime: '20261120120000', RequestSTAN: '000001', PaymentMethod: '2' });
        await verwerkBetaalbericht(ctx, 'hop-en-bites', notify('35.00', 'TRN-fout'));
        expect(store.orders[0]?.status).toBe('wacht');
        expect(store.berichten.find((b) => b.referentie === 'trn:TRN-fout')?.uitkomst).toBe('bedrag-wijkt-af:3500');

        await verwerkBetaalbericht(ctx, 'hop-en-bites', notify('2.50', 'TRN-ok'));
        expect(store.orders[0]).toMatchObject({ status: 'betaald', betaald_cents: 250 });
        expect(mails).toEqual(['HB-2026-0001']);

        const s1 = (await haalStatus(ctx, 'hop-en-bites', token)).body as { status: Record<string, unknown> };
        expect(s1.status).toMatchObject({ status: 'betaald', betaalwijze: 'reservering', nuTeBetalenCenten: 250, restInWinkelCenten: 3250, restBetaald: false });

        expect(await store.boekRest(1, 'pin')).toBe('geboekt');
        expect(await store.boekRest(1, 'contant')).toBe('al_geboekt');
        expect(store.orders[0]).toMatchObject({ rest_betaalmethode: 'pin' });
        const s2 = (await haalStatus(ctx, 'hop-en-bites', token)).body as { status: Record<string, unknown> };
        expect(s2.status).toMatchObject({ restBetaald: true });
    });
    it('bij volledig boekt de balie niets: geen rest', async () => {
        await plaatsOrder(ctx, 'hop-en-bites', order('sleutel-1', regels, { verwachtTotaalCenten: 3500 }));
        await store.startBetaalpoging(1);
        await store.bevestigBetaling(1, { trnref: 't', centen: 3500, methode: null });
        expect(await store.boekRest(1, 'pin')).toBe('geen_rest');
    });
    it('de bevestigingsmail noemt reeds betaald, het rest en 18+', async () => {
        await plaatsOrder(ctx, 'hop-en-bites', order('sleutel-1', regels, { verwachtTotaalCenten: 3500, betaalwijze: 'reservering' }));
        const o = store.orders[0]!;
        const m = bevestigingsmailInhoud({ tenant, order: { ...o, status: 'betaald' }, regels: await store.laadRegels(o.id), moment: await store.laadMoment('m-pakket') });
        expect(m.text).toContain('Je reservering is ontvangen');
        expect(m.text).toContain('Reeds betaald: € 2,50 · te betalen in de winkel bij afhalen: € 32,50');
        expect(m.text).toContain('alcohol (18+)');
        expect(m.html).toContain('Reeds betaald: € 2,50');
        /* Volledig betaald: geen restregel, wel 18+. */
        const v = bevestigingsmailInhoud({ tenant, order: { ...o, status: 'betaald', betaalwijze: 'volledig', nu_te_betalen_cents: 3500, rest_cents: 0 }, regels: await store.laadRegels(o.id), moment: null });
        expect(v.text).not.toContain('Reeds betaald');
        expect(v.text).toContain('Je betaling is ontvangen');
    });
});

/* ── S6 · btw-verdeling ────────────────────────────────────────────────────── */
describe('btw-verdeling (S6)', () => {
    const prod = new Map(producten.map((p) => [p.id, p as Product]));
    it('naar rato van de winkelwaarde: Bier & wijn € 35 = 69,8 % tegen 21 %, 30,2 % tegen 9 %', () => {
        const comp = componentenVan('a-combi-35', slots, 1);
        const v = btwVerdeling(combi35, comp, prod, 3500);
        /* Winkelwaarde 21 %: 1150 + 3 × 495 = 2635; 9 %: 495 + 395 + 250 = 1140; samen 3775. */
        expect(v.delen).toEqual({ '21': 2444, '9': 1056 });
        expect(v.delen['21']! + v.delen['9']!).toBe(3500);
        expect(v.btw).toEqual({ '21': btwDeel(2444, 21), '9': btwDeel(1056, 9) });
    });
    it('een overschrijving op het artikel wint; zonder template alles op btw_pct', () => {
        const v = btwVerdeling({ ...wijn35, btw_verdeling: { '21': 70, '9': 30 } }, componentenVan('a-wijn-35', slots, 1), prod, 3500);
        expect(v.delen).toEqual({ '21': 2450, '9': 1050 });
        expect(btwVerdeling(plank, [], prod, 2990).btw).toEqual({ '9': btwDeel(2990, 9) });
    });
    it('de order slaat per regel de verdeling op en telt die op tot btwCenten', async () => {
        const uit = await plaatsOrder(ctx, 'hop-en-bites', order('sleutel-1', [
            { slug: 'sint-bier-wijn-35', aantal: 2, moment: 'm-pakket' },
            { slug: 'sinterklaas-borrelplank', aantal: 2, moment: 'm-plank' },
        ], { verwachtTotaalCenten: 7000 + 2990 }));
        expect(uit.status).toBe(200);
        const o = store.orders[0]!;
        expect(o.regels[0]?.btw_cents).toEqual({ '21': btwDeel(4888, 21), '9': btwDeel(2112, 9) });
        expect(o.regels[1]?.btw_cents).toEqual({ '9': btwDeel(2990, 9) });
        expect(o.btw_cents).toEqual({ '21': btwDeel(4888, 21), '9': btwDeel(2112, 9) + btwDeel(2990, 9) });
        expect(o.regels[0]?.alcohol).toBe(true);
        expect(o.regels[1]?.alcohol).toBe(false);
    });
});
