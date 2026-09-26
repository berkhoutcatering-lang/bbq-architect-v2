/**
 * De kassa — wat de routes onder /api/public-winkel/[slug] doen.
 *
 * Elke handeling geeft { status, body } terug (of html/redirect), zodat de
 * route alleen nog hoeft te vertalen naar een Response en de logica hier met
 * een geheugen-opslag getest wordt. Het contract met de website staat in
 * types.ts; de foutvorm is overal gelijk:
 *   { ok: false, soort, fouten? | melding? }
 *
 * Wat hier de waarheid is: prijs, btw, verzendkosten, reservering en
 * betaalstatus. Bedragen uit de browser zijn nooit waarheid; het enige dat
 * de website meestuurt is verwachtTotaalCenten, om een prijswijziging te
 * ontdekken.
 */
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { betaalFormulierHtml, getTxnStatus, leesBetaalbericht, purchaseVelden, refund, type MyposConfig } from '@/lib/mypos/ipc';
import { berekenOfferte, maskeerEmail, momentOpen, naarMoment, vandaagISO, type MomentRij, type OfferteInternUitkomst } from './rekenen';
import { plaatsBestelling } from './plaatsing';
import type { OrderRegelRij, OrderRij, Tenant, WinkelStore } from './store';
import type { Mand, Moment, Offerte, Offerteregel, OfferteUitkomst, OrderUitkomst, Orderstatus } from './types';

/* ── Context ───────────────────────────────────────────────────────────────── */

export interface Bevestigingsmail {
    (args: { tenant: Tenant; order: OrderRij; regels: OrderRegelRij[]; moment: MomentRij | null }): Promise<{ success: boolean; error?: string }>;
}

export interface KassaContext {
    store: WinkelStore;
    mypos: MyposConfig | null;
    /** Basis-URL van BBQ Architect zoals de website hem aanroept (betaalUrl). */
    appUrl: string;
    /** Basis-URL waarop myPOS ons bereikt (webhook, terugkeer). Meestal gelijk aan appUrl; lokaal anders. */
    webhookUrl?: string;
    /** Extra query-parameters op de URL's die myPOS aanroept (Vercel-preview-bypass). */
    webhookQuery?: Record<string, string>;
    mail: Bevestigingsmail;
    nu?: () => Date;
}

export interface Antwoord<T = unknown> {
    status: number;
    body: T;
}

const NIET_BESCHIKBAAR = 'Online afrekenen is op dit moment niet beschikbaar. Probeer het later, of bel ons.';

function fout(status: number, body: Exclude<OfferteUitkomst, { ok: true }> | Exclude<OrderUitkomst, { ok: true }>): Antwoord {
    return { status, body };
}

const STATUS_VOOR_SOORT: Record<string, number> = {
    validatie: 400,
    'moment-vol': 409,
    'moment-verlopen': 409,
    'prijs-gewijzigd': 409,
    'niet-beschikbaar': 503,
};

function foutVanUitkomst(u: Exclude<OfferteInternUitkomst, { ok: true }>): Antwoord {
    return fout(STATUS_VOOR_SOORT[u.soort] ?? 400, u);
}

/* ── Invoer ────────────────────────────────────────────────────────────────── */

const MandSchema = z.object({
    versie: z.literal(1),
    regels: z.array(z.object({
        slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
        aantal: z.number().int().min(1).max(9999),
        moment: z.string().max(80).nullable().optional().transform((v) => v ?? null),
        /* De pakketten zijn vast (S1): keuzes horen er nog niet bij. Meesturen = validatie. */
        keuzes: z.unknown().optional(),
    })).max(50),
});

const OfferteSchema = z.object({
    mand: MandSchema,
    leverwijze: z.enum(['afhalen', 'verzenden']),
    momentId: z.string().max(80).nullable().optional().transform((v) => v ?? null),
    /* S5: volledig online, of het reserveringsbedrag nu en de rest in de winkel. */
    betaalwijze: z.enum(['volledig', 'reservering']).optional().default('volledig'),
});

const OrderSchema = OfferteSchema.extend({
    contact: z.object({
        naam: z.string().trim().min(1, 'Vul je naam in.').max(200),
        email: z.string().trim().email('Vul een geldig e-mailadres in.').max(200),
        telefoon: z.string().trim().max(50).optional().default(''),
    }),
    adres: z.object({
        straat: z.string().trim().min(1).max(200),
        postcode: z.string().trim().min(1).max(20),
        plaats: z.string().trim().min(1).max(100),
    }).nullable().optional().transform((v) => v ?? null),
    opmerking: z.string().trim().max(2000).optional().default(''),
    sleutel: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/, 'Ongeldige sleutel.'),
    verwachtTotaalCenten: z.number().int().min(0),
    terugUrl: z.string().max(300).optional().default('/bestelling'),
});

function zodFouten(e: z.ZodError): string[] {
    const zinnen = e.issues.map((i) => i.message).filter((m) => /[a-z]/i.test(m) && !/^(Invalid|Required|Expected)/i.test(m));
    return zinnen.length ? [...new Set(zinnen)] : ['Controleer je gegevens en probeer het opnieuw.'];
}

/* ── Hulpjes ───────────────────────────────────────────────────────────────── */

async function tenantEnBronnen(ctx: KassaContext, slug: string) {
    const tenant = await ctx.store.laadTenant(slug);
    if (!tenant) return null;
    const bronnen = await ctx.store.laadBronnen(tenant.orgId);
    if (!bronnen) return null;
    return { tenant, bronnen };
}

function betaalUrlVoor(ctx: KassaContext, slug: string, token: string): string {
    return `${ctx.appUrl.replace(/\/$/, '')}/api/public-winkel/${slug}/betaal/${token}`;
}

/** De terug-URL op de website: alleen een pad, of een URL op het eigen domein. */
export function terugUrlVoor(siteUrl: string | null, terugUrl: string, token: string): string | null {
    const basis = (siteUrl ?? '').replace(/\/$/, '');
    let pad: string;
    if (/^https?:\/\//i.test(terugUrl)) {
        if (!basis || !terugUrl.startsWith(basis + '/')) return null;
        pad = terugUrl.slice(basis.length);
    } else if (terugUrl.startsWith('/') && !terugUrl.startsWith('//')) {
        pad = terugUrl;
    } else {
        return null;
    }
    if (!basis) return null;
    return `${basis}${pad.replace(/\/$/, '')}/${token}`;
}

function regelsNaarContract(regels: OrderRegelRij[]): Offerteregel[] {
    return regels.map((r) => ({
        slug: r.slug, naam: r.naam, aantal: r.aantal, eenheid: r.eenheid,
        stukCenten: r.stuk_cents, bedragCenten: r.bedrag_cents, afhaalmoment: r.afhaalmoment_tekst,
    }));
}

/** 'per persoon' × 7 → 'personen'; 'per zak' × 1 → 'zak'. */
export function meervoud(eenheid: string, aantal: number): string {
    const enkel = eenheid.replace(/^per\s+/i, '').trim();
    if (aantal === 1) return enkel;
    const vast: Record<string, string> = { persoon: 'personen', zak: 'zakken', fles: 'flessen', doos: 'dozen', stuk: 'stuks', pot: 'potten' };
    return vast[enkel.toLowerCase()] ?? enkel;
}

/**
 * Het ordernummer uit een myPOS-OrderID. De OrderID richting myPOS is
 * "<nummer>-<poging>-<6 tekens van het token>": het token-stuk maakt hem
 * uniek over omgevingen en tellerresets heen (preview en productie delen
 * dezelfde myPOS-testwinkel, en myPOS weigert een OrderID die hij al kent —
 * "E_INVALID_PARAMS: order_id: Duplicate value", 13 september 2026).
 * Oudere OrderID's zonder token-stuk worden ook nog begrepen.
 */
export function nummerUitOrderId(orderId: string): string {
    return orderId.replace(/-\d+(-[a-f0-9]{6})?$/, '');
}

/** "€ 32,50" — voor de omschrijving richting myPOS. */
function euroTekst(centen: number): string {
    return '€ ' + (centen / 100).toFixed(2).replace('.', ',');
}

function isVerlopen(o: OrderRij, nu: Date): boolean {
    return o.status === 'wacht' && new Date(o.reservering_tot).getTime() <= nu.getTime();
}

/* ── 2. Momenten ───────────────────────────────────────────────────────────── */

export async function haalMomenten(ctx: KassaContext, slug: string, groep = 'agenda'): Promise<Antwoord> {
    const t = await tenantEnBronnen(ctx, slug);
    if (!t) return fout(404, { ok: false, soort: 'niet-beschikbaar', melding: 'Onbekende winkel.' });
    const vandaag = vandaagISO(ctx.nu?.());
    /* Een artikel-slug mag ook: dan de groep van dat artikel. */
    const artikel = t.bronnen.artikelen.find((a) => a.slug === groep);
    const g = artikel?.moment_groep ?? groep;
    const momenten = t.bronnen.momenten.filter((m) => m.groep === g && momentOpen(m, vandaag, ctx.nu?.())).map(naarMoment);
    return { status: 200, body: { momenten } };
}

/* ── 3. Offerte ────────────────────────────────────────────────────────────── */

export async function offreer(ctx: KassaContext, slug: string, invoer: unknown): Promise<Antwoord> {
    const t = await tenantEnBronnen(ctx, slug);
    if (!t) return fout(404, { ok: false, soort: 'niet-beschikbaar', melding: 'Onbekende winkel.' });
    const parsed = OfferteSchema.safeParse(invoer);
    if (!parsed.success) return fout(400, { ok: false, soort: 'validatie', fouten: zodFouten(parsed.error) });
    const { mand, leverwijze, momentId, betaalwijze } = parsed.data;
    const uit = berekenOfferte({ ...t.bronnen, nu: ctx.nu?.() }, mand as Mand, leverwijze, momentId, betaalwijze);
    if (uit.ok === false) return foutVanUitkomst(uit);
    return { status: 200, body: { ok: true, offerte: uit.intern.offerte } };
}

/* ── 4. Order ──────────────────────────────────────────────────────────────── */

export async function plaatsOrder(ctx: KassaContext, slug: string, invoer: unknown): Promise<Antwoord> {
    const t = await tenantEnBronnen(ctx, slug);
    if (!t) return fout(404, { ok: false, soort: 'niet-beschikbaar', melding: 'Onbekende winkel.' });
    const parsed = OrderSchema.safeParse(invoer);
    if (!parsed.success) return fout(400, { ok: false, soort: 'validatie', fouten: zodFouten(parsed.error) });
    const d = parsed.data;

    /* Idempotent op sleutel: dezelfde sleutel is dezelfde order en dezelfde
       betaalUrl, ook na een timeout. Vóór het rekenen, zodat een tweede klik
       nooit op 'prijs-gewijzigd' stuit terwijl de eerste al een order heeft. */
    const bestaand = await ctx.store.vindOrderOpSleutel(t.tenant.orgId, d.sleutel);
    if (bestaand) {
        return { status: 200, body: { ok: true, token: bestaand.token, betaalUrl: betaalUrlVoor(ctx, slug, bestaand.token) } satisfies OrderUitkomst };
    }

    if (!ctx.mypos) return fout(503, { ok: false, soort: 'niet-beschikbaar', melding: NIET_BESCHIKBAAR });
    if (!terugUrlVoor(t.bronnen.instellingen.site_url, d.terugUrl, 'x')) {
        return fout(400, { ok: false, soort: 'validatie', fouten: ['De terug-URL hoort op de website zelf te liggen.'] });
    }
    if (d.leverwijze === 'verzenden' && !d.adres) {
        return fout(400, { ok: false, soort: 'validatie', fouten: ['Vul een bezorgadres in.'] });
    }

    const uit = berekenOfferte({ ...t.bronnen, nu: ctx.nu?.() }, d.mand as Mand, d.leverwijze, d.momentId, d.betaalwijze);
    if (uit.ok === false) return foutVanUitkomst(uit);
    const { offerte, regels, btwCenten, momentId } = uit.intern;

    /* De prijs is tussen bekijken en afrekenen veranderd? Geen order, maar de
       nieuwe offerte terug zodat de klant opnieuw bevestigt. */
    if (offerte.totaalCenten !== d.verwachtTotaalCenten) {
        return fout(409, { ok: false, soort: 'prijs-gewijzigd', offerte });
    }

    const token = randomBytes(32).toString('hex');
    const geplaatst = await ctx.store.plaatsOrder({
        orgId: t.tenant.orgId,
        sleutel: d.sleutel,
        token,
        leverwijze: d.leverwijze,
        momentId,
        contact: d.contact,
        adres: d.leverwijze === 'verzenden' ? d.adres : null,
        opmerking: d.opmerking,
        subtotaalCenten: offerte.subtotaalCenten,
        leverkostenCenten: offerte.leverkostenCenten,
        totaalCenten: offerte.totaalCenten,
        btwCenten,
        terugUrl: d.terugUrl,
        regels,
        betaalwijze: offerte.betaalwijze,
        nuTeBetalenCenten: offerte.nuTeBetalenCenten,
        restCenten: offerte.restInWinkelCenten,
    });
    if (geplaatst.ok === false) {
        const code = geplaatst.code;
        switch (code) {
            case 'WK001': return fout(409, { ok: false, soort: 'moment-vol', melding: 'Dit afhaalmoment is net volgeboekt. Kies een ander moment.' });
            case 'WK002': return fout(400, { ok: false, soort: 'validatie', fouten: ['Een van de producten is net uitverkocht. Pas je mand aan.'] });
            case 'WK009': return fout(400, { ok: false, soort: 'validatie', fouten: ['Een onderdeel van je bestelling is net uitverkocht. Pas je mand aan.'] });
            case 'WK008': return fout(409, { ok: false, soort: 'moment-vol', melding: 'Dit product is net uitverkocht. Er is geen plek meer.' });
            case 'WK003': return fout(409, { ok: false, soort: 'moment-verlopen', melding: 'Dit afhaalmoment is niet meer beschikbaar. Kies een ander moment.' });
            default: return fout(503, { ok: false, soort: 'niet-beschikbaar', melding: NIET_BESCHIKBAAR });
        }
    }
    const order = geplaatst.waarde;
    return { status: 200, body: { ok: true, token: order.token, betaalUrl: betaalUrlVoor(ctx, slug, order.token) } satisfies OrderUitkomst };
}

/* ── 5. Status ─────────────────────────────────────────────────────────────── */

/** Hoe vaak we myPOS zelf om de status vragen als het betaalbericht uitblijft. */
const controleerNa = new Map<string, number>();
const CONTROLE_INTERVAL_MS = 10_000;

export async function haalStatus(ctx: KassaContext, slug: string, token: string): Promise<Antwoord> {
    const tenant = await ctx.store.laadTenant(slug);
    if (!tenant || !/^[a-f0-9]{64}$/.test(token)) return { status: 404, body: { ok: false, soort: 'niet-beschikbaar', melding: 'Onbekende bestelling.' } };
    let order = await ctx.store.vindOrderOpToken(tenant.orgId, token);
    if (!order) return { status: 404, body: { ok: false, soort: 'niet-beschikbaar', melding: 'Onbekende bestelling.' } };
    const nu = ctx.nu?.() ?? new Date();

    /* Verlopen: te lang op 'wacht'. Vanaf hier houdt de order geen plek meer vast. */
    if (isVerlopen(order, nu)) {
        await ctx.store.zetStatus(order.id, 'verlopen', 'niet-betaald-binnen-de-tijd');
        order = { ...order, status: 'verlopen' };
    }

    /* Wacht de order op een betaalbericht dat maar niet komt? Dan vragen we
       het myPOS zelf, hooguit eens per tien seconden per order. */
    if (order.status === 'wacht' && order.betaalpoging > 0 && order.mypos_order_id && ctx.mypos) {
        const laatst = controleerNa.get(order.token) ?? 0;
        if (nu.getTime() - laatst > CONTROLE_INTERVAL_MS) {
            controleerNa.set(order.token, nu.getTime());
            const bijgewerkt = await controleerBijMypos(ctx, tenant, order);
            if (bijgewerkt) order = bijgewerkt;
        }
    }

    const regels = await ctx.store.laadRegels(order.id);
    const moment = order.moment_id ? await ctx.store.laadMoment(order.moment_id) : null;
    const kanBetalen = order.status === 'wacht' || ((order.status === 'afgebroken' || order.status === 'mislukt') && order.refund_status == null);
    const status: Orderstatus = {
        token: order.token,
        nummer: order.nummer,
        status: order.status,
        regels: regelsNaarContract(regels),
        subtotaalCenten: order.subtotaal_cents,
        leverkostenCenten: order.leverkosten_cents,
        totaalCenten: order.totaal_cents,
        leverwijze: order.leverwijze,
        moment: moment ? naarMoment(moment) : null,
        naam: order.contact_naam,
        emailGemaskeerd: maskeerEmail(order.contact_email),
        aangemaakt: order.created_at,
        betaalUrl: kanBetalen ? betaalUrlVoor(ctx, slug, order.token) : null,
        betaalwijze: order.betaalwijze,
        nuTeBetalenCenten: order.nu_te_betalen_cents,
        restInWinkelCenten: order.rest_cents,
        restBetaald: order.rest_betaald_at != null,
    };
    return { status: 200, body: { ok: true, status } };
}

/**
 * Vraagt myPOS of de lopende poging betaald is. Alleen een antwoord waarin
 * de laatste gebeurtenis een betaling is (IPCPurchaseNotify), met een
 * transactiereferentie én het juiste bedrag, telt als betaald.
 */
async function controleerBijMypos(ctx: KassaContext, tenant: Tenant, order: OrderRij): Promise<OrderRij | null> {
    if (!ctx.mypos || !order.mypos_order_id) return null;
    try {
        const s = await getTxnStatus(ctx.mypos, order.mypos_order_id);
        if (!s.betaald || !s.trnref || s.amountCenten !== order.nu_te_betalen_cents) return null;
        return verwerkBetaling(ctx, tenant, order, { trnref: s.trnref, centen: s.amountCenten, methode: 'statuscontrole', referentie: `txn:${s.trnref}`, methodeNaam: 'IPCGetTxnStatus', payload: s.ruw });
    } catch (e) {
        console.error('[winkel] statuscontrole bij myPOS faalde:', e instanceof Error ? e.message : e);
        return null;
    }
}

/* ── Betaling verwerken (webhook én statuscontrole) ────────────────────────── */

interface Betaling {
    trnref: string;
    centen: number | null;
    methode: string | null;
    referentie: string;
    methodeNaam: string;
    payload: unknown;
}

/**
 * Eén plek voor "deze order is betaald": idempotent via de berichtregistratie
 * én via de databasefunctie. Mail pas ná een bevestigde betaling; een
 * mailstoring maakt een betaalde order niet onbetaald.
 */
async function verwerkBetaling(ctx: KassaContext, tenant: Tenant, order: OrderRij, b: Betaling): Promise<OrderRij | null> {
    const nieuw = await ctx.store.registreerBetaalbericht(tenant.orgId, b.referentie, b.methodeNaam, b.payload, order.id);
    if (!nieuw) return null;

    const uitkomst = await ctx.store.bevestigBetaling(order.id, { trnref: b.trnref, centen: b.centen, methode: b.methode });
    await ctx.store.noteerBetaalberichtUitkomst(tenant.orgId, b.referentie, uitkomst);

    if (uitkomst === 'betaald') {
        const bijgewerkt = (await ctx.store.vindOrderOpToken(tenant.orgId, order.token)) ?? { ...order, status: 'betaald' as const };
        const regels = await ctx.store.laadRegels(order.id);
        const moment = bijgewerkt.moment_id ? await ctx.store.laadMoment(bijgewerkt.moment_id) : null;
        try {
            const m = await ctx.mail({ tenant, order: bijgewerkt, regels, moment });
            await ctx.store.noteerMail(order.id, m.success ? 'verstuurd' : 'mislukt', m.success ? null : m.error ?? 'onbekend');
        } catch (e) {
            await ctx.store.noteerMail(order.id, 'mislukt', e instanceof Error ? e.message : 'onbekend');
        }
        /* Dan het vakje (plan §4). Gooit nooit; een fout staat in de order
           met de knop "Plaats opnieuw" in het scherm. */
        await plaatsBestelling(ctx.store, tenant, bijgewerkt, ctx.nu?.());
        return bijgewerkt;
    }

    if (uitkomst === 'vol') {
        /* Betaald ná het verlopen van de reservering, en de plek is inmiddels
           vergeven: terugbetalen. Lukt dat niet, dan staat het klaar voor
           Mathijs (refund_status 'mislukt' + de fout). */
        await terugbetalen(ctx, order, b);
        return ctx.store.vindOrderOpToken(tenant.orgId, order.token);
    }
    return null;
}

async function terugbetalen(ctx: KassaContext, order: OrderRij, b: Betaling): Promise<void> {
    if (!ctx.mypos || !order.mypos_order_id || b.centen == null) {
        await ctx.store.noteerRefund(order.id, 'mislukt', 'geen myPOS-configuratie of bedrag');
        return;
    }
    try {
        const r = await refund(ctx.mypos, { orderId: order.mypos_order_id, trnref: b.trnref, centen: b.centen });
        await ctx.store.noteerRefund(order.id, r.ok ? 'gelukt' : 'mislukt', r.ok ? null : `${r.status}: ${r.statusMsg ?? 'onbekend'}`);
    } catch (e) {
        await ctx.store.noteerRefund(order.id, 'mislukt', e instanceof Error ? e.message : 'onbekend');
    }
}

/* ── 6. Webhook ────────────────────────────────────────────────────────────── */

export async function verwerkBetaalbericht(ctx: KassaContext, slug: string, body: string): Promise<{ status: number; tekst: string }> {
    const tenant = await ctx.store.laadTenant(slug);
    if (!tenant) return { status: 404, tekst: 'ONBEKENDE WINKEL' };
    if (!ctx.mypos) return { status: 503, tekst: 'GEEN CONFIGURATIE' };

    const bericht = leesBetaalbericht(body, ctx.mypos.myposCert);
    if (!bericht) return { status: 400, tekst: 'INVALID SIGNATURE' };

    const referentie = bericht.trnref ? `trn:${bericht.trnref}` : `hash:${createHash('sha256').update(body).digest('hex')}`;
    /* OrderID richting myPOS is "<nummer>-<poging>-<token>"; een bericht voor een
       eerdere poging hoort nog steeds bij dezelfde order. */
    const order = await ctx.store.vindOrderOpNummer(tenant.orgId, nummerUitOrderId(bericht.orderId));

    /* Een teruggedraaide betaling (myPOS stuurt IPCPurchaseRollback als de
       betaling na een storing ongedaan is gemaakt): een wachtende order gaat
       op 'mislukt' en kan opnieuw betaald worden. Een al betaalde order
       draaien we niet automatisch terug — dat is iets voor Mathijs. */
    if (bericht.methode === 'IPCPurchaseRollback') {
        const nieuw = await ctx.store.registreerBetaalbericht(tenant.orgId, `rollback:${referentie}`, bericht.methode, bericht.velden, order?.id ?? null);
        if (nieuw && order) {
            if (order.status === 'wacht') await ctx.store.zetStatus(order.id, 'mislukt', 'teruggedraaid-door-mypos');
            await ctx.store.noteerBetaalberichtUitkomst(tenant.orgId, `rollback:${referentie}`, order.status === 'betaald' ? 'rollback-na-betaling' : 'mislukt');
            if (order.status === 'betaald') console.error('[winkel] rollback na betaling:', order.nummer);
        }
        return { status: 200, tekst: 'OK' };
    }

    /* Alleen betaalberichten. Andere methodes bevestigen we wel (anders blijft
       myPOS ze sturen) maar doen we niets mee. */
    if (bericht.methode !== 'IPCPurchaseNotify') {
        console.warn('[winkel] onbekend myPOS-bericht:', bericht.methode);
        return { status: 200, tekst: 'OK' };
    }

    if (!order) {
        await ctx.store.registreerBetaalbericht(tenant.orgId, referentie, bericht.methode, bericht.velden, null);
        await ctx.store.noteerBetaalberichtUitkomst(tenant.orgId, referentie, 'order-onbekend');
        console.error('[winkel] betaalbericht voor onbekende order:', bericht.orderId);
        return { status: 200, tekst: 'OK' };
    }

    if (bericht.currency !== 'EUR' || bericht.amountCenten !== order.nu_te_betalen_cents) {
        const nieuw = await ctx.store.registreerBetaalbericht(tenant.orgId, referentie, bericht.methode, bericht.velden, order.id);
        if (nieuw) await ctx.store.noteerBetaalberichtUitkomst(tenant.orgId, referentie, `bedrag-wijkt-af:${bericht.amountCenten}`);
        console.error('[winkel] betaalbericht met afwijkend bedrag:', order.nummer, bericht.amountCenten, 'verwacht', order.nu_te_betalen_cents);
        return { status: 200, tekst: 'OK' };
    }

    await verwerkBetaling(ctx, tenant, order, {
        trnref: bericht.trnref,
        centen: bericht.amountCenten,
        methode: bericht.paymentMethod,
        referentie,
        methodeNaam: bericht.methode,
        payload: bericht.velden,
    });
    return { status: 200, tekst: 'OK' };
}

/* ── De betaalpagina (brug naar myPOS) ─────────────────────────────────────── */

export type BetaalUitkomst =
    | { soort: 'html'; html: string }
    | { soort: 'redirect'; url: string }
    | { soort: 'fout'; status: number; tekst: string };

export async function betaalPagina(ctx: KassaContext, slug: string, token: string): Promise<BetaalUitkomst> {
    const t = await tenantEnBronnen(ctx, slug);
    if (!t || !/^[a-f0-9]{64}$/.test(token)) return { soort: 'fout', status: 404, tekst: 'Onbekende bestelling.' };
    const order = await ctx.store.vindOrderOpToken(t.tenant.orgId, token);
    if (!order) return { soort: 'fout', status: 404, tekst: 'Onbekende bestelling.' };
    const terug = terugUrlVoor(t.bronnen.instellingen.site_url, order.terug_url, token);
    if (!terug) return { soort: 'fout', status: 500, tekst: 'De terug-URL van de website is niet ingesteld.' };
    if (order.status === 'betaald') return { soort: 'redirect', url: terug };
    if (!ctx.mypos) return { soort: 'fout', status: 503, tekst: NIET_BESCHIKBAAR };

    const poging = await ctx.store.startBetaalpoging(order.id);
    if (poging.ok === false) {
        const code = poging.code;
        if (code === 'WK007') return { soort: 'redirect', url: terug };
        /* De plek is inmiddels vergeven: deze order is klaar, de klant bestelt opnieuw. */
        await ctx.store.zetStatus(order.id, 'verlopen', 'plek-vergeven');
        return { soort: 'redirect', url: terug };
    }
    const o = poging.waarde;
    const regels = await ctx.store.laadRegels(o.id);
    const basis = (ctx.webhookUrl ?? ctx.appUrl).replace(/\/$/, '');
    const metQuery = (url: string, extra: Record<string, string> = {}) => {
        const q = new URLSearchParams({ ...extra, ...(ctx.webhookQuery ?? {}) }).toString();
        return q ? `${url}?${q}` : url;
    };
    /* Bij een reservering int myPOS alleen het reserveringsbedrag, als één
       regel; de rest wordt in de winkel betaald (S5). */
    const reservering = o.betaalwijze === 'reservering';
    const velden = purchaseVelden(ctx.mypos, {
        orderId: o.mypos_order_id!,
        totaalCenten: o.nu_te_betalen_cents,
        regels: reservering
            ? [{ naam: `Reservering bestelling ${o.nummer} — rest ${euroTekst(o.rest_cents)} in de winkel`, aantal: 1, stukCenten: o.nu_te_betalen_cents }]
            : regels.map((r) => ({ naam: `${r.naam} — ${r.aantal} ${meervoud(r.eenheid, r.aantal)}`, aantal: 1, stukCenten: r.bedrag_cents })),
        leverkostenCenten: reservering ? 0 : o.leverkosten_cents,
        urlOk: metQuery(`${basis}/api/public-winkel/${slug}/betaal/${token}/terug`, { uitkomst: 'ok' }),
        urlCancel: metQuery(`${basis}/api/public-winkel/${slug}/betaal/${token}/terug`, { uitkomst: 'afgebroken' }),
        urlNotify: metQuery(`${basis}/api/public-winkel/${slug}/mypos-webhook`),
        /* Geen klantgegevens naar myPOS: bij afhalen is er geen adres, en de
           klant hoeft op de betaalpagina alleen te betalen. */
        note: `${t.tenant.bedrijfsnaam} bestelling ${o.nummer}`,
    });
    return { soort: 'html', html: betaalFormulierHtml(ctx.mypos, velden, `${t.tenant.bedrijfsnaam} — naar de betaalpagina`) };
}

/**
 * De klant komt terug van myPOS. Een bezoek is géén bewijs van betaling; wat
 * we hier wél doen: bij 'afgebroken' de order op afgebroken zetten (als hij
 * nog wacht), en bij 'ok' meteen één keer bij myPOS kijken zodat de
 * statuspagina niet op het betaalbericht hoeft te wachten. Daarna door naar
 * de website.
 */
export async function terugVanMypos(ctx: KassaContext, slug: string, token: string, uitkomst: string | null): Promise<BetaalUitkomst> {
    const t = await tenantEnBronnen(ctx, slug);
    if (!t || !/^[a-f0-9]{64}$/.test(token)) return { soort: 'fout', status: 404, tekst: 'Onbekende bestelling.' };
    const order = await ctx.store.vindOrderOpToken(t.tenant.orgId, token);
    if (!order) return { soort: 'fout', status: 404, tekst: 'Onbekende bestelling.' };
    const terug = terugUrlVoor(t.bronnen.instellingen.site_url, order.terug_url, token) ?? t.bronnen.instellingen.site_url ?? ctx.appUrl;

    if (order.status === 'wacht') {
        if (uitkomst === 'afgebroken') {
            await ctx.store.zetStatus(order.id, 'afgebroken', 'klant-brak-af');
        } else if (uitkomst === 'ok' && order.betaalpoging > 0 && ctx.mypos) {
            controleerNa.set(order.token, ctx.nu?.().getTime() ?? Date.now());
            await controleerBijMypos(ctx, t.tenant, order);
        }
    }
    return { soort: 'redirect', url: terug };
}

/** Voor tests: de throttle van de statuscontrole leegmaken. */
export function _resetControleKlok(): void {
    controleerNa.clear();
}

export type { Offerte };
