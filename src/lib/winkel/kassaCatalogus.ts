/**
 * De kassacatalogus van Hop & Bites naar winkel_producten / winkel_artikelen
 * (27 oktober 2026, voor de opening op 21 november).
 *
 * De bron is catalogus.json uit de website-repo (tak opening-21-nov): 139
 * artikelen, sleutel = slug. Deze module is zuiver: ze krijgt de catalogus en
 * wat er nu live staat, en zegt precies wat er geschreven zou worden. Het
 * script (scripts/importeer-kassa-catalogus.ts) doet de opslag en de foto's.
 *
 * Regels (LEESMIJ-VOOR-BBQ-ARCHITECT.md bij de catalogus):
 *   - Upsert op slug. Nooit hernoemen, nooit verwijderen: wat live staat en
 *     niet in de lijst zit, gaat op niet actief.
 *   - Prijsstatus: bevestigd en op-de-site mogen actief; voorstel komt erin
 *     als concept (prijs ingevuld, niet actief); ontbreekt = niet verkopen.
 *     Een voorstel overschrijft nooit een prijs die er al staat.
 *   - Btw 9 of 21, gecontroleerd tegen het alcoholpercentage (tot en met
 *     0,5 % is alcoholvrij). 'gemengd' (de pakketten) laat btw_pct staan en
 *     de verdeling leeg: dan rekent de kassa naar rato van de slots.
 *   - Allergenen: null blijft null. Een null overschrijft nooit iets.
 *   - Prijs, btw, allergenen en EAN komen alleen uit de catalogus.
 *   - Website-velden (productnaam, foto, kenmerken, pagina) blijven van een
 *     bestaand product af; een nieuw product krijgt geen pagina.
 */
import { z } from 'zod';
import { bierKenmerkenSchema } from './productsoorten';
import { KERST_SLUG_LIJST } from './kerstTellen';

/* ── De catalogus ──────────────────────────────────────────────────────────── */

export const PRIJS_STATUSSEN = ['bevestigd', 'op-de-site', 'voorstel', 'ontbreekt'] as const;
export type PrijsStatus = (typeof PRIJS_STATUSSEN)[number];

/** Tot en met 0,5 % geen alcoholhoudende drank (Alcoholwet): geen 18+, 9 % btw. */
export const ALCOHOLVRIJ_TOT = 0.5;

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'geen geldige slug');

export const KassaArtikelSchema = z.object({
    slug,
    naam: z.string().trim().min(1),
    kassagroep: z.string().trim().min(1).max(40),
    subgroep: z.string().nullable(),
    eenheid: z.string().trim().min(1),
    verkoopt_per: z.enum(['stuk', 'gewicht', 'persoon', 'pakket']),
    prijs: z.number().nonnegative().nullable(),
    prijs_per_kg: z.number().positive().nullable(),
    prijs_status: z.enum(PRIJS_STATUSSEN),
    btw: z.union([z.literal(9), z.literal(21), z.literal('gemengd')]),
    alcohol_pct: z.number().min(0).max(100).nullable(),
    leeftijd_18: z.boolean(),
    bewaren_als: z.enum(['kamertemperatuur', 'koel', 'diepvries']),
    allergenen: z.array(z.string().trim().min(1)).min(1).nullable(),
    ingredienten: z.array(z.string().trim().min(1)).nullable().optional(),
    bewaren: z.string().nullable().optional(),
    inhoud: z.array(z.string()).nullable().optional(),
    foto: z.string().nullable(),
    ean: z.string().regex(/^\d{8,14}$/, 'een EAN is 8 tot 14 cijfers').nullable(),
    op_de_website: z.boolean(),
    details: z.record(z.string(), z.unknown()).default({}),
});
export type KassaArtikel = z.infer<typeof KassaArtikelSchema>;

/** Per kassagroep: het producttype, de afhaalgroep en het segment voor een nieuw los product. */
const GROEPEN: Record<string, { type: string; moment: string | null; segment: 'bier' | 'wijn' | null }> = {
    'Bier': { type: 'bier', moment: 'bier', segment: 'bier' },
    'Wijn': { type: 'wijn', moment: 'wijn', segment: 'wijn' },
    'Vers vlees': { type: 'vleeswaar', moment: 'vlees', segment: null },
    'Droge worst': { type: 'worst', moment: 'vlees', segment: null },
    'Vleeswaren en kaas': { type: 'vleeswaar', moment: 'vlees', segment: null },
    'Uit de vriezer': { type: 'overig', moment: 'vlees', segment: null },
    'Borrel': { type: 'overig', moment: null, segment: null },
};
/** "hotelblok-kaas staat bij Vleeswaren en kaas. Het is kaas, geen vlees." */
const KAAS = new Set(['hotelblok-kaas']);

/* ── Wat er live staat ─────────────────────────────────────────────────────── */

export interface LiveProduct {
    id: string;
    slug: string | null;
    naam: string;
    type: string;
    eenheid: string;
    prijs_per: number;
    winkelprijs_incl_cents: number | null;
    btw_pct: number;
    alcohol_pct: number | string | null;
    allergenen: string[] | null;
    ingredienten: string[] | null;
    bewaren: string | null;
    foto: unknown;
    statiegeld_cents: number;
}
export interface LiveArtikel {
    id: string;
    slug: string;
    naam: string;
    eenheid: string;
    prijs_cents: number | null;
    btw_pct: number;
    btw_verdeling: unknown;
    actief: boolean;
    kanalen: string[] | null;
    toonbank_groep: string | null;
    toonbank_volgorde: number;
}
export interface LiveSlot {
    id: string;
    artikel_id: string;
    standaard_product_id: string | null;
}
export interface LiveStand {
    producten: LiveProduct[];
    artikelen: LiveArtikel[];
    slots: LiveSlot[];
}

export interface Keuzes {
    /**
     * Losse verkoop van alcohol aanzetten: actief en op de Toonbank. Standaard
     * uit — "pas als Mathijs dat zelf aanzet, na zijn check bij de gemeente".
     */
    alcohol: boolean;
    /** Slugs die niet in de lijst staan maar toch actief blijven. */
    behoud: readonly string[];
    /** Statiegeld per blik in centen (LEESMIJ: € 0,15 sinds 2023), of null om het niet te zetten. */
    statiegeldBlikCents: number | null;
}

export const STANDAARD_KEUZES: Keuzes = {
    alcohol: false,
    // De Kerst-Box-aanvraag op de site biedt crémant en champagne nog per fles aan (KERST_ERBIJ).
    behoud: ['kerst-cremant', 'kerst-champagne'],
    statiegeldBlikCents: 15,
};

/* ── Het plan ──────────────────────────────────────────────────────────────── */

export type Rij = Record<string, unknown>;

export interface FotoTaak {
    /** Pad in de catalogusmap, bv. 'fotos/achel-tripel.png'. */
    bron: string;
    /** {org}/{slug}-v1; de bestanden worden {basis}-{w}.{formaat}. */
    basis: string;
}

export type Actie =
    | {
          soort: 'nieuw';
          slug: string;
          /** Nieuw product (null: hergebruik `productId` of geen product, bij een pakket). */
          product: Rij | null;
          productId: string | null;
          productPatch: Rij;
          artikel: Rij;
          slot: Rij | null;
          foto: FotoTaak | null;
      }
    | {
          soort: 'bijwerken';
          slug: string;
          artikelId: string;
          artikelPatch: Rij;
          productId: string | null;
          productPatch: Rij;
          /** Een eerste slot naar het product, als het artikel er nog geen heeft. */
          slot: Rij | null;
          foto: FotoTaak | null;
      }
    | { soort: 'niet-actief'; slug: string; artikelId: string; naam: string };

export interface Melding {
    slug: string;
    tekst: string;
}

export interface PlanRegel {
    slug: string;
    naam: string;
    kassagroep: string;
    wat: 'nieuw' | 'bijwerken' | 'gelijk';
    prijsCents: number | null;
    prijsStatus: PrijsStatus;
    actief: boolean;
    opToonbank: boolean;
    wijzigingen: string[];
}

export interface Plan {
    acties: Actie[];
    regels: PlanRegel[];
    meldingen: Melding[];
    /** Live, niet in de lijst, al niet actief: blijft zo. */
    alUit: string[];
    /** Live, niet in de lijst, actief gehouden (keuzes.behoud). */
    behouden: string[];
}

export class CatalogusFout extends Error {
    constructor(public fouten: string[]) {
        super(`De catalogus klopt niet, er is niets gedaan:\n  ${fouten.join('\n  ')}`);
    }
}

/** De catalogus lezen en controleren. Gooit bij één fout: liever stoppen dan half importeren. */
export function leesCatalogus(json: unknown): KassaArtikel[] {
    const ruw = (json as { artikelen?: unknown })?.artikelen;
    if (!Array.isArray(ruw)) throw new CatalogusFout(['geen lijst "artikelen"']);
    const fouten: string[] = [];
    const uit: KassaArtikel[] = [];
    const gezien = new Set<string>();
    ruw.forEach((r, i) => {
        const p = KassaArtikelSchema.safeParse(r);
        const naam = (r as { slug?: string })?.slug ?? `#${i}`;
        if (!p.success) {
            fouten.push(`${naam}: ${p.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
            return;
        }
        const a = p.data;
        if (gezien.has(a.slug)) fouten.push(`${a.slug}: staat er twee keer in`);
        gezien.add(a.slug);
        fouten.push(...controleer(a).map((f) => `${a.slug}: ${f}`));
        uit.push(a);
    });
    if (fouten.length) throw new CatalogusFout(fouten);
    return uit;
}

/** Wat binnen één artikel niet met elkaar klopt. Niets wordt rechtgezet, alleen gemeld. */
export function controleer(a: KassaArtikel): string[] {
    const f: string[] = [];
    const alcohol = (a.alcohol_pct ?? 0) > ALCOHOLVRIJ_TOT;
    if (a.alcohol_pct != null && a.btw !== 'gemengd') {
        const moet = alcohol ? 21 : 9;
        if (a.btw !== moet) f.push(`btw ${a.btw} % past niet bij ${a.alcohol_pct} % alcohol (moet ${moet} %)`);
    }
    if (a.alcohol_pct != null && a.leeftijd_18 !== alcohol) f.push(`18+ ${a.leeftijd_18 ? 'aan' : 'uit'} past niet bij ${a.alcohol_pct} % alcohol`);
    if (a.btw === 'gemengd' && isLos(a)) f.push('gemengde btw kan alleen bij een pakket');
    if (a.prijs_status === 'ontbreekt' && a.prijs != null) f.push('prijs ingevuld maar status "ontbreekt"');
    if (a.prijs_status !== 'ontbreekt' && a.prijs == null) f.push(`geen prijs bij status "${a.prijs_status}"`);
    if (a.prijs != null && Math.abs(a.prijs * 100 - Math.round(a.prijs * 100)) > 1e-6) f.push(`prijs ${a.prijs} is geen heel aantal centen`);
    if (a.verkoopt_per === 'gewicht') {
        const per = gramPer(a);
        if (per == null) f.push(`gewicht, maar eenheid "${a.eenheid}" is niet per 100 gram of per kilo`);
        else if (a.prijs_per_kg == null) f.push('gewicht zonder prijs_per_kg');
        else if (a.prijs != null && Math.round(a.prijs * (1000 / per) * 100) !== Math.round(a.prijs_per_kg * 100)) {
            f.push(`prijs ${a.prijs} per ${per} g past niet bij ${a.prijs_per_kg} per kg`);
        }
    } else if (a.prijs_per_kg != null) f.push('prijs_per_kg zonder verkoop op gewicht');
    if (a.allergenen && a.allergenen.includes('geen') && a.allergenen.length > 1) f.push('allergenen "geen" samen met andere');
    return f;
}

/** Een los product (één slot naar één product) of een pakket/persoonsartikel. */
function isLos(a: KassaArtikel): boolean {
    return a.verkoopt_per === 'stuk' || a.verkoopt_per === 'gewicht';
}

/** Per hoeveel gram de prijs geldt, bij verkoop op gewicht. */
function gramPer(a: KassaArtikel): number | null {
    if (/^per 100 gram$/.test(a.eenheid)) return 100;
    if (/^per kilo$/.test(a.eenheid)) return 1000;
    return null;
}

function cents(prijs: number | null): number | null {
    return prijs == null ? null : Math.round(prijs * 100);
}

function heeftAlcohol(a: KassaArtikel): boolean {
    return a.leeftijd_18 || (a.alcohol_pct ?? 0) > ALCOHOLVRIJ_TOT;
}

/** Mag het verkocht worden (actief, Toonbank) met deze keuzes? */
function verkoopbaar(a: KassaArtikel, k: Keuzes): boolean {
    if (a.prijs == null || a.prijs_status === 'ontbreekt' || a.prijs_status === 'voorstel') return false;
    return k.alcohol || !heeftAlcohol(a);
}

function toonbankMag(a: KassaArtikel, k: Keuzes): boolean {
    return a.prijs != null && a.prijs_status !== 'ontbreekt' && (k.alcohol || !heeftAlcohol(a));
}

function blik(a: KassaArtikel): boolean {
    return (a.details as { verpakking?: { soort?: string } }).verpakking?.soort === 'blik';
}

function zelfde(a: unknown, b: unknown): boolean {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function euro(c: number | null): string {
    return c == null ? 'geen prijs' : `€ ${(c / 100).toFixed(2).replace('.', ',')}`;
}

/** Waar de foto van een product in de bucket komt (zelfde vorm als C4). */
export function kassaFotoBasis(orgId: string, s: string): string {
    return `${orgId}/${s}-v1`;
}

/* ── Het plan maken ────────────────────────────────────────────────────────── */

export function maakPlan(catalogus: readonly KassaArtikel[], live: LiveStand, orgId: string, k: Keuzes = STANDAARD_KEUZES): Plan {
    const artikelOp = new Map(live.artikelen.map((a) => [a.slug, a]));
    const productOp = new Map(live.producten.filter((p) => p.slug).map((p) => [p.slug as string, p]));
    const slotsVan = new Map<string, LiveSlot[]>();
    for (const s of live.slots) slotsVan.set(s.artikel_id, [...(slotsVan.get(s.artikel_id) ?? []), s]);

    const acties: Actie[] = [];
    const regels: PlanRegel[] = [];
    const meldingen: Melding[] = [];
    const meld = (s: string, tekst: string) => meldingen.push({ slug: s, tekst });
    const volgorde = new Map<string, number>();

    for (const a of catalogus) {
        const nr = (volgorde.get(a.kassagroep) ?? 0) + 1;
        volgorde.set(a.kassagroep, nr);
        const prijs = cents(a.prijs);
        const art = artikelOp.get(a.slug);
        const prod = productOp.get(a.slug) ?? null;
        const los = isLos(a);
        const gram = los && a.verkoopt_per === 'gewicht' ? gramPer(a) : null;
        const kerst = KERST_SLUG_LIJST.includes(a.slug);
        const wijzigingen: string[] = [];

        if (kerst && !art) throw new CatalogusFout([`${a.slug}: hoort bij het kerstaanbod maar staat niet in BBQ Architect — niet zelf aanmaken`]);
        if (a.prijs_status === 'voorstel') wijzigingen.push('voorstelprijs: concept, niet actief tot je hem goedkeurt');

        /* Wat het product moet krijgen (bij een los product). Null overschrijft nooit iets. */
        const productPatch: Rij = {};
        const btwGetal = a.btw === 'gemengd' ? null : a.btw;
        const fotoTaak = (heeftFoto: boolean): FotoTaak | null =>
            a.foto && !heeftFoto ? { bron: a.foto, basis: kassaFotoBasis(orgId, a.slug) } : null;

        if (prod && los) {
            if (a.allergenen && !zelfde(prod.allergenen, a.allergenen)) {
                productPatch.allergenen = a.allergenen;
                wijzigingen.push(prod.allergenen ? `allergenen ${prod.allergenen.join(', ')} → ${a.allergenen.join(', ')}` : `allergenen: ${a.allergenen.join(', ')}`);
            }
            if (prod.alcohol_pct == null && a.alcohol_pct != null) productPatch.alcohol_pct = a.alcohol_pct;
            if (prod.ingredienten == null && a.ingredienten) productPatch.ingredienten = a.ingredienten;
            if (prod.bewaren == null && a.bewaren) productPatch.bewaren = a.bewaren;
            if (btwGetal != null && prod.btw_pct !== btwGetal) {
                productPatch.btw_pct = btwGetal;
                wijzigingen.push(`btw product ${prod.btw_pct} → ${btwGetal} %`);
            }
            if (k.statiegeldBlikCents != null && blik(a) && prod.statiegeld_cents === 0) {
                productPatch.statiegeld_cents = k.statiegeldBlikCents;
                wijzigingen.push(`statiegeld blik ${euro(k.statiegeldBlikCents)}`);
            }
            const verwacht = gram ? { eenheid: 'gram', prijs_per: gram } : { eenheid: 'stuk', prijs_per: 1 };
            if (prod.eenheid !== verwacht.eenheid || Number(prod.prijs_per) !== verwacht.prijs_per) {
                meld(a.slug, `het product rekent per ${prod.prijs_per} ${prod.eenheid}, de catalogus per ${verwacht.prijs_per} ${verwacht.eenheid}: winkelprijs niet bijgewerkt`);
            }
        }

        if (!art) {
            /* ── Nieuw artikel ── */
            const actief = verkoopbaar(a, k);
            const kanalen = [...(a.op_de_website ? ['webshop'] : []), ...(toonbankMag(a, k) ? ['toonbank'] : [])];
            const g = GROEPEN[a.kassagroep];
            if (los && !g) throw new CatalogusFout([`${a.slug}: onbekende kassagroep "${a.kassagroep}" voor een los product`]);
            const type = los ? (KAAS.has(a.slug) ? 'kaas' : a.subgroep === 'Nootjes' ? 'amandelen' : g.type) : null;
            const moment = los ? g.moment : null;
            const artikel: Rij = {
                organization_id: orgId,
                slug: a.slug,
                naam: a.naam,
                eenheid: a.eenheid,
                telt: 'stuks',
                prijs_cents: prijs,
                btw_pct: btwGetal ?? 21,
                minimum: 1,
                maximum: null,
                verzendbaar: false,
                gekoeld: a.bewaren_als !== 'kamertemperatuur',
                moment_soort: moment ? 'moment' : 'geen',
                moment_groep: moment,
                capaciteit_soort: 'regel',
                alcohol: heeftAlcohol(a),
                segment: los ? g.segment : null,
                actief,
                publiek: a.op_de_website,
                kanalen,
                toonbank_groep: a.kassagroep,
                toonbank_volgorde: nr,
            };
            if (a.btw === 'gemengd') meld(a.slug, 'nieuw pakket met gemengde btw: zonder slots rekent de kassa alles tegen 21 %');

            let product: Rij | null = null;
            let slot: Rij | null = null;
            if (los) {
                if (!prod) {
                    product = {
                        organization_id: orgId,
                        naam: a.naam,
                        type,
                        slug: a.slug,
                        kenmerken: kenmerkenVan(a),
                        alcohol: heeftAlcohol(a),
                        alcohol_pct: a.alcohol_pct,
                        allergenen: a.allergenen,
                        ingredienten: a.ingredienten ?? null,
                        bewaren: a.bewaren ?? null,
                        ean: a.ean,
                        // Geen pagina: wat op de website staat, zet Mathijs daar live.
                        pagina_status: 'geen',
                        eenheid: gram ? 'gram' : 'stuk',
                        prijs_per: gram ?? 1,
                        winkelprijs_incl_cents: prijs,
                        btw_pct: btwGetal,
                        statiegeld_cents: k.statiegeldBlikCents != null && blik(a) ? k.statiegeldBlikCents : 0,
                        actief: true,
                    };
                } else if (prod.winkelprijs_incl_cents == null && prijs != null) {
                    productPatch.winkelprijs_incl_cents = prijs;
                }
                slot = {
                    organization_id: orgId,
                    volgorde: 0,
                    slot_type: type,
                    naam: a.naam,
                    hoeveelheid: gram ?? 1,
                    eenheid: gram ? 'gram' : 'stuk',
                    per: 'stuk',
                    wisselbaar: false,
                    alternatieven: [],
                };
            } else if (a.inhoud == null || a.inhoud.length === 0) {
                meld(a.slug, 'nog zonder vaste inhoud: artikel zonder slots, dus nog niet op de Toonbank');
            }
            acties.push({
                soort: 'nieuw', slug: a.slug, product, productId: prod?.id ?? null, productPatch, artikel, slot,
                foto: los ? fotoTaak(!!prod?.foto) : null,
            });
            regels.push({
                slug: a.slug, naam: a.naam, kassagroep: a.kassagroep, wat: 'nieuw', prijsCents: prijs, prijsStatus: a.prijs_status,
                actief, opToonbank: kanalen.includes('toonbank') && prijs != null && slot != null, wijzigingen,
            });
            continue;
        }

        /* ── Bestaand artikel ── */
        const artikelPatch: Rij = {};
        const slots = slotsVan.get(art.id) ?? [];
        let nieuwePrijs = art.prijs_cents;

        if (prijs !== art.prijs_cents) {
            if (art.prijs_cents == null || a.prijs_status === 'bevestigd' || a.prijs_status === 'op-de-site') {
                artikelPatch.prijs_cents = prijs;
                nieuwePrijs = prijs;
                wijzigingen.push(`prijs ${euro(art.prijs_cents)} → ${euro(prijs)}`);
            } else {
                meld(a.slug, `voorstel ${euro(prijs)} wijkt af van de prijs die er staat (${euro(art.prijs_cents)}${art.actief ? ', actief' : ''}): blijft ${euro(art.prijs_cents)}`);
            }
        }
        if (prod && los && nieuwePrijs != null && prod.winkelprijs_incl_cents !== nieuwePrijs) {
            const gramKlopt = prod.eenheid === (gram ? 'gram' : 'stuk') && Number(prod.prijs_per) === (gram ?? 1);
            if (gramKlopt) productPatch.winkelprijs_incl_cents = nieuwePrijs;
        }
        if (btwGetal != null && art.btw_pct !== btwGetal) {
            artikelPatch.btw_pct = btwGetal;
            wijzigingen.push(`btw ${art.btw_pct} → ${btwGetal} %`);
        }
        if (a.btw === 'gemengd') {
            if (art.btw_verdeling != null) meld(a.slug, 'er staat een vaste btw-verdeling; de split komt dan niet uit de slots (niet aangeraakt)');
            if (slots.length === 0) meld(a.slug, 'gemengde btw maar geen slots: de kassa rekent alles tegen ' + art.btw_pct + ' %');
        }
        if (art.naam !== a.naam) {
            artikelPatch.naam = a.naam;
            wijzigingen.push(`naam "${art.naam}" → "${a.naam}"`);
        }

        let actief = art.actief;
        if (a.prijs_status === 'ontbreekt' && art.actief) {
            artikelPatch.actief = false;
            actief = false;
            wijzigingen.push('niet actief: geen prijs');
        } else if (!art.actief && art.prijs_cents == null && nieuwePrijs != null && verkoopbaar(a, k)) {
            artikelPatch.actief = true;
            actief = true;
            wijzigingen.push('actief');
        } else if (art.actief && a.prijs_status === 'voorstel') {
            meld(a.slug, `staat al actief met ${euro(art.prijs_cents)}, maar de catalogus noemt de prijs een voorstel: actief gelaten`);
        }

        const kanalen = [...(art.kanalen ?? ['webshop'])];
        if (toonbankMag(a, k) && !kanalen.includes('toonbank')) {
            kanalen.push('toonbank');
            artikelPatch.kanalen = kanalen;
            wijzigingen.push('op de Toonbank');
        }
        if (art.toonbank_groep !== a.kassagroep) artikelPatch.toonbank_groep = a.kassagroep;
        if (art.toonbank_volgorde !== nr) artikelPatch.toonbank_volgorde = nr;

        /* Het product achter een los artikel: op slug, anders via het enige slot. */
        let productId = prod?.id ?? null;
        if (!productId && slots.length === 1) productId = slots[0].standaard_product_id;
        let slot: Rij | null = null;
        if (los && slots.length === 0) {
            if (prod) {
                slot = {
                    organization_id: orgId, volgorde: 0, slot_type: prod.type, naam: prod.naam, hoeveelheid: gram ?? 1,
                    eenheid: gram ? 'gram' : 'stuk', per: 'stuk', wisselbaar: false, alternatieven: [],
                };
                wijzigingen.push('slot naar het product');
            } else {
                meld(a.slug, 'artikel zonder product of slot: niet op de Toonbank tot je het aan een product koppelt (er is niets aangemaakt, om geen tweede voorraad te maken)');
            }
        }
        if (!los && a.allergenen) meld(a.slug, 'allergenen van een pakket hebben geen veld op het artikel (niet geschreven; de kassa kent alleen allergenen per product)');
        if (a.foto && !prod) meld(a.slug, `foto ${a.foto} heeft hier geen product om aan te hangen (niet geüpload)`);
        if (kerst) wijzigingen.push('gekoppeld aan het bestaande kerstaanbod');

        const foto = prod && los ? fotoTaak(!!prod.foto) : null;
        if (foto) wijzigingen.push('foto');
        const opToonbank = kanalen.includes('toonbank') && nieuwePrijs != null && (slots.length > 0 || slot != null)
            && slots.every((s) => s.standaard_product_id != null);
        const iets = Object.keys(artikelPatch).length || Object.keys(productPatch).length || slot || foto;
        if (iets) {
            acties.push({ soort: 'bijwerken', slug: a.slug, artikelId: art.id, artikelPatch, productId, productPatch, slot, foto });
        }
        regels.push({
            slug: a.slug, naam: a.naam, kassagroep: a.kassagroep, wat: iets ? 'bijwerken' : 'gelijk', prijsCents: nieuwePrijs,
            prijsStatus: a.prijs_status, actief, opToonbank, wijzigingen,
        });
    }

    /* ── Wat er staat en niet in de lijst zit: niet actief, nooit weg ── */
    const inLijst = new Set(catalogus.map((a) => a.slug));
    const alUit: string[] = [];
    const behouden: string[] = [];
    for (const art of live.artikelen) {
        if (inLijst.has(art.slug)) continue;
        if (!art.actief) alUit.push(art.slug);
        else if (k.behoud.includes(art.slug)) behouden.push(art.slug);
        else acties.push({ soort: 'niet-actief', slug: art.slug, artikelId: art.id, naam: art.naam });
    }

    return { acties, regels, meldingen, alUit, behouden };
}

/** Kenmerken voor een nieuw product: bij bier wat de catalogus heeft en past, verder leeg (niets verzonnen). */
function kenmerkenVan(a: KassaArtikel): Record<string, unknown> {
    if (a.kassagroep !== 'Bier') return {};
    const d = a.details as { brouwerij?: unknown; stijl?: unknown; verpakking?: unknown };
    const k = bierKenmerkenSchema.safeParse({ brouwerij: d.brouwerij, stijl: d.stijl, verpakking: d.verpakking ?? null, proefkaart: null });
    return k.success ? k.data : {};
}
