/**
 * Gedeelde MenuData-shape voor alle menukaart-templates.
 *
 * Geport vanaf het zip-prototype (`menu-data.js`) naar TypeScript. Bevat:
 *   - MenuData / MenuGang / MenuDish types
 *   - ALLERGEN_MAP — EU 1169/2011 codes naar volledige Nederlandse namen
 *   - getUsedAllergens() — verzamel gebruikte allergenen uit alle gerechten
 *   - contrastTextColor() — bepaal witte of donkere tekst tegen gegeven hex
 *   - DEMO_MENU — Hop & Bites-style mock data voor editor-preview wanneer
 *     de offerte nog geen menu heeft
 *
 * Hard rule (BBQ Architect): allergenen NOOIT AI-gegenereerd; ze komen uit
 * de recipe_allergens join-tabel. ALLERGEN_MAP is alleen het label voor
 * de UI/PDF, niet de bron van waarheid.
 */

/** Eén gerecht binnen een gang. */
export type MenuDish = {
    name: string;
    description?: string;
    /** EU 1169/2011 codes — bv ["G","E","Sd","M"]. Komt uit recipe_allergens. */
    allergens?: string[];
};

/** Eén gang (course) in het menu. */
export type MenuGang = {
    /** Optioneel boven-label, bv "GANG 01". Templates bouwen dit vaak zelf op via index. */
    eyebrow?: string;
    name: string;
    description?: string;
    dishes: MenuDish[];
};

/** Volledig menu-object dat templates ontvangen. */
export type MenuData = {
    gangen: MenuGang[];
    /** Tenant-logo URL — komt uit settings.logo_url. */
    logoUrl?: string | null;
    /** Donker-logo URL voor templates met donkere achtergrond (smokehouse, duotone). Komt uit settings.logo_dark_url. */
    logoUrlDonker?: string | null;
};

/**
 * EU 1169/2011 allergeen-codes (NL).
 * Source: bijlage II Verordening (EU) 1169/2011 — verplichte allergenen-lijst.
 */
export const ALLERGEN_MAP: Record<string, string> = {
    G: 'Gluten',
    L: 'Lactose',
    N: 'Noten',
    V: 'Vis',
    E: 'Ei',
    S: 'Soja',
    Sd: 'Sesam',
    M: 'Mosterd',
    W: 'Weekdieren',
    Sl: 'Selderij',
    Lp: 'Lupine',
    Sf: 'Sulfiet',
    Sc: 'Schaaldieren',
    P: 'Pinda',
};

/** Verzamel alle unieke allergeen-codes uit alle gerechten, gesorteerd. */
export function getUsedAllergens(gangen: MenuGang[]): string[] {
    const s = new Set<string>();
    for (const g of gangen) {
        for (const d of g.dishes) {
            for (const a of d.allergens ?? []) {
                if (ALLERGEN_MAP[a]) s.add(a);
            }
        }
    }
    return [...s].sort();
}

/**
 * Format de allergeen-legenda als `"G = Gluten · L = Lactose"`-string.
 * Templates die een eigen layout willen, lopen liever rechtstreeks over
 * `getUsedAllergens()` heen.
 */
export function formatAllergenLegend(gangen: MenuGang[]): string {
    return getUsedAllergens(gangen)
        .map(a => `${a} = ${ALLERGEN_MAP[a]}`)
        .join('  ·  ');
}

/**
 * Verzamel allergenen die in een specifieke gang voorkomen (voor footnote-stijl
 * templates zoals editorial-01 en tasting-01).
 */
export function gangAllergens(gang: MenuGang): string[] {
    const s = new Set<string>();
    for (const d of gang.dishes) {
        for (const a of d.allergens ?? []) {
            if (ALLERGEN_MAP[a]) s.add(a);
        }
    }
    return [...s].sort();
}

/**
 * Bepaal of zwart of wit beter contrasteert tegen de gegeven hex-kleur.
 * Gebruikt door templates met brand-primary achtergrond (modern-01 sidebar,
 * duotone-01 bottom-bar, square-01 diagonal band, smokehouse-01 legend-bar).
 *
 * Relatieve luminantie via ITU-R BT.601 coefficienten (0.299/0.587/0.114).
 * Drempel 0.45 ipv 0.5 zodat gouden / oranje brand-tinten witte tekst krijgen.
 */
export function contrastTextColor(hex: string): '#1A1A1A' | '#FFFFFF' {
    const h = hex.replace('#', '');
    if (h.length !== 6) return '#FFFFFF';
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some(x => Number.isNaN(x))) return '#FFFFFF';
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.45 ? '#1A1A1A' : '#FFFFFF';
}

/**
 * Empty-state menu — gebruikt in productie-PDF wanneer een event nog geen
 * gerechten heeft gekoppeld. NOOIT DEMO_MENU naar productie laten lekken
 * (klant zou Hop & Bites-demo zien onder hun eigen logo).
 */
export function emptyMenu(logoUrl: string | null = null, logoUrlDonker: string | null = null): MenuData {
    return {
        gangen: [
            {
                eyebrow: '',
                name: 'Menu nog niet ingesteld',
                description: 'Voeg gerechten toe aan het event om de menukaart te vullen.',
                dishes: [],
            },
        ],
        logoUrl,
        logoUrlDonker,
    };
}

/**
 * Demo-menu — gebruikt door de EDITOR (offerte-pagina + /q/[id] preview) wanneer
 * de offerte nog geen menu heeft. 4 gangen, 12 gerechten, mix van allergenen —
 * dekt alle render-paden af (inline allergens, footnote-style, dish.description,
 * gang.description).
 *
 * NOOIT gebruiken in de productie-PDF — daar is `emptyMenu()` de fallback.
 */
export const DEMO_MENU: MenuData = {
    gangen: [
        {
            eyebrow: 'GANG 01',
            name: 'Ontvangst',
            description:
                'Welkom met een selectie van huisgemaakte hapjes, vers van de grill geserveerd bij aankomst.',
            dishes: [
                {
                    name: 'Pulled Pork Brioche',
                    description: '12 uur gerookt op hickory, met huisgemaakte coleslaw en pickles.',
                    allergens: ['G', 'E', 'Sd', 'M'],
                },
                {
                    name: 'Brisket Crostini',
                    description:
                        'Flinterdunne plakjes Texas-style brisket op geroosterd zuurdesembrood met truffelmayonaise.',
                    allergens: ['G', 'E'],
                },
                {
                    name: 'Gegrilde Watermeloen',
                    description: 'Met feta, munt en een vleugje chilivlokken.',
                    allergens: ['L'],
                },
            ],
        },
        {
            eyebrow: 'GANG 02',
            name: 'Van de Smoker',
            description:
                'Het hart van ons menu — low & slow bereid op onze offset smokers met kersen- en eikenhout.',
            dishes: [
                {
                    name: 'Beef Brisket 14h',
                    description:
                        'Ons signature gerecht. Point en flat, beide serveerbaar. Huisgemaakte BBQ-saus apart.',
                    allergens: ['Sf', 'Sl'],
                },
                {
                    name: 'Pulled Pork Shoulder',
                    description: 'Langzaam gegaard tot hij uit elkaar valt, met Carolina mustard glaze.',
                    allergens: ['M', 'Sf'],
                },
                {
                    name: 'Lamb Ribs',
                    description: 'Chipotle-honing glaze, zes uur op lage temperatuur.',
                    allergens: [],
                },
                {
                    name: 'Portobello uit de Smoker',
                    description: 'Gevuld met geitenkaas, walnoot en rozemarijn. Vegetarische signature.',
                    allergens: ['L', 'N'],
                },
            ],
        },
        {
            eyebrow: 'GANG 03',
            name: 'Bijgerechten',
            description: 'Vers en huisgemaakt — de perfecte begeleiders bij het gerookte vlees.',
            dishes: [
                {
                    name: 'Coleslaw Classic',
                    description: 'Witte kool, wortel en rode ui in een romige dressing.',
                    allergens: ['E', 'M'],
                },
                {
                    name: 'Smoked Mac & Cheese',
                    description: 'Drie kazen, een uur meegerookt voor die diepe smaak.',
                    allergens: ['G', 'L'],
                },
                {
                    name: 'Cornbread',
                    description: 'Met jalapeño en cheddar, vers uit de Dutch oven.',
                    allergens: ['G', 'L', 'E'],
                },
            ],
        },
        {
            eyebrow: 'GANG 04',
            name: 'Dessert',
            description: 'Zoete afsluiter met een vleugje rook.',
            dishes: [
                {
                    name: 'Smoked Pecan Pie',
                    description: 'Klassiek Amerikaans, met gerookte pecannoten en bourbon-karamel.',
                    allergens: ['G', 'N', 'E', 'L'],
                },
                {
                    name: 'Gegrilde Ananas',
                    description: 'Met kokosijs en een druppel rum-karamelsaus.',
                    allergens: ['L'],
                },
            ],
        },
    ],
};
