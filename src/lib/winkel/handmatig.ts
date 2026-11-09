/**
 * Bestelling invoeren — een bestelling die per mail of telefoon binnenkwam,
 * zelf in de app gezet. Ontwerp: docs/superpowers/specs/2026-11-09-bestelling-invoeren-design.md
 *
 * Een zelf ingevoerde bestelling is een gewone winkel-order: zelfde vakjes,
 * zelfde agenda, zelfde afhaallijst van de kassa. Hier zit het rekenwerk,
 * zuiver: van de vakjes die Mathijs invult naar regels in hele centen.
 *
 *   - Een product uit het assortiment krijgt de catalogusprijs, tenzij er voor
 *     deze bestelling een andere prijs is ingevuld. Geen prijs = geen regel:
 *     de app verzint er geen.
 *   - Een regel op maat hangt aan het verborgen artikel `op-maat` en draagt
 *     zelf naam, prijs en btw. Zonder prijs: "prijs volgt", € 0 tot de prijs
 *     er is.
 *   - Elke regel weet in welke groep zijn afhaalmoment hoort: een artikel met
 *     vaste afhaaldagen (de Kerst-Box) in zijn eigen groep, de rest in
 *     `op-maat` — een groep die de website nooit opvraagt.
 */
import { z } from 'zod';
import { ALLERGENEN } from '@/lib/constants';
import { btwDeel, btwVerdeling, componentenVan, eenhedenVan, type Artikel, type Product, type Regelintern, type Slot } from './rekenen';
import type { Wensen } from './store';

/* ── Vaste waarden ─────────────────────────────────────────────────────────── */

export const OP_MAAT_SLUG = 'op-maat';
/** De momentgroep van zelf ingevoerde bestellingen. De website vraagt momenten per groep op, nooit deze. */
export const OP_MAAT_GROEP = 'op-maat';

/** Het verborgen artikel waar regels op maat aan hangen: actief (anders weigert de database), niet publiek, niet op de Toonbank. */
export const OP_MAAT_ARTIKEL = {
    slug: OP_MAAT_SLUG,
    naam: 'Op maat',
    eenheid: 'per stuk',
    telt: 'stuks',
    prijs_cents: null,
    btw_pct: 9,
    minimum: 1,
    maximum: null,
    verzendbaar: false,
    gekoeld: false,
    moment_soort: 'geen',
    moment_groep: null,
    afhaalmoment_tekst: null,
    capaciteit_soort: 'regel',
    voorraad: null,
    actief: true,
    publiek: false,
    kanalen: ['event'],
} as const;

export const BRONNEN = ['mail', 'telefoon', 'balie', 'anders'] as const;
export type Bron = (typeof BRONNEN)[number];
export const BRON_LABEL: Record<Bron | 'website', string> = {
    website: 'Website',
    mail: 'Mail',
    telefoon: 'Telefoon',
    balie: 'Balie',
    anders: 'Anders',
};

/** Zelf ingevoerd = alles wat niet van de website kwam. Leeg is de website (oude orders). */
export function isZelfIngevoerd(bron: string | null | undefined): bron is Bron {
    return !!bron && bron !== 'website';
}

/* ── Invoer ────────────────────────────────────────────────────────────────── */

const Datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Kies een afhaaldag');
const Tijd = z.string().regex(/^\d{2}:\d{2}$/, 'Tijd als uu:mm');
const Centen = z.number().int().min(0).max(10_000_000);

export const InvoerRegelSchema = z.discriminatedUnion('soort', [
    z.object({
        soort: z.literal('artikel'),
        slug: z.string().trim().min(1).max(80),
        aantal: z.number().int().min(1, 'Aantal is minstens 1').max(10_000),
        /** null = de catalogusprijs. */
        stukCenten: Centen.nullable().default(null),
        toelichting: z.string().trim().max(2000).default(''),
    }),
    z.object({
        soort: z.literal('op-maat'),
        naam: z.string().trim().min(1, 'Geef de regel op maat een naam').max(120),
        toelichting: z.string().trim().max(2000).default(''),
        aantal: z.number().int().min(1, 'Aantal is minstens 1').max(10_000),
        /** null = prijs volgt. */
        stukCenten: Centen.nullable().default(null),
        btwPct: z.union([z.literal(0), z.literal(9), z.literal(21)]).default(9),
    }),
]);
export type InvoerRegel = z.infer<typeof InvoerRegelSchema>;

export const InvoerSchema = z.object({
    /** Door het formulier gemaakt; nog eens versturen geeft dezelfde order. */
    sleutel: z.string().uuid(),
    klant: z.object({
        naam: z.string().trim().min(1, 'Vul de naam van de klant in').max(120),
        email: z.union([z.literal(''), z.string().trim().email('Dit e-mailadres klopt niet').max(200)]).default(''),
        telefoon: z.string().trim().max(40).default(''),
    }),
    bron: z.enum(BRONNEN),
    datum: Datum,
    tijd: Tijd.nullable().default(null),
    regels: z.array(InvoerRegelSchema).min(1, 'Zet er minstens één regel in').max(40),
    wensen: z.object({
        vegetarisch: z.number().int().min(0).max(10_000).default(0),
        veganistisch: z.number().int().min(0).max(10_000).default(0),
        glutenvrij: z.number().int().min(0).max(10_000).default(0),
        allergenen: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
        overig: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    }),
    opmerking: z.string().trim().max(2000).default(''),
    /** Aan: de kassa vraagt het hele bedrag bij het afhalen. Uit: factuur of al betaald, de kassa vraagt niets. */
    inDeKassa: z.boolean(),
    /** De aanvraag (lead) waar deze bestelling bij hoort, als die er is. */
    leadId: z.number().int().positive().nullable().default(null),
});
export type Invoer = z.infer<typeof InvoerSchema>;

/* ── Rekenen ───────────────────────────────────────────────────────────────── */

/** Een regel klaar voor de database, met wat de database-functie zelf niet kent. */
export interface HandmatigeRegel extends Regelintern {
    prijs_volgt: boolean;
    toelichting: string | null;
    /** De momentgroep van deze regel en of het een vaste dag is (zonder tijd). */
    groep: string;
    vasteDag: boolean;
}

export interface HandmatigPlan {
    regels: HandmatigeRegel[];
    subtotaalCenten: number;
    btwCenten: Record<string, number>;
    /** Regels op "prijs volgt": het totaal is nog niet compleet. */
    prijsVolgt: number;
}

export type HandmatigUitkomst = { ok: true; plan: HandmatigPlan } | { ok: false; fouten: string[] };

export interface HandmatigeBronnen {
    artikelen: Artikel[];
    producten: Product[];
    slots: Slot[];
}

/**
 * Van de ingevulde regels naar regels in centen. Geen momenten hier: welke
 * groep een regel nodig heeft staat erbij, het moment zoekt (of maakt) de
 * action. Alle fouten tegelijk, zodat Mathijs niet vijf keer heen en weer hoeft.
 */
export function bouwHandmatig(invoer: Pick<Invoer, 'regels'>, bron: HandmatigeBronnen): HandmatigUitkomst {
    const opSlug = new Map(bron.artikelen.map((a) => [a.slug, a]));
    const producten = new Map(bron.producten.map((p) => [p.id, p]));
    const opMaat = opSlug.get(OP_MAAT_SLUG);
    const fouten: string[] = [];
    const regels: HandmatigeRegel[] = [];
    const btwCenten: Record<string, number> = {};
    let prijsVolgt = 0;

    for (const r of invoer.regels) {
        if (r.soort === 'artikel') {
            const a = opSlug.get(r.slug);
            if (!a || a.slug === OP_MAAT_SLUG) { fouten.push('Een gekozen product bestaat niet meer.'); continue; }
            if (!a.actief) { fouten.push(`${a.naam} staat uit. Zet hem aan in Webshop → Artikelen, of voer hem in als regel op maat.`); continue; }
            const stuk = r.stukCenten ?? a.prijs_cents;
            if (stuk == null) { fouten.push(`${a.naam} heeft nog geen prijs. Vul voor deze bestelling een prijs in.`); continue; }
            const bedrag = stuk * r.aantal;
            const componenten = componentenVan(a.id, bron.slots, r.aantal);
            const verdeling = btwVerdeling(a, componenten, producten, bedrag);
            for (const [pct, c] of Object.entries(verdeling.btw)) btwCenten[pct] = (btwCenten[pct] ?? 0) + c;
            const vasteDag = a.moment_soort === 'dag' && !!a.moment_groep;
            regels.push({
                slug: a.slug,
                naam: a.naam,
                aantal: r.aantal,
                eenheid: a.eenheid,
                stukCenten: stuk,
                bedragCenten: bedrag,
                afhaalmoment: null,
                artikel_id: a.id,
                btw_pct: a.btw_pct,
                btw_cents: verdeling.btw,
                moment_id: null,
                eenheden: eenhedenVan(a, r.aantal),
                voorraad_eenheden: a.voorraad == null ? 0 : r.aantal,
                componenten,
                alcohol: Boolean(a.alcohol) || componenten.some((c) => c.product_id && producten.get(c.product_id)?.alcohol),
                prijs_volgt: false,
                toelichting: r.toelichting || null,
                groep: vasteDag ? a.moment_groep! : OP_MAAT_GROEP,
                vasteDag,
            });
        } else {
            if (!opMaat) { fouten.push('Het artikel voor regels op maat ontbreekt.'); continue; }
            const volgt = r.stukCenten == null;
            const stuk = r.stukCenten ?? 0;
            const bedrag = stuk * r.aantal;
            const btw: Record<string, number> = bedrag > 0 ? { [String(r.btwPct)]: btwDeel(bedrag, r.btwPct) } : {};
            for (const [pct, c] of Object.entries(btw)) btwCenten[pct] = (btwCenten[pct] ?? 0) + c;
            if (volgt) prijsVolgt += 1;
            regels.push({
                slug: OP_MAAT_SLUG,
                naam: r.naam,
                aantal: r.aantal,
                eenheid: 'per stuk',
                stukCenten: stuk,
                bedragCenten: bedrag,
                afhaalmoment: null,
                artikel_id: opMaat.id,
                btw_pct: r.btwPct,
                btw_cents: btw,
                moment_id: null,
                eenheden: 0,
                voorraad_eenheden: 0,
                componenten: [],
                alcohol: false,
                prijs_volgt: volgt,
                toelichting: r.toelichting || null,
                groep: OP_MAAT_GROEP,
                vasteDag: false,
            });
        }
    }

    if (fouten.length) return { ok: false, fouten: [...new Set(fouten)] };
    return {
        ok: true,
        plan: { regels, subtotaalCenten: regels.reduce((s, r) => s + r.bedragCenten, 0), btwCenten, prijsVolgt },
    };
}

/**
 * Welke momentgroep de order als geheel krijgt: die van een vaste dag als er
 * één is (de Kerst-Box: dan staat de hele bestelling in het Kerst-vakje),
 * anders `op-maat`. Regels op maat volgen de order.
 */
export function ordergroep(regels: Pick<HandmatigeRegel, 'groep' | 'vasteDag' | 'slug'>[]): { groep: string; vasteDag: boolean } {
    const dag = regels.find((r) => r.vasteDag);
    return dag ? { groep: dag.groep, vasteDag: true } : { groep: OP_MAAT_GROEP, vasteDag: false };
}

/** De groep waar een regel in komt: een product met een eigen groep houdt die, een regel op maat volgt de order. */
export function regelgroep(r: Pick<HandmatigeRegel, 'groep' | 'vasteDag' | 'slug'>, order: { groep: string; vasteDag: boolean }): { groep: string; vasteDag: boolean } {
    if (r.slug === OP_MAAT_SLUG) return order;
    return { groep: r.groep, vasteDag: r.vasteDag };
}

/* ── Let op ────────────────────────────────────────────────────────────────── */

/**
 * Wat er met een uitroepteken bij hoort: allergenen en harde regels. Dieet
 * telt mee, maar is geen waarschuwing. Leeg als er niets is.
 *
 *   ["! allergie: noten, lactose", "! geen olijven"]
 */
export function letOpPunten(w: Pick<Wensen, 'allergenen' | 'overig'> | null | undefined): string[] {
    if (!w) return [];
    const uit: string[] = [];
    const allergenen = w.allergenen.map((a) => a.trim()).filter(Boolean);
    if (allergenen.length) uit.push(`! allergie: ${allergenen.join(', ')}`);
    for (const o of w.overig) if (o.trim()) uit.push(`! ${o.trim()}`);
    return uit;
}

/** De allergenen om uit te kiezen: de EU-lijst uit de app, als woorden zoals ze op de order staan. */
export const ALLERGEEN_KEUZES: readonly string[] = ALLERGENEN.map((a) => a.label.toLowerCase());

/** "geen geitenkaas; geen olijven" of één per regel → losse harde regels. */
export function splitsRegels(tekst: string): string[] {
    return tekst.split(/[\n;]+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * De opmerking op de order: wat er bij elke regel hoort, dan de vrije
 * opmerking. Zo staat alles ook op plekken die alleen de opmerking lezen
 * (de Kerst-lijst, oudere schermen).
 */
export function handmatigeOpmerking(regels: Pick<HandmatigeRegel, 'naam' | 'aantal' | 'toelichting' | 'prijs_volgt'>[], opmerking: string): string {
    const delen: string[] = [];
    for (const r of regels) {
        if (!r.toelichting && !r.prijs_volgt) continue;
        const extra = [r.toelichting, r.prijs_volgt ? 'prijs volgt' : null].filter(Boolean).join(' — ');
        delen.push(`${r.aantal}× ${r.naam}: ${extra}`);
    }
    if (opmerking.trim()) delen.push(opmerking.trim());
    return delen.join('\n');
}

/* ── Prijs invullen ────────────────────────────────────────────────────────── */

export interface PrijsRegel {
    id: number;
    aantal: number;
    bedrag_cents: number;
    btw_pct: number;
    btw_cents: Record<string, number> | null;
    prijs_volgt: boolean;
}

/**
 * Een prijs voor een regel op "prijs volgt": de nieuwe regel en het nieuwe
 * ordertotaal. Het verschil gaat bij de rest (wat de kassa vraagt) alleen als
 * de order in de kassa wordt afgerekend.
 */
export function vulPrijsIn(
    regel: PrijsRegel,
    stukCenten: number,
    order: { subtotaal_cents: number; totaal_cents: number; btw_cents: Record<string, number>; rest_cents: number; inDeKassa: boolean },
): {
    regel: { stuk_cents: number; bedrag_cents: number; btw_cents: Record<string, number>; prijs_volgt: false };
    order: { subtotaal_cents: number; totaal_cents: number; btw_cents: Record<string, number>; rest_cents: number };
} {
    const bedrag = stukCenten * regel.aantal;
    const btw: Record<string, number> = bedrag > 0 ? { [String(regel.btw_pct)]: btwDeel(bedrag, regel.btw_pct) } : {};
    const verschil = bedrag - regel.bedrag_cents;
    const orderBtw: Record<string, number> = { ...order.btw_cents };
    for (const [pct, c] of Object.entries(regel.btw_cents ?? {})) orderBtw[pct] = (orderBtw[pct] ?? 0) - c;
    for (const [pct, c] of Object.entries(btw)) orderBtw[pct] = (orderBtw[pct] ?? 0) + c;
    for (const pct of Object.keys(orderBtw)) if (orderBtw[pct] === 0) delete orderBtw[pct];
    return {
        regel: { stuk_cents: stukCenten, bedrag_cents: bedrag, btw_cents: btw, prijs_volgt: false },
        order: {
            subtotaal_cents: order.subtotaal_cents + verschil,
            totaal_cents: order.totaal_cents + verschil,
            btw_cents: orderBtw,
            rest_cents: order.inDeKassa ? Math.max(0, order.rest_cents + verschil) : order.rest_cents,
        },
    };
}
