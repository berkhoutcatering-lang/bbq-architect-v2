/**
 * Kerst-Box-bestellingen zonder online betalen (oktober 2026).
 *
 * Zolang myPOS de site niet heeft goedgekeurd, bestelt de klant de Kerst-Box
 * via het aanvraagformulier op hopbites.nl en betaalt hij bij het afhalen.
 * De site stuurt dat als lead naar /api/public-lead-form; hier wordt er een
 * gewone winkel-order van gemaakt, met betaalwijze 'bij_afhalen':
 *
 *   lead ─► leesKerstLead ─► kerstMand ─► berekenOfferte ─► plaatsOrder
 *        ─► bevestigBetaling (0 online) ─► mail ─► plaatsBestelling (vakje)
 *
 * Zo telt hij mee in de vakjes, de productie- en inpaklijsten, de voorraad en
 * de balie, net als een betaalde webshoporder. Geen tweede bestelmodel.
 *
 * Wat de site meestuurt staat in `bestelling` (gestructureerd, sinds 5 oktober
 * 2026). Een oudere site stuurt alleen de bon in `bericht`; die wordt dan
 * gelezen. Wat hier zuiver is (lezen, mand, totaal) is apart getest.
 */
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { berekenOfferte, vandaagISO, type Artikel, type MomentRij } from './rekenen';
import { plaatsBestelling } from './plaatsing';
import type { OrderRegelRij, OrderRij, Tenant, WinkelStore } from './store';
import type { Mand, MandRegel } from './types';
import { KERST_SLUG } from './kerstTellen';

/* ── Vaste namen ───────────────────────────────────────────────────────────── */

export const KERST_GROEP = 'kerst-box';

export const KERST_SLUGS = KERST_SLUG;

export type KerstProeverij = 'bier' | 'wijn';

/** De proeverij-artikelen zoals de code ze aanmaakt als ze ontbreken (prijs volgt, uit). */
export const PROEVERIJ_ARTIKEL: Record<KerstProeverij, Omit<Artikel, 'id'>> = {
    bier: {
        slug: KERST_SLUGS.bier, naam: 'Bierproeverij', eenheid: 'per persoon', telt: 'stuks',
        prijs_cents: null, btw_pct: 21, minimum: 1, maximum: null, verzendbaar: false, gekoeld: false,
        moment_soort: 'dag', moment_groep: KERST_GROEP, afhaalmoment_tekst: null, capaciteit_soort: 'regel',
        doos_klein_max: null, doos_groot: null, voorraad: null, actief: false, publiek: false, alcohol: true,
    },
    wijn: {
        slug: KERST_SLUGS.wijn, naam: 'Wijnproeverij', eenheid: 'per 2 personen', telt: 'stuks',
        prijs_cents: null, btw_pct: 21, minimum: 1, maximum: null, verzendbaar: false, gekoeld: false,
        moment_soort: 'dag', moment_groep: KERST_GROEP, afhaalmoment_tekst: null, capaciteit_soort: 'regel',
        doos_klein_max: null, doos_groot: null, voorraad: null, actief: false, publiek: false, alcohol: true,
    },
};

/** De afhaaldagen die de site aanbiedt; een ontbrekende dag maakt de code zelf aan. */
export const KERST_DAGEN = ['2026-12-23', '2026-12-24', '2026-12-25', '2026-12-26'] as const;

/* ── Wat er binnenkomt ─────────────────────────────────────────────────────── */

export interface KerstAanvraag {
    personen: number;
    vegetarisch: number;
    /** "Weet ik nog niet precies" — telt mee, krijgt een navraagmail. */
    onzeker: boolean;
    /** ISO-datum van de afhaaldag. */
    afhaaldag: string;
    bier: number;
    wijn: number;
    /** De opmerking van de klant, zonder de regels die hierboven al staan. */
    opmerking: string;
}

/** Wat de site sinds 5 oktober 2026 naast de bon meestuurt. */
export const KerstBestellingSchema = z.object({
    artikel: z.literal('kerst-box'),
    personen: z.coerce.number().int().min(1).max(1000),
    vegetarisch: z.coerce.number().int().min(0).max(1000).optional().default(0),
    onzeker: z.boolean().optional().default(false),
    afhaaldag: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    bierproeverij: z.coerce.number().int().min(0).max(1000).optional().default(0),
    wijnproeverij: z.coerce.number().int().min(0).max(1000).optional().default(0),
    opmerking: z.string().max(2000).optional().default(''),
});
export type KerstBestelling = z.infer<typeof KerstBestellingSchema>;

export interface LeadInvoer {
    event_type?: string | null;
    event_datum?: string | null;
    gasten?: number | null;
    bericht?: string | null;
    bestelling?: unknown;
}

/** Is dit een Kerst-Box-bestelling? Op het event_type van de site, of op het gestructureerde veld. */
export function isKerstLead(l: LeadInvoer): boolean {
    if (l.bestelling && typeof l.bestelling === 'object' && (l.bestelling as { artikel?: unknown }).artikel === 'kerst-box') return true;
    return /^\s*kerst-?box\b/i.test(l.event_type ?? '');
}

/** "Opmerking van de klant:" tot de afsluitende regel van de bon. */
function opmerkingUitBon(bericht: string): string {
    const m = /Opmerking van de klant:\s*\n([\s\S]*?)(?:\n\s*\n\s*Besteld via[^\n]*|\n\s*Besteld via[^\n]*)?\s*$/i.exec(bericht);
    return m ? m[1]!.trim() : '';
}

function zonderVegaRegel(tekst: string): string {
    return tekst.split('\n').filter((r) => !/^\s*waarvan vegetarisch\s*:/i.test(r)).join('\n').trim();
}

/**
 * Lees een Kerst-lead. null = geen Kerst-Box, of te weinig om een bestelling
 * van te maken (dan blijft het een lead en kijkt Mathijs ernaar).
 */
export function leesKerstLead(l: LeadInvoer): KerstAanvraag | null {
    if (!isKerstLead(l)) return null;

    const gestructureerd = KerstBestellingSchema.safeParse(l.bestelling);
    if (gestructureerd.success) {
        const b = gestructureerd.data;
        return {
            personen: b.personen,
            vegetarisch: Math.min(b.vegetarisch, b.personen),
            onzeker: b.onzeker,
            afhaaldag: b.afhaaldag,
            bier: b.bierproeverij,
            wijn: b.wijnproeverij,
            opmerking: zonderVegaRegel(b.opmerking),
        };
    }

    /* De bon van een oudere site. */
    const bericht = l.bericht ?? '';
    const personen = Number(l.gasten ?? /Personen\.*\s+(\d+)/i.exec(bericht)?.[1] ?? 0);
    const afhaaldag = (l.event_datum ?? /Afhalen op\.*\s+(\d{4}-\d{2}-\d{2})/i.exec(bericht)?.[1] ?? '').slice(0, 10);
    if (!Number.isInteger(personen) || personen < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(afhaaldag)) return null;
    const vega = Number(/waarvan vegetarisch\s*:\s*(\d+)/i.exec(bericht)?.[1] ?? 0);
    const bier = Number(/bierproeverij(?:en)?\.*:?\s+(\d+)/i.exec(bericht)?.[1] ?? 0);
    const wijn = Number(/wijnproeverij(?:en)?\.*:?\s+(\d+)/i.exec(bericht)?.[1] ?? 0);
    return {
        personen,
        vegetarisch: Math.min(vega, personen),
        onzeker: /weet het nog niet precies/i.test(bericht),
        afhaaldag,
        bier,
        wijn,
        opmerking: zonderVegaRegel(opmerkingUitBon(bericht)),
    };
}

/* ── Rekenen ───────────────────────────────────────────────────────────────── */

/**
 * De mand voor deze aanvraag. Vegetarisch is een eigen artikel als dat er is
 * (dan telt de keuken hem als dieet); anders staat alles op de gewone box en
 * zegt de opmerking het (plaatsing leest "Waarvan vegetarisch: n").
 */
export function kerstMand(a: KerstAanvraag, momentId: string, artikelen: Pick<Artikel, 'slug' | 'actief'>[]): Mand {
    const heeft = (slug: string) => artikelen.some((x) => x.slug === slug && x.actief);
    const regels: MandRegel[] = [];
    const vegaApart = a.vegetarisch > 0 && heeft(KERST_SLUGS.vega);
    const gewoon = vegaApart ? a.personen - a.vegetarisch : a.personen;
    if (gewoon > 0) regels.push({ slug: KERST_SLUGS.box, aantal: gewoon, moment: momentId });
    if (vegaApart) regels.push({ slug: KERST_SLUGS.vega, aantal: a.vegetarisch, moment: momentId });
    if (a.bier > 0) regels.push({ slug: KERST_SLUGS.bier, aantal: a.bier, moment: momentId });
    if (a.wijn > 0) regels.push({ slug: KERST_SLUGS.wijn, aantal: a.wijn, moment: momentId });
    return { versie: 1, regels };
}

/**
 * Het minimum (vanaf 2 personen) geldt voor de bestelling als geheel, niet per
 * variant: 3 personen waarvan 2 vegetarisch is één gewone en twee vega. Daarom
 * rekent de offerte met minimum 1 op de box-varianten, en controleert dit de
 * som zelf.
 */
export function kerstArtikelen(artikelen: Artikel[]): Artikel[] {
    return artikelen.map((x) => (x.slug === KERST_SLUGS.box || x.slug === KERST_SLUGS.vega ? { ...x, minimum: 1 } : x));
}

/** Het totaal in centen, ook als de order (nog) niet geplaatst kon worden — voor de mail. */
export function kerstTotaalCenten(a: KerstAanvraag, artikelen: Pick<Artikel, 'slug' | 'prijs_cents'>[]): number {
    const prijs = (slug: string, terugval: number | null) => artikelen.find((x) => x.slug === slug)?.prijs_cents ?? terugval;
    const box = prijs(KERST_SLUGS.box, 2350) ?? 2350;
    const vega = prijs(KERST_SLUGS.vega, box) ?? box;
    const bier = prijs(KERST_SLUGS.bier, null) ?? 0;
    const wijn = prijs(KERST_SLUGS.wijn, null) ?? 0;
    return (a.personen - a.vegetarisch) * box + a.vegetarisch * vega + a.bier * bier + a.wijn * wijn;
}

/** De opmerking op de order: de vega-regel bovenaan, dan wat de klant schreef. */
export function kerstOpmerking(a: KerstAanvraag): string {
    const delen: string[] = [];
    if (a.vegetarisch > 0) delen.push(`Waarvan vegetarisch: ${a.vegetarisch}`);
    if (a.onzeker) delen.push('Aantal nog niet zeker (klant weet het nog niet precies).');
    if (a.opmerking.trim()) delen.push(a.opmerking.trim());
    return delen.join('\n');
}

/* ── Plaatsen ──────────────────────────────────────────────────────────────── */

export interface KerstMail {
    (args: { tenant: Tenant; order: OrderRij; regels: OrderRegelRij[]; aanvraag: KerstAanvraag }): Promise<{ success: boolean; error?: string }>;
}

export interface KerstContext {
    store: WinkelStore;
    mail: KerstMail;
    /** Na het plaatsen: de voorraadmeldingen bijwerken. Gooit nooit. */
    naPlaatsen?: (orgId: string) => Promise<unknown>;
    nu?: () => Date;
}

/** De lead zoals hij net is opgeslagen: waar de order bij hoort en wie het is. */
export interface KerstLeadContact {
    id: number;
    naam: string;
    email: string;
    telefoon: string | null;
}

export type KerstUitkomst =
    | { ok: true; order: OrderRij; nieuw: boolean }
    | { ok: false; reden: string };

const REDEN: Record<string, string> = {
    WK001: 'De afhaaldag is vol. Zet de capaciteit van die dag hoger (Webshop → Momenten) en zet hem daarna opnieuw om.',
    WK002: 'Een artikel is uitverkocht.',
    WK003: 'De afhaaldag is niet (meer) beschikbaar.',
    WK004: 'Een artikel staat uit (Webshop → Artikelen).',
    WK005: 'De webshop heeft nog geen instellingen.',
    WK008: 'De afhaaldag is vol.',
    WK009: 'Een onderdeel is op.',
};

/** Het moment van die dag in de Kerst-groep; bestaat de dag nog helemaal niet, dan wordt hij aangemaakt zonder grens. */
async function dagMoment(store: WinkelStore, orgId: string, momenten: MomentRij[], dag: string): Promise<MomentRij | { fout: string }> {
    const bestaand = momenten.find((m) => m.groep === KERST_GROEP && m.datum === dag);
    if (bestaand) return bestaand;
    if (!(KERST_DAGEN as readonly string[]).includes(dag)) return { fout: `Op ${dag} is er geen afhaaldag voor de Kerst-Box.` };
    const nieuw = await store.maakMoment({ orgId, groep: KERST_GROEP, datum: dag });
    return nieuw ?? { fout: `De afhaaldag ${dag} kon niet worden aangemaakt.` };
}

/**
 * Maak van een Kerst-aanvraag een order. Idempotent op de lead: dezelfde lead
 * nog eens geeft dezelfde order terug (sleutel `lead-<id>`), zonder tweede mail.
 * Gooit nooit; een fout komt terug als reden, zodat de route hem bij de lead
 * kan zetten.
 */
export async function plaatsKerstBestelling(ctx: KerstContext, tenant: Tenant, lead: KerstLeadContact, a: KerstAanvraag): Promise<KerstUitkomst> {
    const leadId = lead.id;
    try {
        const nu = ctx.nu?.() ?? new Date();
        const sleutel = `lead-${leadId}`;
        const bestaand = await ctx.store.vindOrderOpSleutel(tenant.orgId, sleutel);
        if (bestaand && bestaand.status === 'betaald') return { ok: true, order: bestaand, nieuw: false };

        const bronnen = await ctx.store.laadBronnen(tenant.orgId);
        if (!bronnen) return { ok: false, reden: REDEN.WK005! };
        const box = bronnen.artikelen.find((x) => x.slug === KERST_SLUGS.box);
        if (!box) return { ok: false, reden: 'Het artikel kerst-box bestaat niet in de webshop.' };
        if (a.personen < box.minimum) return { ok: false, reden: `De Kerst-Box gaat vanaf ${box.minimum} personen; besteld: ${a.personen}.` };
        if (a.vegetarisch > a.personen) return { ok: false, reden: 'Meer vegetarisch dan personen.' };

        const moment = await dagMoment(ctx.store, tenant.orgId, bronnen.momenten, a.afhaaldag);
        if ('fout' in moment) return { ok: false, reden: moment.fout };
        const momenten = bronnen.momenten.some((m) => m.id === moment.id) ? bronnen.momenten : [...bronnen.momenten, moment];

        const mand = kerstMand(a, moment.id, bronnen.artikelen);
        const uit = berekenOfferte(
            { ...bronnen, artikelen: kerstArtikelen(bronnen.artikelen), momenten, nu },
            mand, 'afhalen', null, 'bij_afhalen',
        );
        if (uit.ok === false) {
            const tekst = uit.soort === 'validatie' ? uit.fouten.join(' ') : uit.melding;
            return { ok: false, reden: tekst };
        }
        const { offerte, regels, btwCenten, momentId } = uit.intern;

        let order: OrderRij;
        if (bestaand) {
            order = bestaand;
        } else {
            const geplaatst = await ctx.store.plaatsOrder({
                orgId: tenant.orgId,
                sleutel,
                token: randomBytes(32).toString('hex'),
                leverwijze: 'afhalen',
                momentId,
                contact: { naam: lead.naam, email: lead.email, telefoon: lead.telefoon ?? '' },
                adres: null,
                opmerking: kerstOpmerking(a),
                subtotaalCenten: offerte.subtotaalCenten,
                leverkostenCenten: offerte.leverkostenCenten,
                totaalCenten: offerte.totaalCenten,
                btwCenten,
                terugUrl: '',
                regels,
                betaalwijze: 'bij_afhalen',
                nuTeBetalenCenten: 0,
                restCenten: offerte.totaalCenten,
            });
            if (geplaatst.ok === false) return { ok: false, reden: REDEN[geplaatst.code] ?? `Opslaan mislukt (${geplaatst.detail ?? geplaatst.code}).` };
            order = geplaatst.waarde;
        }

        /* Niets online te betalen: meteen 'betaald' (het online deel is nul),
           de rest boekt de balie. Zelfde stap als na myPOS. */
        const b = await ctx.store.bevestigBetaling(order.id, { trnref: null, centen: 0, methode: 'bij_afhalen' });
        if (b !== 'betaald' && b !== 'al_betaald') return { ok: false, reden: b === 'vol' ? REDEN.WK001! : 'Bevestigen mislukt.' };
        await ctx.store.markeerKerstOrder(order.id, { leadId, onzeker: a.onzeker });

        const bijgewerkt = (await ctx.store.vindOrderOpToken(tenant.orgId, order.token)) ?? { ...order, status: 'betaald' as const };
        const orderRegels = await ctx.store.laadRegels(order.id);
        try {
            const m = await ctx.mail({ tenant, order: bijgewerkt, regels: orderRegels, aanvraag: a });
            await ctx.store.noteerMail(order.id, m.success ? 'verstuurd' : 'mislukt', m.success ? null : m.error ?? 'onbekend');
        } catch (e) {
            await ctx.store.noteerMail(order.id, 'mislukt', e instanceof Error ? e.message : 'onbekend');
        }
        await plaatsBestelling(ctx.store, tenant, bijgewerkt, nu);
        if (ctx.naPlaatsen) await ctx.naPlaatsen(tenant.orgId).catch(() => undefined);
        return { ok: true, order: bijgewerkt, nieuw: true };
    } catch (e) {
        console.error('[kerst] plaatsen mislukt:', e instanceof Error ? e.message : e);
        return { ok: false, reden: e instanceof Error ? e.message : 'onbekende fout' };
    }
}

/* ── Na de bestelling ──────────────────────────────────────────────────────── */

/** Hoeveel dagen vóór de afhaaldag de navraag gaat bij "weet ik nog niet precies". */
export const NAVRAAG_DAGEN_VOOR = 5;

function dagenTussen(van: string, tot: string): number {
    const [a, b] = [van, tot].map((d) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))));
    return Math.round((b! - a!) / 86_400_000);
}

/** Welke mails vandaag gaan voor deze order: de navraag en/of de herinnering. Zuiver; de cron doet de rest. */
export function kerstMailsVoorVandaag(
    o: { status: string; afhaaldag: string; aantal_onzeker: boolean; navraag_verstuurd_at: string | null; herinnering_verstuurd_at: string | null; opgehaald: boolean },
    nu: Date,
): { navraag: boolean; herinnering: boolean } {
    if (o.status !== 'betaald' || o.opgehaald) return { navraag: false, herinnering: false };
    const tot = dagenTussen(vandaagISO(nu), o.afhaaldag);
    return {
        /* Op of na de vijfde dag ervoor, maar niet meer op de dag zelf of de dag
           ervoor — dan komt de herinnering al. Gemist (cron viel uit)? Dan de
           volgende dag alsnog. */
        navraag: o.aantal_onzeker && !o.navraag_verstuurd_at && tot <= NAVRAAG_DAGEN_VOOR && tot >= 2,
        herinnering: !o.herinnering_verstuurd_at && tot === 1,
    };
}
