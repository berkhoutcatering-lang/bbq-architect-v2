/**
 * Van de catalogus van de website naar rijen hier (blok C4, 3 oktober 2026).
 * Eenmalig: de 32 bieren, 20 wijnen en 6 stuks vlees die tot nu toe in de
 * website-repo stonden (tests/fixtures/catalogus.json daar) worden
 * winkel_producten met een pagina, plus het artikel voor de losse verkoop en
 * één slot dat naar het product wijst — zo lopen prijs, 18+, voorraad en
 * afboeken via het bestaande kassapad.
 *
 * Zuiver: wat er geschreven wordt, niet hoe. Het script
 * (scripts/importeer-catalogus.ts) doet de opslag en de foto's.
 */
import { KENMERKEN, soortVanType, typeVan, type FotoOpslag, type Paginasoort } from './productsoorten';

/** Wat de website-catalogus per product heeft (de vorm van CatalogusProduct, met de foto als pad op de site). */
export interface SiteProduct {
    soort: Paginasoort;
    slug: string;
    naam: string;
    prijsCenten: number | null;
    eenheid: string;
    alcoholPct: number | null;
    allergenen: string[] | null;
    ingredienten: string[] | null;
    bewaren: string | null;
    lekkerBij: string | null;
    foto: { basis: string; breedte: number; hoogte: number; maten: { w: number; h: number }[]; formaten: ('avif' | 'webp')[] } | null;
    volgorde: number;
    kenmerken: Record<string, unknown>;
    proefkaart?: unknown;
    proefkaartGoedgekeurd?: boolean;
    druivenGecontroleerd?: boolean;
}

/** Tot en met 0,5 % geen alcoholhoudende drank (Alcoholwet): geen 18+, 9 % btw. */
const ALCOHOLVRIJ_TOT = 0.5;

export interface ImportRijen {
    product: Record<string, unknown>;
    artikel: Record<string, unknown>;
    slot: Record<string, unknown>;
}

/** Per 100 gram verkocht vlees telt in gram, de rest per stuk. */
function perGram(p: SiteProduct): boolean {
    return p.soort === 'vlees' && /100 gram/.test(p.eenheid);
}

/**
 * De rijen voor één product. `foto` is waar de bestanden in de bucket komen
 * (of null). Gooit als de kenmerken niet kloppen: liever stoppen dan een
 * halve pagina importeren.
 */
export function importRijen(p: SiteProduct, orgId: string, foto: FotoOpslag | null, nu = new Date().toISOString()): ImportRijen {
    const kenmerken = p.soort === 'bier' ? { ...p.kenmerken, proefkaart: p.proefkaart ?? null } : p.kenmerken;
    const k = KENMERKEN[p.soort].safeParse(kenmerken);
    if (!k.success) throw new Error(`${p.slug}: de kenmerken kloppen niet — ${k.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);

    const type = typeVan(p.soort, p.kenmerken as { soort?: string });
    if (soortVanType(type) !== p.soort) throw new Error(`${p.slug}: type ${type} past niet bij ${p.soort}`);
    const alcohol = p.soort !== 'vlees' && (p.alcoholPct ?? 0) > ALCOHOLVRIJ_TOT;
    const gram = perGram(p);
    const goedgekeurd: Record<string, { op: string; door: null; bron: string }> = {};
    if (p.druivenGecontroleerd) goedgekeurd.druiven = { op: nu, door: null, bron: 'website, druivenGecontroleerd (3 oktober 2026)' };
    if (p.proefkaartGoedgekeurd) goedgekeurd.proefkaart = { op: nu, door: null, bron: 'website, PROEFKAART_GOEDGEKEURD (3 oktober 2026)' };

    const product = {
        organization_id: orgId,
        naam: p.naam,
        type,
        slug: p.slug,
        kenmerken: k.data,
        alcohol,
        alcohol_pct: p.alcoholPct,
        allergenen: p.allergenen,
        ingredienten: p.ingredienten,
        bewaren: p.bewaren,
        lekker_bij: p.lekkerBij,
        foto,
        pagina_status: 'live',
        pagina_volgorde: p.volgorde,
        goedgekeurd,
        eenheid: gram ? 'gram' : 'stuk',
        prijs_per: gram ? 100 : 1,
        winkelprijs_incl_cents: p.prijsCenten,
        btw_pct: alcohol ? 21 : 9,
        actief: true,
    };

    const artikel = {
        organization_id: orgId,
        slug: p.slug,
        naam: p.naam,
        eenheid: p.eenheid,
        telt: 'stuks',
        prijs_cents: p.prijsCenten,
        btw_pct: alcohol ? 21 : 9,
        minimum: 1,
        maximum: null,
        verzendbaar: false,
        gekoeld: p.soort === 'vlees',
        // De afhaaldagen per groep (bier, wijn, vlees), zoals de website ze vraagt (momenten?artikel=<groep>).
        moment_soort: 'moment',
        moment_groep: p.soort,
        capaciteit_soort: 'regel',
        alcohol,
        segment: p.soort === 'bier' || p.soort === 'wijn' ? p.soort : null,
        // Te koop pas met een prijs; de website bewaakt daarnaast de allergenen.
        actief: p.prijsCenten != null,
        publiek: true,
    };

    const slot = {
        organization_id: orgId,
        volgorde: 0,
        slot_type: type,
        naam: p.naam,
        hoeveelheid: gram ? 100 : 1,
        eenheid: gram ? 'gram' : 'stuk',
        per: 'stuk',
        wisselbaar: false,
        alternatieven: [],
    };

    return { product, artikel, slot };
}

/** Waar de foto van een product in de bucket komt: {org}/{slug}-v1, bestanden {basis}-{w}.{formaat}. */
export function fotoBasis(orgId: string, slug: string): string {
    return `${orgId}/${slug}-v1`;
}
