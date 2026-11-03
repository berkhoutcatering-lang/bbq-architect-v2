/**
 * Plekken in de winkel en wat daar staat (winkelvloer, eerste stap).
 * Migratie: supabase/migrations/20261102120000_winkel_plekken.sql.
 *
 * Een plek is een rij in opslag_locaties: de ruimte "Winkel" met daaronder
 * afdelingen (Bier, Wijn, Nootjes, Kazen, Vlees). Een plaatsing zegt welk
 * product op welke plek staat; dat is presentatie, geen voorraad.
 *
 * Deze module is zuiver: ze krijgt wat er live staat en zegt wat er
 * aangemaakt moet worden. Het script (scripts/winkel-plekken-inrichten.ts)
 * en het scherm /winkel/vloer doen de opslag.
 */

export const PLEK_SOORTEN = ['ruimte', 'afdeling', 'vitrine', 'stelling', 'kast', 'vrieskist', 'plank'] as const;
export type PlekSoort = (typeof PLEK_SOORTEN)[number];

export const PLEK_SOORT_LABEL: Record<PlekSoort, string> = {
    ruimte: 'Ruimte',
    afdeling: 'Afdeling',
    vitrine: 'Vitrine',
    stelling: 'Stelling',
    kast: 'Kast',
    vrieskist: 'Vrieskist',
    plank: 'Plank',
};

export const PLAATSING_ROLLEN = ['verkoop', 'showmodel', 'reserve'] as const;
export type PlaatsingRol = (typeof PLAATSING_ROLLEN)[number];

/** De ruimte waar de afdelingen onder hangen. */
export const WINKEL_RUIMTE = { code: 'WINKEL', naam: 'Winkel', soort: 'ruimte' as const };

/** De afdelingen van de winkel aan de Tramstraat (Mathijs, 2 november 2026). Bewaren laat hij zelf weten. */
export const WINKEL_AFDELINGEN = [
    { code: 'WINKEL-BIER', naam: 'Bier' },
    { code: 'WINKEL-WIJN', naam: 'Wijn' },
    { code: 'WINKEL-NOOTJES', naam: 'Nootjes' },
    { code: 'WINKEL-KAZEN', naam: 'Kazen' },
    { code: 'WINKEL-VLEES', naam: 'Vlees (slager)' },
    /* 3 november 2026: broodbeleg erbij (de vleeswaren van Veerbeek, patés). */
    { code: 'WINKEL-BROODBELEG', naam: 'Broodbeleg' },
] as const;

export interface LivePlek {
    id: string;
    code: string;
    naam: string;
    soort: string;
    parent_id: string | null;
    volgorde: number;
}

export interface LivePlaatsing {
    id: string;
    product_id: string;
    locatie_id: string;
    rol: string;
    volgorde: number;
}

export interface NieuwePlek {
    code: string;
    naam: string;
    soort: PlekSoort;
    /** Code van de ouder (die kan zelf nieuw zijn). */
    ouderCode: string | null;
    volgorde: number;
}

export interface PlekkenPlan {
    nieuw: NieuwePlek[];
    /** Bestaat al met deze code: niet aangeraakt, ook niet als naam of soort afwijkt. */
    bestaat: { code: string; naam: string; melding: string | null }[];
}

/**
 * Welke plekken er nog moeten komen. De code is de sleutel: een bestaande
 * plek wordt nooit hernoemd of verhangen, alleen gemeld als hij afwijkt.
 */
export function planWinkelPlekken(live: readonly LivePlek[]): PlekkenPlan {
    const op = new Map(live.map((p) => [p.code, p]));
    const nieuw: NieuwePlek[] = [];
    const bestaat: PlekkenPlan['bestaat'] = [];

    const ruimte = op.get(WINKEL_RUIMTE.code);
    if (ruimte) {
        bestaat.push({ code: ruimte.code, naam: ruimte.naam, melding: ruimte.soort !== 'ruimte' ? `is een ${ruimte.soort}, geen ruimte` : null });
    } else {
        nieuw.push({ ...WINKEL_RUIMTE, ouderCode: null, volgorde: 0 });
    }

    WINKEL_AFDELINGEN.forEach((a, i) => {
        const er = op.get(a.code);
        if (!er) {
            nieuw.push({ code: a.code, naam: a.naam, soort: 'afdeling', ouderCode: WINKEL_RUIMTE.code, volgorde: i + 1 });
            return;
        }
        const afwijking: string[] = [];
        if (er.soort !== 'afdeling') afwijking.push(`soort ${er.soort}`);
        if (ruimte && er.parent_id !== ruimte.id) afwijking.push('hangt niet onder de Winkel');
        bestaat.push({ code: er.code, naam: er.naam, melding: afwijking.length ? afwijking.join(', ') : null });
    });

    return { nieuw, bestaat };
}

export interface TePlaatsen {
    productId: string;
    slug: string;
    naam: string;
}

export interface PlaatsingenPlan {
    nieuw: { productId: string; slug: string; naam: string; volgorde: number }[];
    /** Staat al op deze plek (als verkoop): blijft staan. */
    alDaar: string[];
    /** Staat al ergens anders als verkoop: niet verplaatst, alleen gemeld. */
    elders: { slug: string; naam: string }[];
}

/**
 * Producten op een plek zetten (rol verkoop), in de gegeven volgorde, achter
 * wat er al staat. Een product dat al ergens anders verkocht wordt, wordt
 * niet verplaatst: dat beslist Mathijs op de vloer.
 */
export function planPlaatsingen(producten: readonly TePlaatsen[], plekId: string, live: readonly LivePlaatsing[]): PlaatsingenPlan {
    const verkoop = live.filter((p) => p.rol === 'verkoop');
    const hier = new Set(verkoop.filter((p) => p.locatie_id === plekId).map((p) => p.product_id));
    const ergens = new Set(verkoop.filter((p) => p.locatie_id !== plekId).map((p) => p.product_id));
    let volgorde = verkoop.filter((p) => p.locatie_id === plekId).reduce((m, p) => Math.max(m, p.volgorde), 0);

    const plan: PlaatsingenPlan = { nieuw: [], alDaar: [], elders: [] };
    const gezien = new Set<string>();
    for (const p of producten) {
        if (gezien.has(p.productId)) continue;
        gezien.add(p.productId);
        if (hier.has(p.productId)) plan.alDaar.push(p.slug);
        else if (ergens.has(p.productId)) plan.elders.push({ slug: p.slug, naam: p.naam });
        else plan.nieuw.push({ ...p, volgorde: ++volgorde });
    }
    return plan;
}

/** Afdelingen (en dieper) onder een ruimte, in volgorde; voor het scherm. */
export function plekkenOnder(plekken: readonly LivePlek[], ouderId: string): LivePlek[] {
    return plekken.filter((p) => p.parent_id === ouderId).sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam, 'nl'));
}

/** Een vrije code voor een nieuwe plek onder een ouder: WINKEL-KOFFIE, WINKEL-KOFFIE-2, … */
export function codeVoor(naam: string, ouderCode: string, bestaand: ReadonlySet<string>): string {
    const stam = naam
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        .slice(0, 24) || 'PLEK';
    const basis = `${ouderCode}-${stam}`;
    if (!bestaand.has(basis)) return basis;
    for (let i = 2; ; i++) if (!bestaand.has(`${basis}-${i}`)) return `${basis}-${i}`;
}
