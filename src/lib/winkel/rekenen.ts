/**
 * De rekenlaag van de kassa — zuiver, zonder database en zonder Next.
 *
 * Hier wordt een mand van de website (slugs, aantallen, momenten) omgezet in
 * een offerte in hele centen: prijs per regel, btw per tarief, verzendkosten,
 * het gekozen moment, en per regel hoeveel capaciteit en voorraad hij inneemt.
 * De database-functies tellen daarna onder vergrendeling of het past; wat ze
 * moeten tellen (eenheden, dozen) wordt hier bepaald, op één plek.
 *
 * Bedragen als kommagetallen optellen levert 0,1 + 0,2 op, en dat is geen
 * € 0,30. Alles hier is een geheel getal.
 */
import type { Betaalwijze, Leverwijze, Mand, Moment, Offerte, Offerteregel, OfferteUitkomst } from './types';

/* ── Wat de kassa uit de database kent ─────────────────────────────────────── */

export interface Artikel {
    id: string;
    slug: string;
    naam: string;
    eenheid: string;
    telt: 'stuks' | 'personen';
    /** null = prijs volgt: niet te bestellen. */
    prijs_cents: number | null;
    btw_pct: number;
    minimum: number;
    maximum: number | null;
    verzendbaar: boolean;
    gekoeld: boolean;
    moment_soort: 'geen' | 'moment' | 'dag';
    moment_groep: string | null;
    afhaalmoment_tekst: string | null;
    capaciteit_soort: 'regel' | 'aantal' | 'dozen';
    doos_klein_max: number | null;
    doos_groot: number | null;
    /** null = onbeperkt. */
    voorraad: number | null;
    /** Geteld door de opslag: betaald + lopende reserveringen (alleen bij een voorraadgetal). */
    voorraad_bezet?: number;
    actief: boolean;
    publiek: boolean;
    /* Koppeling voor de vakjes (plan §2.1). De kassa rekent er niet mee; de
       plaatsing wel. Hooguit één van gerecht_id / inventory_id is gevuld. */
    gerecht_id?: string | null;
    inventory_id?: number | null;
    inkoop_per_stuk?: number | null;
    dieet?: 'vegetarisch' | 'veganistisch' | null;
    /* Sinterklaas (plan §1.3). Allemaal optioneel: een artikel zonder deze
       velden is een gewoon artikel zonder template. */
    segment?: 'bier' | 'wijn' | 'combi' | null;
    vast?: boolean;
    /** 18+: markering op order, mail en etiket. */
    alcohol?: boolean;
    /** Personen worden over schalen verdeeld (klein 2–3, groot 4–5, nooit 1). */
    schaal_verdeling?: boolean;
    /** Overschrijving van de naar-rato-btw-splitsing, procenten per tarief. */
    btw_verdeling?: Record<string, number> | null;
    verpakking_klein_cents?: number | null;
    verpakking_groot_cents?: number | null;
}

/** Wat er in een pakket of op een plank ligt (plan §1.1). */
export interface Product {
    id: string;
    naam: string;
    type: string;
    eenheid: 'stuk' | 'gram';
    /** Prijzen gelden per zoveel eenheden (amandelen: per 100 gram). */
    prijs_per: number;
    winkelprijs_incl_cents: number | null;
    inkoop_excl_cents: number | null;
    btw_pct: number;
    alcohol: boolean;
    /** null = niet bijgehouden: blokkeert nooit. */
    voorraad: number | null;
    /** Geteld door de opslag: betaald + lopende reserveringen, in `eenheid`. */
    voorraad_bezet?: number;
    actief: boolean;
}

/** Eén slot van het template van een artikel (plan §1.2). */
export interface Slot {
    id: string;
    artikel_id: string;
    volgorde: number;
    slot_type: string;
    naam: string;
    hoeveelheid: number;
    eenheid: 'stuk' | 'gram';
    /** 'stuk' = per besteld pakket, 'persoon' = per persoon (de plank). */
    per: 'stuk' | 'persoon';
    standaard_product_id: string | null;
    wisselbaar: boolean;
    alternatieven: string[];
}

/** De inhoud van één regel: slot × aantal, vastgelegd bij het plaatsen. */
export interface Component {
    product_id: string | null;
    slot_type: string;
    naam: string;
    hoeveelheid: number;
    eenheid: 'stuk' | 'gram';
}

export interface MomentRij {
    id: string;
    groep: string;
    datum: string;
    van: string | null;
    tot: string | null;
    /** null = onbeperkt: geen grens op dit moment. */
    capaciteit: number | null;
    bestellen_tot: string | null;
    /** Besteldeadline met tijd (ISO). Naast bestellen_tot, dat alleen een dag is. */
    sluit_op?: string | null;
    actief: boolean;
    /** Geteld door de opslag: betaald + lopende reserveringen. */
    bezet: number;
}

export interface Instellingen {
    verzendkosten_cents: number | null;
    gratis_verzenden_vanaf_cents: number | null;
    verzendkosten_btw_pct: number;
    reservering_minuten: number;
    offerte_geldig_minuten: number;
    kassa_open: boolean;
    /** Het reserveringsbedrag per order bij betaalwijze 'reservering'. null = reservering uit. */
    reservering_bedrag_cents?: number | null;
}

/** Een offerteregel plus wat de opslag ervan moet weten. */
export interface Regelintern extends Offerteregel {
    artikel_id: string;
    btw_pct: number;
    moment_id: string | null;
    eenheden: number;
    voorraad_eenheden: number;
    /** Btw van deze regel per tarief, telt op tot het btw-deel van bedragCenten. */
    btw_cents: Record<string, number>;
    /** De inhoud (slots × aantal); leeg voor artikelen zonder template. */
    componenten: Component[];
    alcohol: boolean;
}

export interface OfferteIntern {
    offerte: Offerte;
    regels: Regelintern[];
    /** Btw-bedrag per tarief, in centen: { "9": 1234, "21": 56 }. */
    btwCenten: Record<string, number>;
    /** Het agenda-moment (of de dag) van de order als geheel, als er één is. */
    momentId: string | null;
}

export type OfferteInternUitkomst =
    | { ok: true; intern: OfferteIntern }
    | Exclude<OfferteUitkomst, { ok: true }>;

/* ── Dozen ─────────────────────────────────────────────────────────────────── */

export interface Doosverdeling {
    klein: number;
    groot: number;
    dozen: number;
}

/**
 * Verdeel een aantal personen over dozen: tot en met `kleinMax` past het in
 * één kleine doos; daarboven zoveel mogelijk grote dozen van `groot`, en de
 * rest in een kleine doos als het in een kleine past, anders nog een grote.
 *
 *   4 personen (klein ≤ 3, groot 5) → één grote
 *   7                                → één grote + één kleine
 *   9                                → twee grote
 */
export function verdeelDozen(personen: number, kleinMax: number, groot: number): Doosverdeling {
    if (personen <= 0) return { klein: 0, groot: 0, dozen: 0 };
    if (personen <= kleinMax) return { klein: 1, groot: 0, dozen: 1 };
    const grote = Math.floor(personen / groot);
    const rest = personen - grote * groot;
    if (rest === 0) return { klein: 0, groot: grote, dozen: grote };
    if (rest <= kleinMax) return { klein: 1, groot: grote, dozen: grote + 1 };
    return { klein: 0, groot: grote + 1, dozen: grote + 1 };
}

/** Hoeveel capaciteit een regel inneemt op zijn moment of dag. */
export function eenhedenVan(a: Pick<Artikel, 'capaciteit_soort' | 'doos_klein_max' | 'doos_groot'>, aantal: number): number {
    switch (a.capaciteit_soort) {
        case 'regel':
            return 1;
        case 'aantal':
            return aantal;
        case 'dozen':
            return verdeelDozen(aantal, a.doos_klein_max ?? 1, a.doos_groot ?? 1).dozen;
    }
}

/* ── Schalen (de borrelplank) ──────────────────────────────────────────────── */

export interface Schaal {
    maat: 'klein' | 'groot';
    personen: number;
}

/**
 * Verdeel personen over schalen: klein 2–3, groot 4–5, nooit een schaal met
 * één persoon. Zo veel mogelijk grote schalen van 5; de rest 2–3 op een
 * kleine, 4 op een grote; bij rest 1 gaat er één persoon van de laatste
 * grote af (5 + 1 → 4 + 2).
 *
 *   2, 3 → klein · 4, 5 → groot · 6 → groot 4 + klein 2 · 7 → 5 + 2
 *   9 → 5 + 4 · 11 → 5 + 4 + 2 · 12 → 5 + 5 + 2
 *
 * `[BEVESTIGEN]` 6 personen: de opdracht noemt ook 3 + 3; dit is 4 + 2.
 */
export function verdeelSchalen(personen: number, kleinMax = 3, groot = 5): Schaal[] {
    const min = 2;
    if (personen < min) return [];
    if (personen <= kleinMax) return [{ maat: 'klein', personen }];
    if (personen <= groot) return [{ maat: 'groot', personen }];
    const uit: Schaal[] = [];
    let rest = personen;
    while (rest > groot) {
        uit.push({ maat: 'groot', personen: groot });
        rest -= groot;
    }
    if (rest === 0) return uit;
    if (rest >= min) {
        uit.push({ maat: rest <= kleinMax ? 'klein' : 'groot', personen: rest });
        return uit;
    }
    /* rest 1: één persoon van de laatste grote schaal af, samen op een kleine. */
    const laatste = uit[uit.length - 1]!;
    laatste.personen -= 1;
    uit.push({ maat: 'klein', personen: rest + 1 });
    return uit;
}

export function telSchalen(schalen: Schaal[]): { klein: number; groot: number; totaal: number } {
    const klein = schalen.filter((s) => s.maat === 'klein').length;
    return { klein, groot: schalen.length - klein, totaal: schalen.length };
}

/* ── Het template: slots, componenten, verkoopbaarheid ─────────────────────── */

export function slotsVan(artikelId: string, slots: Slot[] | undefined): Slot[] {
    return (slots ?? []).filter((s) => s.artikel_id === artikelId).sort((a, b) => a.volgorde - b.volgorde);
}

/**
 * Een artikel met template is pas verkoopbaar als elk slot een product heeft.
 * Zonder slots is er niets in te vullen: verkoopbaar zoals altijd.
 */
export function verkoopbaar(artikelId: string, slots: Slot[] | undefined): boolean {
    return slotsVan(artikelId, slots).every((s) => s.standaard_product_id != null);
}

/** De inhoud van een regel: elk slot × aantal (per stuk) of × personen (per persoon). */
export function componentenVan(artikelId: string, slots: Slot[] | undefined, aantal: number): Component[] {
    return slotsVan(artikelId, slots).map((s) => ({
        product_id: s.standaard_product_id,
        slot_type: s.slot_type,
        naam: s.naam,
        hoeveelheid: rond(s.hoeveelheid * (s.per === 'persoon' ? aantal : aantal)),
        eenheid: s.eenheid,
    }));
}

function rond(n: number): number {
    return Math.round(n * 1000) / 1000;
}

/** Winkelwaarde van een hoeveelheid van een product, incl. btw, in centen. */
export function winkelwaardeCenten(p: Pick<Product, 'winkelprijs_incl_cents' | 'prijs_per'>, hoeveelheid: number): number | null {
    if (p.winkelprijs_incl_cents == null) return null;
    return Math.round((p.winkelprijs_incl_cents * hoeveelheid) / p.prijs_per);
}

/** Inkoopwaarde excl. btw, in centen. */
export function inkoopwaardeCenten(p: Pick<Product, 'inkoop_excl_cents' | 'prijs_per'>, hoeveelheid: number): number | null {
    if (p.inkoop_excl_cents == null) return null;
    return Math.round((p.inkoop_excl_cents * hoeveelheid) / p.prijs_per);
}

/**
 * De btw van een regelbedrag (incl.) verdeeld over tarieven, in centen.
 *
 * 1. Staat er een overschrijving op het artikel (procenten per tarief), dan die.
 * 2. Anders naar rato van de winkelwaarde van de componenten met een bekende
 *    winkelprijs — Bier & wijn € 35: 69,8 % tegen 21 %, 30,2 % tegen 9 %.
 * 3. Anders (geen template, of geen enkele winkelprijs) alles op btw_pct.
 *
 * Het bedrag wordt eerst over de tarieven verdeeld (restcent naar het grootste
 * deel), dan per deel het btw-deel genomen. Zo tellen de delen altijd op tot
 * het bedrag en klopt de btw per tarief op de cent.
 */
export function btwVerdeling(
    a: Pick<Artikel, 'btw_pct' | 'btw_verdeling'>,
    componenten: Component[],
    producten: Map<string, Product>,
    bedragCenten: number,
): { delen: Record<string, number>; btw: Record<string, number> } {
    let gewicht: Record<string, number> = {};
    if (a.btw_verdeling && Object.keys(a.btw_verdeling).length) {
        for (const [pct, w] of Object.entries(a.btw_verdeling)) if (w > 0) gewicht[pct] = w;
    } else {
        for (const c of componenten) {
            const p = c.product_id ? producten.get(c.product_id) : null;
            if (!p) continue;
            const w = winkelwaardeCenten(p, c.hoeveelheid);
            if (w == null || w <= 0) continue;
            gewicht[String(p.btw_pct)] = (gewicht[String(p.btw_pct)] ?? 0) + w;
        }
    }
    if (!Object.keys(gewicht).length) gewicht = { [String(a.btw_pct)]: 1 };

    const totaalGewicht = Object.values(gewicht).reduce((s, w) => s + w, 0);
    const delen: Record<string, number> = {};
    let verdeeld = 0;
    const tarieven = Object.keys(gewicht).sort((x, y) => gewicht[y]! - gewicht[x]!);
    for (const pct of tarieven) {
        const deel = Math.floor((bedragCenten * gewicht[pct]!) / totaalGewicht);
        delen[pct] = deel;
        verdeeld += deel;
    }
    delen[tarieven[0]!] = (delen[tarieven[0]!] ?? 0) + (bedragCenten - verdeeld);

    const btw: Record<string, number> = {};
    for (const [pct, deel] of Object.entries(delen)) btw[pct] = btwDeel(deel, Number(pct));
    return { delen, btw };
}

/* ── Geld ──────────────────────────────────────────────────────────────────── */

/** Het btw-deel van een bedrag inclusief btw, in hele centen. */
export function btwDeel(bedragInclCenten: number, pct: number): number {
    if (pct <= 0) return 0;
    return Math.round((bedragInclCenten * pct) / (100 + pct));
}

export function leverkosten(inst: Instellingen, leverwijze: Leverwijze, subtotaalCenten: number): number | null {
    if (leverwijze !== 'verzenden') return 0;
    if (inst.verzendkosten_cents == null) return null;
    if (inst.gratis_verzenden_vanaf_cents != null && subtotaalCenten >= inst.gratis_verzenden_vanaf_cents) return 0;
    return inst.verzendkosten_cents;
}

/* ── Momenten ──────────────────────────────────────────────────────────────── */

/** 'Onbeperkt' als getal — het contract met de website vraagt een aantal. */
export const ONBEPERKT = 100_000;

export function naarMoment(m: MomentRij): Moment {
    return {
        id: m.id,
        datum: m.datum,
        van: m.van,
        tot: m.tot,
        vrij: m.capaciteit == null ? ONBEPERKT : Math.max(0, m.capaciteit - m.bezet),
    };
}

/** Vandaag als YYYY-MM-DD in Nederlandse tijd. */
export function vandaagISO(nu: Date = new Date()): string {
    return nu.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
}

/** Kan dit moment nog gekozen worden? Voorbij of na de besteltermijn = nee. */
export function momentOpen(m: MomentRij, vandaag: string, nu?: Date): boolean {
    if (!m.actief) return false;
    if (m.datum < vandaag) return false;
    if (m.bestellen_tot && m.bestellen_tot < vandaag) return false;
    if (m.sluit_op && nu && new Date(m.sluit_op).getTime() <= nu.getTime()) return false;
    return true;
}

/** Hetzelfde tijdvak: zelfde dag, zelfde van en tot. Twee groepen kunnen zo één afhaalmoment delen. */
export function zelfdeTijdvak(a: Pick<MomentRij, 'datum' | 'van' | 'tot'>, b: Pick<MomentRij, 'datum' | 'van' | 'tot'>): boolean {
    return a.datum === b.datum && (a.van ?? '') === (b.van ?? '') && (a.tot ?? '') === (b.tot ?? '');
}

const MAAND = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

/** '2026-12-23' → '23 december'. */
export function dagInWoorden(isoDatum: string): string {
    const [, m, d] = isoDatum.split('-').map(Number);
    if (!m || !d) return isoDatum;
    return `${d} ${MAAND[m - 1] ?? ''}`.trim();
}

/* ── Tekst ─────────────────────────────────────────────────────────────────── */

/** m•••@voorbeeld.nl — dezelfde vorm als de website. */
export function maskeerEmail(email: string): string {
    const [naam = '', domein = ''] = email.split('@');
    if (!domein) return '•••';
    return `${naam.slice(0, 1)}•••@${domein}`;
}

function namen(a: { naam: string }[]): string {
    const n = a.map((x) => x.naam);
    if (n.length <= 1) return n.join('');
    return `${n.slice(0, -1).join(', ')} en ${n.at(-1)}`;
}

/* ── De offerte ────────────────────────────────────────────────────────────── */

export interface Rekenbronnen {
    artikelen: Artikel[];
    momenten: MomentRij[];
    instellingen: Instellingen;
    /** Producten en slots (templates). Ontbreekt = geen artikel heeft een template. */
    producten?: Product[];
    slots?: Slot[];
    nu?: Date;
}

/**
 * Rekent een mand om naar een offerte. Fouten in de volgorde waarin de klant
 * ze kan oplossen: eerst wat er in de mand zit, dan de leverwijze, dan het
 * moment. Eén 'validatie'-antwoord met alle regelfouten tegelijk, zodat de
 * klant niet vijf keer heen en weer hoeft.
 */
export function berekenOfferte(
    bron: Rekenbronnen,
    mand: Mand,
    leverwijze: Leverwijze,
    momentId: string | null,
    betaalwijze: Betaalwijze = 'volledig',
): OfferteInternUitkomst {
    const nu = bron.nu ?? new Date();
    const vandaag = vandaagISO(nu);
    const opSlug = new Map(bron.artikelen.map((a) => [a.slug, a]));
    const opId = new Map(bron.momenten.map((m) => [m.id, m]));
    const producten = new Map((bron.producten ?? []).map((p) => [p.id, p]));

    if (!bron.instellingen.kassa_open) {
        return { ok: false, soort: 'niet-beschikbaar', melding: 'Online afrekenen is op dit moment niet beschikbaar.' };
    }
    if (!mand.regels.length) return { ok: false, soort: 'validatie', fouten: ['Je mand is leeg.'] };

    const fouten: string[] = [];
    const regels: Regelintern[] = [];
    const artikelen: Artikel[] = [];
    const btwCenten: Record<string, number> = {};
    let momentFout: OfferteInternUitkomst | null = null;
    const agendaMomenten = new Set<string>();

    for (const regel of mand.regels) {
        const a = opSlug.get(regel.slug);
        if (!a) {
            fouten.push('Dit product bestaat niet meer in ons aanbod.');
            continue;
        }
        artikelen.push(a);
        const eenheidWoord = a.telt === 'personen' ? 'personen' : 'stuks';
        /* Prijs volgt, uit, of een template waarvan nog niet elk slot is ingevuld:
           dezelfde zin — de site zegt "prijs volgt" of laat het artikel weg. */
        if (!a.actief || a.prijs_cents == null || !verkoopbaar(a.id, bron.slots)) fouten.push(`${a.naam} kan op dit moment niet besteld worden.`);
        if (regel.aantal < a.minimum) fouten.push(`${a.naam} gaat vanaf ${a.minimum} ${eenheidWoord}.`);
        if (a.maximum !== null && regel.aantal > a.maximum) fouten.push(`${a.naam} gaat tot ${a.maximum} ${eenheidWoord} per bestelling.`);
        /* Een vast pakket: keuzes horen er niet bij (fase 2). */
        if ((regel as { keuzes?: unknown }).keuzes != null) fouten.push(`${a.naam} is een vast pakket; kiezen kan nog niet.`);

        /* Het moment of de dag van deze regel. */
        let moment_id: string | null = null;
        let afhaalmoment: string | null = a.afhaalmoment_tekst;
        if (a.moment_soort === 'moment') {
            const gekozen = regel.moment ?? momentId;
            if (!gekozen) {
                fouten.push(`Kies een afhaalmoment voor ${a.naam}.`);
            } else {
                const m = opId.get(gekozen);
                if (!m || m.groep !== a.moment_groep || !momentOpen(m, vandaag, nu)) {
                    momentFout ??= { ok: false, soort: 'moment-verlopen', melding: 'Dit afhaalmoment is niet meer beschikbaar. Kies een ander moment.' };
                } else {
                    moment_id = m.id;
                    agendaMomenten.add(m.id);
                }
            }
        } else if (a.moment_soort === 'dag') {
            const dagen = bron.momenten.filter((m) => m.groep === a.moment_groep && momentOpen(m, vandaag, nu));
            const keuze = dagen.map((d) => dagInWoorden(d.datum));
            if (!regel.moment) {
                fouten.push(`Kies een afhaaldag voor ${a.naam}${keuze.length ? ` (${keuze.join(' of ')})` : ''}.`);
            } else {
                const m = dagen.find((d) => d.id === regel.moment);
                if (!m) {
                    momentFout ??= { ok: false, soort: 'moment-verlopen', melding: `Deze afhaaldag is niet meer beschikbaar voor ${a.naam}. Kies een andere dag.` };
                } else {
                    moment_id = m.id;
                    afhaalmoment = `Afhalen op ${dagInWoorden(m.datum)}${m.van ? ` vanaf ${m.van.slice(0, 5)}` : ''}`;
                }
            }
        }

        if (a.prijs_cents == null) continue;
        const bedragCenten = a.prijs_cents * regel.aantal;
        const componenten = componentenVan(a.id, bron.slots, regel.aantal);
        const verdeling = btwVerdeling(a, componenten, producten, bedragCenten);
        for (const [pct, c] of Object.entries(verdeling.btw)) btwCenten[pct] = (btwCenten[pct] ?? 0) + c;
        const alcohol = Boolean(a.alcohol) || componenten.some((c) => c.product_id && producten.get(c.product_id)?.alcohol);
        regels.push({
            slug: a.slug,
            naam: a.naam,
            aantal: regel.aantal,
            eenheid: a.eenheid,
            stukCenten: a.prijs_cents,
            bedragCenten,
            afhaalmoment,
            artikel_id: a.id,
            btw_pct: a.btw_pct,
            btw_cents: verdeling.btw,
            moment_id,
            eenheden: moment_id ? eenhedenVan(a, regel.aantal) : 0,
            voorraad_eenheden: a.voorraad == null ? 0 : regel.aantal,
            componenten,
            alcohol,
        });
    }

    if (fouten.length) return { ok: false, soort: 'validatie', fouten: [...new Set(fouten)] };

    /* Leverwijze: één gekoeld of niet-verzendbaar artikel zet alles op afhalen. */
    if (leverwijze === 'verzenden') {
        const nietPerPost = artikelen.filter((a) => !a.verzendbaar || a.gekoeld);
        if (nietPerPost.length) {
            const reden = nietPerPost.some((a) => a.gekoeld) ? 'gekoeld, en dat overleeft de reis niet' : 'die halen we liever voor je klaar';
            return {
                ok: false,
                soort: 'validatie',
                fouten: [`${namen(nietPerPost)} ${nietPerPost.length === 1 ? 'kan' : 'kunnen'} niet per post: ${reden}. Deze bestelling haal je op in Schoonoord.`],
            };
        }
    } else if (leverwijze !== 'afhalen') {
        return { ok: false, soort: 'validatie', fouten: ['Onbekende leverwijze.'] };
    }

    /* Meerdere agenda-momenten in één bestelling is één afhaalafspraak te veel —
       tenzij het hetzelfde tijdvak is (plank én pakketten: twee groepen, twee
       tellingen, één moment aan de deur). */
    if (agendaMomenten.size > 1) {
        const [eerste, ...rest] = [...agendaMomenten].map((id) => opId.get(id)!);
        if (rest.some((m) => !zelfdeTijdvak(m, eerste!))) {
            return { ok: false, soort: 'validatie', fouten: ['Kies één afhaalmoment voor de hele bestelling.'] };
        }
    }
    if (momentFout) return momentFout;

    /* Capaciteit per moment (informatief; de opslag telt nog eens onder vergrendeling). */
    const nodigPerMoment = new Map<string, number>();
    for (const r of regels) {
        if (r.moment_id) nodigPerMoment.set(r.moment_id, (nodigPerMoment.get(r.moment_id) ?? 0) + r.eenheden);
    }
    for (const [id, nodig] of nodigPerMoment) {
        const m = opId.get(id)!;
        if (m.capaciteit != null && m.capaciteit - m.bezet < nodig) {
            const isDag = m.van == null;
            return {
                ok: false,
                soort: 'moment-vol',
                melding: isDag ? `Deze afhaaldag (${dagInWoorden(m.datum)}) is inmiddels vol. Kies een andere dag.` : 'Dit afhaalmoment is inmiddels vol. Kies een ander moment.',
            };
        }
    }

    /* Voorraad (informatief, idem). */
    const nodigPerArtikel = new Map<string, number>();
    for (const r of regels) {
        if (r.voorraad_eenheden) nodigPerArtikel.set(r.artikel_id, (nodigPerArtikel.get(r.artikel_id) ?? 0) + r.voorraad_eenheden);
    }
    for (const [id, nodig] of nodigPerArtikel) {
        const a = bron.artikelen.find((x) => x.id === id)!;
        if (a.voorraad == null) continue;
        const vrij = Math.max(0, a.voorraad - (a.voorraad_bezet ?? 0));
        if (vrij < nodig) {
            return { ok: false, soort: 'validatie', fouten: [`${a.naam} is ${vrij === 0 ? 'uitverkocht' : `nog maar ${vrij} keer beschikbaar`}.`] };
        }
    }

    /* Productvoorraad (informatief, idem): alleen producten met een getal. */
    const nodigPerProduct = new Map<string, number>();
    for (const r of regels) for (const c of r.componenten) {
        if (c.product_id) nodigPerProduct.set(c.product_id, (nodigPerProduct.get(c.product_id) ?? 0) + c.hoeveelheid);
    }
    for (const [id, nodig] of nodigPerProduct) {
        const p = producten.get(id);
        if (!p || p.voorraad == null) continue;
        if (p.voorraad - (p.voorraad_bezet ?? 0) < nodig) {
            const namenVan = [...new Set(regels.filter((r) => r.componenten.some((c) => c.product_id === id)).map((r) => r.naam))];
            return { ok: false, soort: 'validatie', fouten: [`${namen(namenVan.map((naam) => ({ naam })))} ${namenVan.length === 1 ? 'is' : 'zijn'} uitverkocht: ${p.naam} is op.`] };
        }
    }

    const subtotaalCenten = regels.reduce((s, r) => s + r.bedragCenten, 0);
    const leverkostenCenten = leverkosten(bron.instellingen, leverwijze, subtotaalCenten);
    if (leverkostenCenten == null) {
        return { ok: false, soort: 'validatie', fouten: ['Verzenden is nog niet beschikbaar. Kies afhalen.'] };
    }
    if (leverkostenCenten > 0) {
        const pct = bron.instellingen.verzendkosten_btw_pct;
        btwCenten[String(pct)] = (btwCenten[String(pct)] ?? 0) + btwDeel(leverkostenCenten, pct);
    }
    const totaalCenten = subtotaalCenten + leverkostenCenten;

    /* Betaalwijze: de reservering is geen toeslag — hij gaat van het totaal af. */
    let nuTeBetalenCenten = totaalCenten;
    let reserveringCenten = 0;
    if (betaalwijze === 'reservering') {
        const bedrag = bron.instellingen.reservering_bedrag_cents ?? null;
        if (bedrag == null) return { ok: false, soort: 'validatie', fouten: ['Reserveren en de rest in de winkel betalen is op dit moment niet mogelijk. Betaal de bestelling online.'] };
        if (leverwijze === 'verzenden') return { ok: false, soort: 'validatie', fouten: ['Reserveren kan alleen bij afhalen in de winkel.'] };
        reserveringCenten = Math.min(bedrag, totaalCenten);
        nuTeBetalenCenten = reserveringCenten;
    } else if (betaalwijze !== 'volledig') {
        return { ok: false, soort: 'validatie', fouten: ['Onbekende betaalwijze.'] };
    }

    /* Het moment van de order als geheel: het agenda-moment, anders de enige
       gekozen dag (Kerst-Box zonder plank), anders niets. */
    const orderMomentId = agendaMomenten.size >= 1
        ? [...agendaMomenten][0]!
        : nodigPerMoment.size === 1 ? [...nodigPerMoment.keys()][0]! : null;
    const orderMoment = orderMomentId ? naarMoment(opId.get(orderMomentId)!) : null;

    const geldigTot = new Date(nu.getTime() + bron.instellingen.offerte_geldig_minuten * 60_000).toISOString();

    return {
        ok: true,
        intern: {
            offerte: {
                regels: regels.map(({ artikel_id: _a, btw_pct: _b, btw_cents: _c, moment_id: _m, eenheden: _e, voorraad_eenheden: _v, componenten: _k, alcohol: _al, ...r }) => r),
                subtotaalCenten,
                leverwijze,
                leverkostenCenten,
                totaalCenten,
                moment: orderMoment,
                geldigTot,
                betaalwijze,
                nuTeBetalenCenten,
                restInWinkelCenten: totaalCenten - nuTeBetalenCenten,
                reserveringCenten,
            },
            regels,
            btwCenten,
            momentId: orderMomentId,
        },
    };
}
