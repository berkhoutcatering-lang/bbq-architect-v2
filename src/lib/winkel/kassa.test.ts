import { createSign, generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MYPOS_TEST, onderteken, type MyposConfig, type Velden } from '@/lib/mypos/ipc';
import { maakGeheugenStore, type GeheugenStore } from './geheugenStore';
import { _resetControleKlok, betaalPagina, haalMomenten, haalStatus, offreer, plaatsOrder, terugUrlVoor, terugVanMypos, verwerkBetaalbericht, type KassaContext } from './kassa';
import type { Artikel } from './rekenen';

/* ── Het "myPOS" van de test: een eigen sleutelpaar ────────────────────────── */
const paar = generateKeyPairSync('rsa', { modulusLength: 2048 });
const myposPriv = paar.privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
const myposPub = paar.publicKey.export({ type: 'spki', format: 'pem' }) as string;
const mypos: MyposConfig = { ...MYPOS_TEST, myposCert: myposPub, ipcUrl: 'https://mypos.test/ipc' };

/** Een JSON-antwoord zoals myPOS het ondertekent: alle waarden plat, buitenste Signature erbuiten. */
function myposJson(json: Record<string, unknown>): string {
    const plat = (o: Record<string, unknown>): string[] => Object.values(o).flatMap((v) => (v && typeof v === 'object' ? plat(v as Record<string, unknown>) : [String(v)]));
    const sig = createSign('RSA-SHA256').update(Buffer.from(plat(json).join('-')).toString('base64')).sign(myposPriv, 'base64');
    return JSON.stringify({ ...json, Signature: sig });
}

function bericht(v: Record<string, string>): string {
    const velden = Object.entries(v) as Velden;
    return new URLSearchParams([...velden, ['Signature', onderteken(velden, myposPriv)]]).toString();
}

/* ── Catalogus ─────────────────────────────────────────────────────────────── */
const basis: Omit<Artikel, 'id' | 'slug' | 'naam'> = {
    eenheid: 'per stuk', telt: 'stuks', prijs_cents: 100, btw_pct: 9, minimum: 1, maximum: null,
    verzendbaar: true, gekoeld: false, moment_soort: 'geen', moment_groep: null, afhaalmoment_tekst: null,
    capaciteit_soort: 'aantal', doos_klein_max: null, doos_groot: null, voorraad: null, actief: true, publiek: true,
};
const artikelen: Artikel[] = [
    { ...basis, id: 'a-plank', slug: 'borrel-journey', naam: 'Borrel Journey', eenheid: 'per persoon', telt: 'personen', prijs_cents: 1495, minimum: 8, maximum: 80, verzendbaar: false, gekoeld: true, moment_soort: 'moment', moment_groep: 'agenda', capaciteit_soort: 'regel' },
    { ...basis, id: 'a-kerst', slug: 'kerst-box', naam: 'Kerst-Box', eenheid: 'per persoon', telt: 'personen', prijs_cents: 2350, minimum: 2, verzendbaar: false, gekoeld: true, moment_soort: 'dag', moment_groep: 'kerst-box', afhaalmoment_tekst: 'Afhalen op 23 of 24 december', capaciteit_soort: 'dozen', doos_klein_max: 3, doos_groot: 5 },
    { ...basis, id: 'a-amandel', slug: 'bbq-amandelen', naam: 'BBQ-amandelen', eenheid: 'per zak', prijs_cents: 695, maximum: 20, voorraad: 3 },
];
const momenten = [
    { id: 'm-1', groep: 'agenda', datum: '2026-10-03', van: '16:00:00', tot: '19:00:00', capaciteit: 2, bestellen_tot: null, actief: true },
    { id: 'm-oud', groep: 'agenda', datum: '2026-09-01', van: '16:00:00', tot: '19:00:00', capaciteit: 2, bestellen_tot: null, actief: true },
    { id: 'd-23', groep: 'kerst-box', datum: '2026-12-23', van: null, tot: null, capaciteit: 1, bestellen_tot: null, actief: true },
];
const tenant = { orgId: 'org-1', slug: 'hop-en-bites', bedrijfsnaam: 'Hop & Bites', email: 'info@hopbites.nl', telefoon: '06-1', brandColor: null, ondertitel: null };

let store: GeheugenStore;
let ctx: KassaContext;
let mails: string[];
let nu: Date;

beforeEach(() => {
    nu = new Date('2026-09-13T12:00:00Z');
    mails = [];
    store = maakGeheugenStore({
        tenant, artikelen, momenten, nu,
        instellingen: { verzendkosten_cents: 695, gratis_verzenden_vanaf_cents: null, verzendkosten_btw_pct: 21, reservering_minuten: 30, offerte_geldig_minuten: 15, kassa_open: true, site_url: 'https://hopbites.nl' },
    });
    ctx = {
        store, mypos, appUrl: 'https://bbq-architect-v2.vercel.app',
        mail: async ({ order }) => { mails.push(order.nummer); return { success: true }; },
        nu: () => nu,
    };
    _resetControleKlok();
});
afterEach(() => vi.unstubAllGlobals());

function verzetKlok(minuten: number) {
    nu = new Date(nu.getTime() + minuten * 60_000);
    store.zetNu(nu);
}

const contact = { naam: 'Test Persoon', email: 'test@voorbeeld.nl', telefoon: '0612345678' };
const plankOrder = (sleutel: string, extra: Record<string, unknown> = {}) => ({
    mand: { versie: 1, regels: [{ slug: 'borrel-journey', aantal: 8, moment: 'm-1' }] },
    leverwijze: 'afhalen', momentId: null, contact, adres: null, opmerking: '', sleutel,
    verwachtTotaalCenten: 8 * 1495, terugUrl: '/bestelling', ...extra,
});

/* ── 2. momenten ───────────────────────────────────────────────────────────── */
describe('momenten', () => {
    it('geeft alleen open agenda-momenten, met vrij in besteleenheden', async () => {
        const uit = await haalMomenten(ctx, 'hop-en-bites');
        expect(uit.status).toBe(200);
        expect(uit.body).toEqual({ momenten: [{ id: 'm-1', datum: '2026-10-03', van: '16:00:00', tot: '19:00:00', vrij: 2 }] });
    });
    it('de dagen van de Kerst-Box via ?artikel=kerst-box', async () => {
        const uit = await haalMomenten(ctx, 'hop-en-bites', 'kerst-box');
        expect(uit.body).toEqual({ momenten: [{ id: 'd-23', datum: '2026-12-23', van: null, tot: null, vrij: 1 }] });
    });
    it('onbekende winkel is 404', async () => {
        expect((await haalMomenten(ctx, 'niemand')).status).toBe(404);
    });
});

/* ── 3. offerte ────────────────────────────────────────────────────────────── */
describe('offerte', () => {
    it('rekent in centen en geeft de contractvorm terug', async () => {
        const uit = await offreer(ctx, 'hop-en-bites', { mand: { versie: 1, regels: [{ slug: 'bbq-amandelen', aantal: 2, moment: null }] }, leverwijze: 'verzenden', momentId: null });
        expect(uit.status).toBe(200);
        expect(uit.body).toMatchObject({ ok: true, offerte: { subtotaalCenten: 1390, leverkostenCenten: 695, totaalCenten: 2085, leverwijze: 'verzenden', moment: null } });
    });
    it('onzin is een validatiefout in de vaste foutvorm', async () => {
        const uit = await offreer(ctx, 'hop-en-bites', { mand: { versie: 2 }, leverwijze: 'fiets' });
        expect(uit.status).toBe(400);
        expect(uit.body).toMatchObject({ ok: false, soort: 'validatie' });
    });
    it('vol moment is 409 moment-vol', async () => {
        const a = await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-aaaa'));
        const b = await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-bbbb'));
        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        const uit = await offreer(ctx, 'hop-en-bites', { mand: { versie: 1, regels: [{ slug: 'borrel-journey', aantal: 8, moment: 'm-1' }] }, leverwijze: 'afhalen', momentId: null });
        expect(uit.status).toBe(409);
        expect(uit.body).toMatchObject({ ok: false, soort: 'moment-vol' });
    });
});

/* ── 4. order ──────────────────────────────────────────────────────────────── */
describe('order', () => {
    it('maakt een order met een onraadbaar token en een betaalUrl op deze app', async () => {
        const uit = await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-0001'));
        expect(uit.status).toBe(200);
        const b = uit.body as { ok: true; token: string; betaalUrl: string };
        expect(b.token).toMatch(/^[a-f0-9]{64}$/);
        expect(b.betaalUrl).toBe(`https://bbq-architect-v2.vercel.app/api/public-winkel/hop-en-bites/betaal/${b.token}`);
        expect(store.orders[0]).toMatchObject({ status: 'wacht', totaal_cents: 11960, nummer: 'HB-2026-0001', contact_email: 'test@voorbeeld.nl' });
    });

    it('een gewijzigd browserbedrag levert 409 prijs-gewijzigd met de nieuwe offerte', async () => {
        const uit = await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-0002', { verwachtTotaalCenten: 1 }));
        expect(uit.status).toBe(409);
        expect(uit.body).toMatchObject({ ok: false, soort: 'prijs-gewijzigd', offerte: { totaalCenten: 11960 } });
        expect(store.orders).toHaveLength(0);
    });

    it('dezelfde sleutel is dezelfde order: dubbel klikken maakt geen tweede', async () => {
        const [a, b] = await Promise.all([plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-dubbel')), plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-dubbel'))]);
        const c = await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-dubbel', { verwachtTotaalCenten: 1 }));
        expect((a.body as { token: string }).token).toBe((b.body as { token: string }).token);
        expect((c.body as { token: string }).token).toBe((a.body as { token: string }).token);
        expect(store.orders).toHaveLength(1);
    });

    it('reserveert capaciteit: de derde plank op een moment met twee plekken is moment-vol', async () => {
        await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-s-1'));
        await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-s-2'));
        const derde = await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-s-3'));
        expect(derde.status).toBe(409);
        expect(derde.body).toMatchObject({ ok: false, soort: 'moment-vol' });
        expect((await haalMomenten(ctx, 'hop-en-bites')).body).toEqual({ momenten: [expect.objectContaining({ id: 'm-1', vrij: 0 })] });
    });

    it('na dertig minuten is de plek weer vrij en de oude order verlopen', async () => {
        const eerste = await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-s-1'));
        expect((await haalMomenten(ctx, 'hop-en-bites')).body).toEqual({ momenten: [expect.objectContaining({ vrij: 1 })] });
        verzetKlok(31);
        expect((await haalMomenten(ctx, 'hop-en-bites')).body).toEqual({ momenten: [expect.objectContaining({ vrij: 2 })] });
        expect((await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-s-2'))).status).toBe(200);
        expect((await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-s-3'))).status).toBe(200);
        const status = await haalStatus(ctx, 'hop-en-bites', (eerste.body as { token: string }).token);
        expect(status.body).toMatchObject({ ok: true, status: { status: 'verlopen', betaalUrl: null } });
        // Dezelfde sleutel na verlopen mag opnieuw (verse reservering) — maar s-2 en s-3 hebben nu de twee plekken.
        const opnieuw = await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-s-1'));
        expect(opnieuw.status).toBe(409);
        expect(store.orders).toHaveLength(3);
    });

    it('reserveert voorraad', async () => {
        const amandel = (sleutel: string, aantal: number) => ({ mand: { versie: 1, regels: [{ slug: 'bbq-amandelen', aantal, moment: null }] }, leverwijze: 'afhalen', momentId: null, contact, adres: null, opmerking: '', sleutel, verwachtTotaalCenten: aantal * 695, terugUrl: '/bestelling' });
        expect((await plaatsOrder(ctx, 'hop-en-bites', amandel('sleutel-v-1', 2))).status).toBe(200);
        const teVeel = await plaatsOrder(ctx, 'hop-en-bites', amandel('sleutel-v-2', 2));
        expect(teVeel.status).toBe(400);
        expect(teVeel.body).toMatchObject({ ok: false, soort: 'validatie', fouten: ['BBQ-amandelen is nog maar 1 keer beschikbaar.'] });
    });

    it('verzenden vraagt een adres; een terug-URL buiten de website wordt geweigerd', async () => {
        const basisOrder = { mand: { versie: 1, regels: [{ slug: 'bbq-amandelen', aantal: 1, moment: null }] }, leverwijze: 'verzenden', momentId: null, contact, opmerking: '', verwachtTotaalCenten: 695 + 695 };
        const zonder = await plaatsOrder(ctx, 'hop-en-bites', { ...basisOrder, adres: null, sleutel: 'adres-0001', terugUrl: '/bestelling' });
        expect(zonder.body).toMatchObject({ ok: false, soort: 'validatie', fouten: ['Vul een bezorgadres in.'] });
        const elders = await plaatsOrder(ctx, 'hop-en-bites', { ...basisOrder, adres: { straat: 'Tramstraat 13', postcode: '7848 BP', plaats: 'Schoonoord' }, sleutel: 'adres-0002', terugUrl: 'https://kwaad.nl/x' });
        expect(elders.status).toBe(400);
        const goed = await plaatsOrder(ctx, 'hop-en-bites', { ...basisOrder, adres: { straat: 'Tramstraat 13', postcode: '7848 BP', plaats: 'Schoonoord' }, sleutel: 'adres-0003', terugUrl: 'https://hopbites.nl/bestelling' });
        expect(goed.status).toBe(200);
        expect(store.orders[0]?.adres).toEqual({ straat: 'Tramstraat 13', postcode: '7848 BP', plaats: 'Schoonoord' });
    });

    it('zonder myPOS-configuratie geen order maar niet-beschikbaar', async () => {
        const uit = await plaatsOrder({ ...ctx, mypos: null }, 'hop-en-bites', plankOrder('sleutel-s-x'));
        expect(uit.status).toBe(503);
        expect(uit.body).toMatchObject({ ok: false, soort: 'niet-beschikbaar' });
    });

    it('terugUrlVoor: alleen een pad of het eigen domein', () => {
        expect(terugUrlVoor('https://hopbites.nl', '/bestelling', 'tok')).toBe('https://hopbites.nl/bestelling/tok');
        expect(terugUrlVoor('https://hopbites.nl/', '/bestelling/', 'tok')).toBe('https://hopbites.nl/bestelling/tok');
        expect(terugUrlVoor('https://hopbites.nl', 'https://hopbites.nl/bestelling', 'tok')).toBe('https://hopbites.nl/bestelling/tok');
        expect(terugUrlVoor('https://hopbites.nl', 'https://hopbites.nl.kwaad.nl/bestelling', 'tok')).toBeNull();
        expect(terugUrlVoor('https://hopbites.nl', '//kwaad.nl', 'tok')).toBeNull();
        expect(terugUrlVoor(null, '/bestelling', 'tok')).toBeNull();
    });
});

/* ── 5. status ─────────────────────────────────────────────────────────────── */
describe('status', () => {
    it('onbekend of misvormd token is 404', async () => {
        expect((await haalStatus(ctx, 'hop-en-bites', 'a'.repeat(64))).status).toBe(404);
        expect((await haalStatus(ctx, 'hop-en-bites', 'kort')).status).toBe(404);
    });
    it('toont alleen de contractvelden, met gemaskeerd e-mailadres', async () => {
        const o = await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-s-1', { opmerking: 'zonder noten graag' }));
        const token = (o.body as { token: string }).token;
        const uit = await haalStatus(ctx, 'hop-en-bites', token);
        expect(uit.status).toBe(200);
        const s = (uit.body as { status: Record<string, unknown> }).status;
        expect(Object.keys(s).sort()).toEqual(['aangemaakt', 'betaalUrl', 'emailGemaskeerd', 'leverkostenCenten', 'leverwijze', 'moment', 'naam', 'nummer', 'regels', 'status', 'subtotaalCenten', 'token', 'totaalCenten']);
        expect(s).toMatchObject({ status: 'wacht', nummer: 'HB-2026-0001', emailGemaskeerd: 't•••@voorbeeld.nl', naam: 'Test Persoon', totaalCenten: 11960, moment: { id: 'm-1', vrij: 1 } });
        expect(s.betaalUrl).toContain(token);
        expect(JSON.stringify(s)).not.toContain('0612345678');
        expect(JSON.stringify(s)).not.toContain('zonder noten');
    });
});

/* ── betaalpagina ──────────────────────────────────────────────────────────── */
describe('betaalpagina', () => {
    it('post een ondertekend formulier naar myPOS met OrderID nummer-poging', async () => {
        const o = await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-s-1'));
        const token = (o.body as { token: string }).token;
        const uit = await betaalPagina(ctx, 'hop-en-bites', token);
        expect(uit.soort).toBe('html');
        if (uit.soort !== 'html') return;
        expect(uit.html).toContain('action="https://mypos.test/ipc"');
        expect(uit.html).toContain('name="OrderID" value="HB-2026-0001-1"');
        expect(uit.html).toContain('name="Amount" value="119.60"');
        expect(uit.html).toContain(`value="https://bbq-architect-v2.vercel.app/api/public-winkel/hop-en-bites/betaal/${token}/terug?uitkomst=ok"`);
        expect(uit.html).toContain('value="https://bbq-architect-v2.vercel.app/api/public-winkel/hop-en-bites/mypos-webhook"');
        // Herladen is dezelfde poging.
        const nogEens = await betaalPagina(ctx, 'hop-en-bites', token);
        expect(nogEens.soort === 'html' && nogEens.html).toContain('HB-2026-0001-1"');
        expect(store.orders[0]?.betaalpoging).toBe(1);
    });

    it('afgebroken → opnieuw proberen is poging 2; betaald → terug naar de site', async () => {
        const o = await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-s-1'));
        const token = (o.body as { token: string }).token;
        await betaalPagina(ctx, 'hop-en-bites', token);
        const terug = await terugVanMypos(ctx, 'hop-en-bites', token, 'afgebroken');
        expect(terug).toEqual({ soort: 'redirect', url: `https://hopbites.nl/bestelling/${token}` });
        expect((await haalStatus(ctx, 'hop-en-bites', token)).body).toMatchObject({ status: { status: 'afgebroken', betaalUrl: expect.stringContaining(token) } });
        const opnieuw = await betaalPagina(ctx, 'hop-en-bites', token);
        expect(opnieuw.soort === 'html' && opnieuw.html).toContain('HB-2026-0001-2"');
        expect(store.orders[0]?.status).toBe('wacht');

        await store.bevestigBetaling(1, { trnref: 'x', centen: 11960, methode: null });
        expect(await betaalPagina(ctx, 'hop-en-bites', token)).toEqual({ soort: 'redirect', url: `https://hopbites.nl/bestelling/${token}` });
    });

    it('verlopen en de plek is weg → verlopen, terug naar de site', async () => {
        const o = await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-s-1'));
        const token = (o.body as { token: string }).token;
        verzetKlok(31);
        await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-s-2'));
        await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-s-3'));
        expect(await betaalPagina(ctx, 'hop-en-bites', token)).toEqual({ soort: 'redirect', url: `https://hopbites.nl/bestelling/${token}` });
        expect(store.orders[0]).toMatchObject({ status: 'verlopen', status_reden: 'plek-vergeven' });
    });
});

/* ── 6. webhook ────────────────────────────────────────────────────────────── */
describe('webhook', () => {
    async function orderMetPoging(sleutel = 'sleutel-s-1') {
        const o = await plaatsOrder(ctx, 'hop-en-bites', plankOrder(sleutel));
        const token = (o.body as { token: string }).token;
        await betaalPagina(ctx, 'hop-en-bites', token);
        return { token, order: store.orders.find((x) => x.token === token)! };
    }
    const notify = (orderId: string, extra: Record<string, string> = {}) => bericht({
        IPCmethod: 'IPCPurchaseNotify', SID: mypos.sid, Amount: '119.60', Currency: 'EUR', OrderID: orderId,
        IPC_Trnref: 'TRN-1', RequestDateTime: '20260913120000', RequestSTAN: '000001', PaymentMethod: '2', ...extra,
    });

    it('een geldig bericht maakt de order betaald en stuurt één mail; herhaling doet niets', async () => {
        const { token, order } = await orderMetPoging();
        const uit = await verwerkBetaalbericht(ctx, 'hop-en-bites', notify(order.mypos_order_id!));
        expect(uit).toEqual({ status: 200, tekst: 'OK' });
        expect((await haalStatus(ctx, 'hop-en-bites', token)).body).toMatchObject({ status: { status: 'betaald', betaalUrl: null } });
        expect(store.orders[0]).toMatchObject({ mypos_trnref: 'TRN-1', betaald_cents: 11960, betaalmethode: '2', mail_status: 'verstuurd' });
        expect(mails).toEqual(['HB-2026-0001']);

        const nogEens = await verwerkBetaalbericht(ctx, 'hop-en-bites', notify(order.mypos_order_id!));
        expect(nogEens.tekst).toBe('OK');
        expect(mails).toHaveLength(1);
        // Ook een ander bericht (andere referentie) voor dezelfde order: blijft betaald, geen tweede mail.
        await verwerkBetaalbericht(ctx, 'hop-en-bites', notify(order.mypos_order_id!, { IPC_Trnref: 'TRN-2' }));
        expect(store.orders[0]?.status).toBe('betaald');
        expect(mails).toHaveLength(1);
    });

    it('een bericht voor een eerdere poging hoort bij dezelfde order', async () => {
        const { token, order } = await orderMetPoging();
        await terugVanMypos(ctx, 'hop-en-bites', token, 'afgebroken');
        await betaalPagina(ctx, 'hop-en-bites', token); // poging 2
        expect(order.mypos_order_id).toBe('HB-2026-0001-2');
        await verwerkBetaalbericht(ctx, 'hop-en-bites', notify('HB-2026-0001-1'));
        expect(store.orders[0]?.status).toBe('betaald');
    });

    it('een verkeerde handtekening is 400 en verandert niets', async () => {
        const { order } = await orderMetPoging();
        const body = notify(order.mypos_order_id!).replace('Amount=119.60', 'Amount=1.00');
        expect(await verwerkBetaalbericht(ctx, 'hop-en-bites', body)).toEqual({ status: 400, tekst: 'INVALID SIGNATURE' });
        expect(store.orders[0]?.status).toBe('wacht');
        expect(mails).toEqual([]);
    });

    it('een afwijkend bedrag maakt de order niet betaald', async () => {
        const { order } = await orderMetPoging();
        await verwerkBetaalbericht(ctx, 'hop-en-bites', notify(order.mypos_order_id!, { Amount: '100.00' }));
        expect(store.orders[0]?.status).toBe('wacht');
        expect(store.berichten[0]?.uitkomst).toBe('bedrag-wijkt-af:10000');
        expect(mails).toEqual([]);
    });

    it('een mailstoring maakt een betaalde order niet onbetaald', async () => {
        const { order } = await orderMetPoging();
        ctx.mail = async () => { throw new Error('Resend down'); };
        await verwerkBetaalbericht(ctx, 'hop-en-bites', notify(order.mypos_order_id!));
        expect(store.orders[0]).toMatchObject({ status: 'betaald', mail_status: 'mislukt', mail_fout: 'Resend down' });
    });

    it('betaling ná het verlopen: alsnog betaald als er nog plek is', async () => {
        const { order } = await orderMetPoging();
        verzetKlok(31);
        await verwerkBetaalbericht(ctx, 'hop-en-bites', notify(order.mypos_order_id!));
        expect(store.orders[0]?.status).toBe('betaald');
        expect(mails).toHaveLength(1);
    });

    it('betaling ná het verlopen zonder plek: mislukt met reden, en terugbetaald', async () => {
        const { order } = await orderMetPoging('sleutel-s-1');
        verzetKlok(31);
        await orderMetPoging('sleutel-s-2');
        await orderMetPoging('sleutel-s-3');
        const refundAanroepen: string[] = [];
        vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
            const velden = Object.fromEntries(new URLSearchParams(init.body));
            refundAanroepen.push(`${velden.IPCmethod}:${velden.OrderID}:${velden.Amount}:${velden.IPC_Trnref}`);
            return new Response(myposJson({ IPCMethod: 'IPCRefund', Status: 0, StatusMsg: 'Success' }));
        });
        await verwerkBetaalbericht(ctx, 'hop-en-bites', notify(order.mypos_order_id!));
        expect(store.orders[0]).toMatchObject({ status: 'mislukt', status_reden: 'verlopen-en-vol', refund_status: 'gelukt' });
        expect(refundAanroepen).toEqual(['IPCRefund:HB-2026-0001-1:119.60:TRN-1']);
        expect(mails).toEqual([]);
        expect((await haalStatus(ctx, 'hop-en-bites', order.token)).body).toMatchObject({ status: { status: 'mislukt', betaalUrl: null } });
    });

    it('een rollback zet een wachtende order op mislukt (opnieuw betalen kan), en raakt een betaalde niet', async () => {
        const { token, order } = await orderMetPoging();
        await verwerkBetaalbericht(ctx, 'hop-en-bites', notify(order.mypos_order_id!, { IPCmethod: 'IPCPurchaseRollback' }));
        expect(store.orders[0]).toMatchObject({ status: 'mislukt', status_reden: 'teruggedraaid-door-mypos' });
        expect((await haalStatus(ctx, 'hop-en-bites', token)).body).toMatchObject({ status: { status: 'mislukt', betaalUrl: expect.stringContaining(token) } });
        await verwerkBetaalbericht(ctx, 'hop-en-bites', notify(order.mypos_order_id!, { IPC_Trnref: 'TRN-2' }));
        expect(store.orders[0]?.status).toBe('betaald');
        await verwerkBetaalbericht(ctx, 'hop-en-bites', notify(order.mypos_order_id!, { IPCmethod: 'IPCPurchaseRollback', IPC_Trnref: 'TRN-2' }));
        expect(store.orders[0]?.status).toBe('betaald');
        expect(store.berichten.at(-1)?.uitkomst).toBe('rollback-na-betaling');
    });

    it('onbekende winkel, geen configuratie, onbekende order', async () => {
        expect((await verwerkBetaalbericht(ctx, 'niemand', '')).status).toBe(404);
        expect((await verwerkBetaalbericht({ ...ctx, mypos: null }, 'hop-en-bites', '')).status).toBe(503);
        expect(await verwerkBetaalbericht(ctx, 'hop-en-bites', notify('HB-2099-9999-1'))).toEqual({ status: 200, tekst: 'OK' });
        expect(store.berichten[0]?.uitkomst).toBe('order-onbekend');
    });
});

/* ── statuscontrole bij myPOS als het bericht uitblijft ────────────────────── */
describe('statuscontrole', () => {
    it('terug met uitkomst=ok vraagt myPOS één keer en verwerkt een betaalde transactie', async () => {
        const o = await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-s-1'));
        const token = (o.body as { token: string }).token;
        await betaalPagina(ctx, 'hop-en-bites', token);
        let aanroepen = 0;
        vi.stubGlobal('fetch', async () => {
            aanroepen += 1;
            return new Response(myposJson({ IPCMethod: 'IPCGetTxnStatus', OrderID: 'HB-2026-0001-1', OrderStatus: { IPCmethod: 'IPCPurchaseNotify', SID: mypos.sid, Amount: '119.60', Currency: 'EUR', OrderID: 'HB-2026-0001-1', IPC_Trnref: 'TRN-9', Signature: 'x' }, Status: 0, StatusMsg: 'Success' }));
        });
        expect(await terugVanMypos(ctx, 'hop-en-bites', token, 'ok')).toEqual({ soort: 'redirect', url: `https://hopbites.nl/bestelling/${token}` });
        expect(aanroepen).toBe(1);
        expect(store.orders[0]).toMatchObject({ status: 'betaald', mypos_trnref: 'TRN-9' });
        expect(mails).toEqual(['HB-2026-0001']);
        // De statuspagina vraagt het niet nog eens (al betaald), en het latere webhook-bericht doet niets extra.
        await haalStatus(ctx, 'hop-en-bites', token);
        expect(aanroepen).toBe(1);
    });

    it('de statuspagina vraagt het hooguit eens per tien seconden, en negeert een onbetaalde transactie', async () => {
        const o = await plaatsOrder(ctx, 'hop-en-bites', plankOrder('sleutel-s-1'));
        const token = (o.body as { token: string }).token;
        await betaalPagina(ctx, 'hop-en-bites', token);
        let aanroepen = 0;
        vi.stubGlobal('fetch', async () => {
            aanroepen += 1;
            return new Response(myposJson({ IPCMethod: 'IPCGetTxnStatus', OrderID: 'HB-2026-0001-1', OrderStatus: { IPCmethod: 'IPCPurchaseRollback', SID: mypos.sid, Amount: '119.60', Currency: 'EUR', OrderID: 'HB-2026-0001-1', Signature: 'x' }, Status: 0, StatusMsg: 'Success' }));
        });
        await haalStatus(ctx, 'hop-en-bites', token);
        await haalStatus(ctx, 'hop-en-bites', token);
        expect(aanroepen).toBe(1);
        verzetKlok(1);
        await haalStatus(ctx, 'hop-en-bites', token);
        expect(aanroepen).toBe(2);
        expect(store.orders[0]?.status).toBe('wacht');
    });
});
