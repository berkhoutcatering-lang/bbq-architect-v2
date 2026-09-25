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
import type { Leverwijze, Mand, Moment, Offerte, Offerteregel, OfferteUitkomst } from './types';

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
}

export interface MomentRij {
    id: string;
    groep: string;
    datum: string;
    van: string | null;
    tot: string | null;
    capaciteit: number;
    bestellen_tot: string | null;
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
}

/** Een offerteregel plus wat de opslag ervan moet weten. */
export interface Regelintern extends Offerteregel {
    artikel_id: string;
    btw_pct: number;
    moment_id: string | null;
    eenheden: number;
    voorraad_eenheden: number;
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

export function naarMoment(m: MomentRij): Moment {
    return {
        id: m.id,
        datum: m.datum,
        van: m.van,
        tot: m.tot,
        vrij: Math.max(0, m.capaciteit - m.bezet),
    };
}

/** Vandaag als YYYY-MM-DD in Nederlandse tijd. */
export function vandaagISO(nu: Date = new Date()): string {
    return nu.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
}

/** Kan dit moment nog gekozen worden? Voorbij of na de besteltermijn = nee. */
export function momentOpen(m: MomentRij, vandaag: string): boolean {
    if (!m.actief) return false;
    if (m.datum < vandaag) return false;
    if (m.bestellen_tot && m.bestellen_tot < vandaag) return false;
    return true;
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
): OfferteInternUitkomst {
    const nu = bron.nu ?? new Date();
    const vandaag = vandaagISO(nu);
    const opSlug = new Map(bron.artikelen.map((a) => [a.slug, a]));
    const opId = new Map(bron.momenten.map((m) => [m.id, m]));

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
        if (!a.actief || a.prijs_cents == null) fouten.push(`${a.naam} kan op dit moment niet besteld worden.`);
        if (regel.aantal < a.minimum) fouten.push(`${a.naam} gaat vanaf ${a.minimum} ${eenheidWoord}.`);
        if (a.maximum !== null && regel.aantal > a.maximum) fouten.push(`${a.naam} gaat tot ${a.maximum} ${eenheidWoord} per bestelling.`);

        /* Het moment of de dag van deze regel. */
        let moment_id: string | null = null;
        let afhaalmoment: string | null = a.afhaalmoment_tekst;
        if (a.moment_soort === 'moment') {
            const gekozen = regel.moment ?? momentId;
            if (!gekozen) {
                fouten.push(`Kies een afhaalmoment voor ${a.naam}.`);
            } else {
                const m = opId.get(gekozen);
                if (!m || m.groep !== a.moment_groep || !momentOpen(m, vandaag)) {
                    momentFout ??= { ok: false, soort: 'moment-verlopen', melding: 'Dit afhaalmoment is niet meer beschikbaar. Kies een ander moment.' };
                } else {
                    moment_id = m.id;
                    agendaMomenten.add(m.id);
                }
            }
        } else if (a.moment_soort === 'dag') {
            const dagen = bron.momenten.filter((m) => m.groep === a.moment_groep && momentOpen(m, vandaag));
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
        btwCenten[String(a.btw_pct)] = (btwCenten[String(a.btw_pct)] ?? 0) + btwDeel(bedragCenten, a.btw_pct);
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
            moment_id,
            eenheden: moment_id ? eenhedenVan(a, regel.aantal) : 0,
            voorraad_eenheden: a.voorraad == null ? 0 : regel.aantal,
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

    /* Meerdere agenda-momenten in één bestelling is één afhaalafspraak te veel. */
    if (agendaMomenten.size > 1) {
        return { ok: false, soort: 'validatie', fouten: ['Kies één afhaalmoment voor de hele bestelling.'] };
    }
    if (momentFout) return momentFout;

    /* Capaciteit per moment (informatief; de opslag telt nog eens onder vergrendeling). */
    const nodigPerMoment = new Map<string, number>();
    for (const r of regels) {
        if (r.moment_id) nodigPerMoment.set(r.moment_id, (nodigPerMoment.get(r.moment_id) ?? 0) + r.eenheden);
    }
    for (const [id, nodig] of nodigPerMoment) {
        const m = opId.get(id)!;
        if (m.capaciteit - m.bezet < nodig) {
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

    const subtotaalCenten = regels.reduce((s, r) => s + r.bedragCenten, 0);
    const leverkostenCenten = leverkosten(bron.instellingen, leverwijze, subtotaalCenten);
    if (leverkostenCenten == null) {
        return { ok: false, soort: 'validatie', fouten: ['Verzenden is nog niet beschikbaar. Kies afhalen.'] };
    }
    if (leverkostenCenten > 0) {
        const pct = bron.instellingen.verzendkosten_btw_pct;
        btwCenten[String(pct)] = (btwCenten[String(pct)] ?? 0) + btwDeel(leverkostenCenten, pct);
    }

    /* Het moment van de order als geheel: het agenda-moment, anders de enige
       gekozen dag (Kerst-Box zonder plank), anders niets. */
    const orderMomentId = agendaMomenten.size === 1
        ? [...agendaMomenten][0]!
        : nodigPerMoment.size === 1 ? [...nodigPerMoment.keys()][0]! : null;
    const orderMoment = orderMomentId ? naarMoment(opId.get(orderMomentId)!) : null;

    const geldigTot = new Date(nu.getTime() + bron.instellingen.offerte_geldig_minuten * 60_000).toISOString();

    return {
        ok: true,
        intern: {
            offerte: {
                regels: regels.map(({ artikel_id: _a, btw_pct: _b, moment_id: _m, eenheden: _e, voorraad_eenheden: _v, ...r }) => r),
                subtotaalCenten,
                leverwijze,
                leverkostenCenten,
                totaalCenten: subtotaalCenten + leverkostenCenten,
                moment: orderMoment,
                geldigTot,
            },
            regels,
            btwCenten,
            momentId: orderMomentId,
        },
    };
}
