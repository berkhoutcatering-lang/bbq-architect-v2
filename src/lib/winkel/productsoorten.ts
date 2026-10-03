/**
 * De catalogus: wat een product met een eigen pagina is, per soort.
 * Plan: docs/OPDRACHT-BBQ-ARCHITECT-CATALOGUS.md (blokken C1–C2).
 *
 * Toevoegen gebeurt op één plek — hier, in BBQ Architect — en de website,
 * de webshop en straks de kassa lezen dezelfde rij (`winkel_producten`).
 * De vormen hieronder zijn één-op-één die van de website (`Bier`,
 * `Proefkaart`, `Wijn`, `Vlees` in lib/content/ van hopbites.nl), zodat de
 * pagina's daar niet veranderen: alleen hun bron.
 *
 * Zuiver: geen database, geen Next. De database-poort
 * (`winkel_catalogus_poort`, migratie 20261003120000) weigert hetzelfde als
 * `watOntbreekt()` hieronder — de app zegt het eerst in gewone taal.
 */
import { z } from 'zod';

/* ── Soorten ──────────────────────────────────────────────────────────────── */

/** De soorten met een eigen pagina op de website, en het producttype in de database. */
export const PAGINASOORTEN = ['bier', 'wijn', 'vlees'] as const;
export type Paginasoort = (typeof PAGINASOORTEN)[number];

/** Online voor afhaal alleen drank onder de 15 % (besluit 26 september 2026). */
export const ONLINE_ALCOHOL_TOT = 15;
/** Tot en met 1,2 % zijn de ingrediënten verplicht (alcoholvrij). */
export const INGREDIENTEN_VERPLICHT_TOT = 1.2;

/** Het type in winkel_producten bij een soort (vers vlees is vleeswaar, droge worst is worst). */
export function typeVan(soort: Paginasoort, kenmerken?: { soort?: string }): string {
    if (soort === 'vlees') return kenmerken?.soort === 'vers' ? 'vleeswaar' : 'worst';
    return soort;
}

/** De soort bij een producttype; null = geen eigen pagina. */
export function soortVanType(type: string): Paginasoort | null {
    if (type === 'bier' || type === 'wijn') return type;
    if (type === 'worst' || type === 'vleeswaar') return 'vlees';
    return null;
}

/* ── Kenmerken per soort ──────────────────────────────────────────────────── */

const tekst = z.string().trim().min(1).max(2000);
const kort = z.string().trim().min(1).max(200);

export const SMAKEN = ['bitter', 'zoet', 'moutig', 'fruitig', 'zuur', 'body'] as const;
const score = z.number().int().min(1).max(5);

export const proefkaartSchema = z.object({
    plaats: kort,
    land: kort,
    brouwerij: tekst,
    oorsprong: tekst,
    smaak: tekst,
    gebrouwenMet: z.array(kort).max(20),
    ibu: z.number().int().min(0).max(200).nullable(),
    palet: z.object({ bitter: score, zoet: score, moutig: score, fruitig: score, zuur: score, body: score }),
});
export type Proefkaart = z.infer<typeof proefkaartSchema>;

export const bierKenmerkenSchema = z.object({
    brouwerij: kort,
    stijl: kort,
    verpakking: z.object({ soort: z.enum(['fles', 'blik']), cl: z.number().positive().max(300) }).nullable(),
    proefkaart: proefkaartSchema.nullable().optional(),
});
export type BierKenmerken = z.infer<typeof bierKenmerkenSchema>;

export const WIJNTYPES = ['wit', 'rood', 'rosé', 'mousserend', 'dessert', 'port', 'alcoholvrij'] as const;

export const wijnKenmerkenSchema = z.object({
    producent: kort,
    jaargang: z.string().trim().regex(/^(\d{4}|n\.v\.)$/),
    wijnType: z.enum(WIJNTYPES),
    land: kort,
    regio: kort,
    appellatie: z.string().trim().max(200),
    druiven: z.array(kort).max(12),
    biologisch: z.boolean(),
    huiswijn: z.boolean(),
    inhoud: kort,
    stijl: kort,
    smaak: tekst,
    omschrijving: tekst,
    pastBij: tekst,
    serveertemperatuur: kort,
});
export type WijnKenmerken = z.infer<typeof wijnKenmerkenSchema>;

export const vleesKenmerkenSchema = z.object({
    soort: z.enum(['vers', 'droge-worst']),
    fotoAlt: kort,
    alleenKaartformaat: z.boolean(),
});
export type VleesKenmerken = z.infer<typeof vleesKenmerkenSchema>;

export const KENMERKEN = { bier: bierKenmerkenSchema, wijn: wijnKenmerkenSchema, vlees: vleesKenmerkenSchema } as const;

/** Lege kenmerken voor een nieuw concept: alles leeg, niets verzonnen. */
export function legeKenmerken(soort: Paginasoort): Record<string, unknown> {
    if (soort === 'bier') return { brouwerij: '', stijl: '', verpakking: null, proefkaart: null };
    if (soort === 'wijn') {
        return {
            producent: '', jaargang: 'n.v.', wijnType: 'rood', land: '', regio: '', appellatie: '', druiven: [],
            biologisch: false, huiswijn: false, inhoud: '0,75 L', stijl: '', smaak: '', omschrijving: '', pastBij: '', serveertemperatuur: '',
        };
    }
    return { soort: 'droge-worst', fotoAlt: '', alleenKaartformaat: false };
}

/* ── Slug ─────────────────────────────────────────────────────────────────── */

/** 'Rochefort 8' → 'rochefort-8'; 'Bräuweisse' → 'brauweisse'. */
export function maakSlug(...delen: string[]): string {
    return delen
        .join(' ')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/&/g, ' en ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
        .replace(/-+$/g, '');
}

/* ── De rij uit de database ───────────────────────────────────────────────── */

export interface ProductRij {
    id: string;
    naam: string;
    type: string;
    slug: string | null;
    kenmerken: Record<string, unknown>;
    alcohol: boolean;
    alcohol_pct: number | string | null;
    allergenen: string[] | null;
    ingredienten: string[] | null;
    bewaren: string | null;
    lekker_bij: string | null;
    foto: FotoOpslag | null;
    pagina_status: 'geen' | 'concept' | 'live';
    pagina_volgorde: number | null;
    goedgekeurd: Record<string, { door?: string; op?: string } | undefined>;
    actief: boolean;
    updated_at: string;
}

/** De foto zoals hij in de bucket staat: {basis}-{w}.{formaat}. */
export const fotoOpslagSchema = z.object({
    basis: z.string().min(3).max(300).regex(/^[0-9a-f-]{36}\/[a-z0-9-]+$/),
    breedte: z.number().int().positive(),
    hoogte: z.number().int().positive(),
    maten: z.array(z.object({ w: z.number().int().positive(), h: z.number().int().positive() })).min(1).max(8),
    formaten: z.array(z.enum(['avif', 'webp'])).min(1),
});
export type FotoOpslag = z.infer<typeof fotoOpslagSchema>;

/** Het artikel van de losse verkoop: dezelfde slug, de prijs die de kassa rekent. */
export interface ArtikelRij {
    slug: string;
    eenheid: string;
    prijs_cents: number | null;
    actief: boolean;
    publiek: boolean;
}

/** De kolommen die de catalogus leest — nooit inkoop, leverancier of marge. */
export const CATALOGUS_PRODUCT_KOLOMMEN =
    'id, naam, type, slug, kenmerken, alcohol, alcohol_pct, allergenen, ingredienten, bewaren, lekker_bij, foto, pagina_status, pagina_volgorde, goedgekeurd, actief, updated_at';
export const CATALOGUS_ARTIKEL_KOLOMMEN = 'slug, eenheid, prijs_cents, actief, publiek';

/* ── Wat de website krijgt ────────────────────────────────────────────────── */

interface CatalogusBasis {
    slug: string;
    naam: string;
    /** Wat de kassa rekent, incl. btw. null = prijs volgt (de website toont het dan niet als koopbaar). */
    prijsCenten: number | null;
    /** 'per stuk', 'per 100 gram' — van het artikel. */
    eenheid: string;
    alcoholPct: number | null;
    allergenen: string[] | null;
    ingredienten: string[] | null;
    bewaren: string | null;
    lekkerBij: string | null;
    /**
     * De foto: `basis` is de publieke URL zonder maat en extensie, de bestanden
     * zijn `{basis}-{w}.{formaat}` — dezelfde vorm als het beeldregister van de
     * website. null: de website toont de kaart in letters.
     */
    foto: (FotoOpslag & { basis: string }) | null;
    volgorde: number;
    /** Een concept (alleen via een voorbeeldlink). */
    concept: boolean;
    bijgewerkt: string;
}

export type CatalogusProduct =
    /* De proefkaart gaat mee met zijn stand: de website toont hem alleen als
       hij goedgekeurd is (in de demo altijd) — net als de druiven bij wijn. */
    | (CatalogusBasis & { soort: 'bier'; kenmerken: Omit<BierKenmerken, 'proefkaart'>; proefkaart: Proefkaart | null; proefkaartGoedgekeurd: boolean })
    | (CatalogusBasis & { soort: 'wijn'; kenmerken: WijnKenmerken; druivenGecontroleerd: boolean })
    | (CatalogusBasis & { soort: 'vlees'; kenmerken: VleesKenmerken });

export interface Catalogus {
    versie: 1;
    producten: CatalogusProduct[];
}

/** De foto met een publieke basis-URL in de bucket. Een kapotte foto = geen foto. */
export function fotoVoorSite(supabaseUrl: string, foto: unknown): CatalogusBasis['foto'] {
    const f = fotoOpslagSchema.safeParse(foto);
    if (!f.success) return null;
    return { ...f.data, basis: `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/winkel-fotos/${f.data.basis}` };
}

function getal(x: number | string | null): number | null {
    if (x === null || x === undefined || x === '') return null;
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
}

/**
 * Een rij plus zijn artikel → wat de website krijgt. null als de rij geen
 * pagina is of zijn kenmerken niet kloppen: liever weglaten dan half tonen.
 * Wat de AI invulde (proefkaart, druiven) gaat mee met de vlag of Mathijs het
 * goedkeurde; de website toont het pas dan.
 */
export function naarCatalogus(rij: ProductRij, artikel: ArtikelRij | null, supabaseUrl: string): CatalogusProduct | null {
    const soort = soortVanType(rij.type);
    if (!soort || !rij.slug) return null;
    const basis: CatalogusBasis = {
        slug: rij.slug,
        naam: rij.naam,
        prijsCenten: artikel?.actief ? artikel.prijs_cents : null,
        eenheid: artikel?.eenheid ?? 'per stuk',
        alcoholPct: getal(rij.alcohol_pct),
        allergenen: rij.allergenen?.length ? rij.allergenen : null,
        ingredienten: rij.ingredienten?.length ? rij.ingredienten : null,
        bewaren: rij.bewaren || null,
        lekkerBij: rij.lekker_bij || null,
        foto: fotoVoorSite(supabaseUrl, rij.foto),
        volgorde: rij.pagina_volgorde ?? 9999,
        concept: rij.pagina_status !== 'live',
        bijgewerkt: rij.updated_at,
    };
    const goed = (groep: string) => Boolean(rij.goedgekeurd?.[groep]?.op);

    if (soort === 'bier') {
        const k = bierKenmerkenSchema.safeParse(rij.kenmerken);
        if (!k.success) return null;
        const { proefkaart, ...kenmerken } = k.data;
        return { ...basis, soort, kenmerken, proefkaart: proefkaart ?? null, proefkaartGoedgekeurd: Boolean(proefkaart) && goed('proefkaart') };
    }
    if (soort === 'wijn') {
        const k = wijnKenmerkenSchema.safeParse(rij.kenmerken);
        if (!k.success) return null;
        return { ...basis, soort, kenmerken: k.data, druivenGecontroleerd: goed('druiven') };
    }
    const k = vleesKenmerkenSchema.safeParse(rij.kenmerken);
    if (!k.success) return null;
    return { ...basis, soort, kenmerken: k.data };
}

/* ── Wat er nog ontbreekt voor live ───────────────────────────────────────── */

/**
 * Wat er nog moet gebeuren voordat een product live kan, in gewone taal —
 * dezelfde regels als de database-poort (WC001–WC005). Leeg = klaar.
 */
export function watOntbreekt(rij: Pick<ProductRij, 'type' | 'slug' | 'foto' | 'allergenen' | 'ingredienten' | 'bewaren' | 'alcohol' | 'alcohol_pct' | 'kenmerken'>, artikel: Pick<ArtikelRij, 'prijs_cents'> | null): string[] {
    const uit: string[] = [];
    const soort = soortVanType(rij.type);
    if (!soort) return ['Dit soort product heeft geen eigen pagina.'];
    if (!rij.slug) uit.push('nog geen adres (slug)');
    if (!KENMERKEN[soort].safeParse(rij.kenmerken).success) uit.push(soort === 'bier' ? 'brouwerij, stijl of verpakking' : soort === 'wijn' ? 'de wijngegevens zijn nog niet compleet' : 'de soort of de fototekst');
    if (!fotoOpslagSchema.safeParse(rij.foto).success) uit.push('nog geen foto');
    if (!artikel || artikel.prijs_cents == null) uit.push('nog geen prijs');
    if (!rij.allergenen?.length) uit.push('nog geen allergenen (van het etiket)');
    const pct = getal(rij.alcohol_pct);
    if (rij.alcohol && pct == null) uit.push('nog geen alcoholpercentage');
    if (rij.alcohol && pct != null && pct >= ONLINE_ALCOHOL_TOT) uit.push(`${String(pct).replace('.', ',')} % — online alleen onder de ${ONLINE_ALCOHOL_TOT} %`);
    if (soort === 'vlees' && !rij.ingredienten?.length) uit.push('nog geen ingrediënten');
    if (soort === 'vlees' && !rij.bewaren) uit.push('nog niet hoe je het bewaart');
    if (soort !== 'vlees' && pct != null && pct <= INGREDIENTEN_VERPLICHT_TOT && !rij.ingredienten?.length) uit.push('alcoholvrij: de ingrediënten van het etiket');
    return uit;
}
