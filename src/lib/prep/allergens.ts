/**
 * EU-14 allergenen — visuele metadata.
 *
 * Verordening (EU) 1169/2011 verplicht 14 hoofdallergenen op horecakaarten.
 * Het `Allergen` type bestaat al in [allergenDetect.ts](src/lib/allergenDetect.ts);
 * deze module voegt enkel de visuele laag toe (kleur, icoon, severity-hint)
 * voor Prep-KDS en floor-plan rendering.
 *
 * Hard rule: deze meta wordt NOOIT door AI gegenereerd. Codes komen uit de
 * `event_allergies` tabel of handmatige chef-input.
 */

import type { Allergen } from '../allergenDetect';

export type { Allergen };

export type AllergenColorToken =
    | 'amber'  // gluten/wortel-allergenen
    | 'blue'   // lactose/melkproducten
    | 'yellow' // ei
    | 'red'    // noten (kritisch — anafylaxie)
    | 'orange' // pinda (idem kritisch)
    | 'green'  // soja (plantaardig context)
    | 'cyan'   // vis
    | 'teal'   // schaal-/weekdieren
    | 'purple' // selderij/mosterd/sesam
    | 'pink'   // sulfiet
    | 'lime'   // lupine
    | 'zinc';  // overig fallback

export type AllergenSeverityDefault = 'normal' | 'high' | 'critical';

export interface AllergenMeta {
    /** EU14 code uit `allergenDetect.ts`. */
    code: Allergen;
    /** Nederlandse weergave-naam (Title Case). */
    label: string;
    /** Korte 1-letter / 2-letter code voor pin-badges en kompakte print. */
    badge: string;
    /** Semantic color-token (overlapt met `--pill-*` in globals.css). */
    color: AllergenColorToken;
    /** lucide-react icon name (string — caller lookt 'm op). */
    icon: string;
    /** Default-severity advies — anafylaxie-risico krijgt 'critical'. */
    severityDefault: AllergenSeverityDefault;
    /** Beschrijving voor tooltips / printlegenda. */
    description: string;
}

/**
 * Canonieke meta voor elk van de 14 EU-allergenen.
 * Volgorde van EU-bijlage II (1169/2011 art 21).
 *
 * Anafylaxie-risico: noten + pinda + schaaldieren krijgen severityDefault='critical'
 * omdat het levensgevaarlijk kan zijn. Chef kan dit overrulen per gast.
 */
export const ALLERGEN_META: Record<Allergen, AllergenMeta> = {
    gluten: {
        code: 'gluten',
        label: 'Gluten',
        badge: 'GL',
        color: 'amber',
        icon: 'Wheat',
        severityDefault: 'high',
        description: 'Tarwe, spelt, gerst, rogge, haver, kamut en producten daarvan.',
    },
    lactose: {
        code: 'lactose',
        label: 'Melk',
        badge: 'M',
        color: 'blue',
        icon: 'Milk',
        severityDefault: 'high',
        description: 'Melk en producten op basis van melk, inclusief lactose.',
    },
    ei: {
        code: 'ei',
        label: 'Ei',
        badge: 'EI',
        color: 'yellow',
        icon: 'Egg',
        severityDefault: 'high',
        description: 'Eieren en producten met eieren.',
    },
    noten: {
        code: 'noten',
        label: 'Noten',
        badge: 'N',
        color: 'red',
        icon: 'Nut',
        severityDefault: 'critical',
        description: 'Boomnoten: amandel, hazelnoot, walnoot, cashew, pecan, paranoot, pistache, macadamia.',
    },
    pinda: {
        code: 'pinda',
        label: 'Pinda',
        badge: 'P',
        color: 'orange',
        icon: 'Nut',
        severityDefault: 'critical',
        description: 'Pinda en producten op basis van pinda (peulvrucht, anafylaxie-risico).',
    },
    soja: {
        code: 'soja',
        label: 'Soja',
        badge: 'S',
        color: 'green',
        icon: 'Bean',
        severityDefault: 'normal',
        description: 'Sojabonen en producten daarvan (sojasaus, tofu, tempeh).',
    },
    vis: {
        code: 'vis',
        label: 'Vis',
        badge: 'V',
        color: 'cyan',
        icon: 'Fish',
        severityDefault: 'high',
        description: 'Vis en producten op basis van vis.',
    },
    schaaldieren: {
        code: 'schaaldieren',
        label: 'Schaaldieren',
        badge: 'SC',
        color: 'teal',
        icon: 'Shrimp',
        severityDefault: 'critical',
        description: 'Garnaal, kreeft, krab, scampi, langoustine (anafylaxie-risico).',
    },
    weekdieren: {
        code: 'weekdieren',
        label: 'Weekdieren',
        badge: 'WD',
        color: 'teal',
        icon: 'Shell',
        severityDefault: 'high',
        description: 'Mossel, oester, inktvis, octopus, sint-jakob, kokkel.',
    },
    selderij: {
        code: 'selderij',
        label: 'Selderij',
        badge: 'SE',
        color: 'purple',
        icon: 'Leaf',
        severityDefault: 'normal',
        description: 'Selderij, knolselderij, bleekselderij en producten daarvan.',
    },
    mosterd: {
        code: 'mosterd',
        label: 'Mosterd',
        badge: 'MO',
        color: 'purple',
        icon: 'Droplet',
        severityDefault: 'normal',
        description: 'Mosterd, mosterdzaad en producten op basis van mosterd.',
    },
    sesam: {
        code: 'sesam',
        label: 'Sesam',
        badge: 'SZ',
        color: 'purple',
        icon: 'Sparkles',
        severityDefault: 'high',
        description: 'Sesamzaad, sesamolie, tahini.',
    },
    sulfiet: {
        code: 'sulfiet',
        label: 'Sulfiet',
        badge: 'SU',
        color: 'pink',
        icon: 'Wine',
        severityDefault: 'normal',
        description: 'Zwaveldioxide en sulfieten (E220-E228) in wijn, gedroogde vruchten, zuurkool.',
    },
    lupine: {
        code: 'lupine',
        label: 'Lupine',
        badge: 'LU',
        color: 'lime',
        icon: 'Flower',
        severityDefault: 'normal',
        description: 'Lupinemeel en lupineproducten.',
    },
};

/** Geordende lijst voor UI-rendering. */
export const ALL_ALLERGENS: AllergenMeta[] = (Object.values(ALLERGEN_META) as AllergenMeta[]);

/**
 * Bereken hoogste severity uit een set allergenen.
 * Voor floor-plan pin-rendering: pin met ≥1 critical = rood ring;
 * pin met alleen high = amber; normal = brand-tint.
 */
export function highestSeverity(
    codes: readonly Allergen[],
): AllergenSeverityDefault {
    let max: AllergenSeverityDefault = 'normal';
    for (const code of codes) {
        const sev = ALLERGEN_META[code]?.severityDefault ?? 'normal';
        if (sev === 'critical') return 'critical';
        if (sev === 'high') max = 'high';
    }
    return max;
}

/**
 * Bereken voor floor-plan rendering welk primair allergeen de pin-ring
 * krijgt: critical > high > normal, dan eerste-in-lijst tie-break.
 */
export function primaryAllergen(
    codes: readonly Allergen[],
): Allergen | null {
    if (codes.length === 0) return null;
    const sorted = [...codes].sort((a, b) => {
        const sevA = ALLERGEN_META[a]?.severityDefault ?? 'normal';
        const sevB = ALLERGEN_META[b]?.severityDefault ?? 'normal';
        const rank = { critical: 0, high: 1, normal: 2 };
        return rank[sevA] - rank[sevB];
    });
    return sorted[0] ?? null;
}

/**
 * Type-guard zodat invoer-validators kunnen filteren op echte EU-codes
 * (geen vrije strings naar de database).
 */
export function isAllergen(value: unknown): value is Allergen {
    return (
        typeof value === 'string' &&
        Object.prototype.hasOwnProperty.call(ALLERGEN_META, value)
    );
}

/** Filter een onbekende-string-array tot een lijst van geldige EU-codes. */
export function sanitizeAllergens(input: readonly unknown[]): Allergen[] {
    const seen = new Set<Allergen>();
    for (const x of input) {
        if (isAllergen(x)) seen.add(x);
    }
    return Array.from(seen);
}
