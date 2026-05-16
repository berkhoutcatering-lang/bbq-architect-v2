/**
 * Carbon-footprint tracker — Pillar #2 (Verkoop) + 2026-trend.
 *
 * Catering Today / Bradshaw 2026-reports noemen carbon-tracking en ESG-claims
 * als top-3 differentiator voor corporate-events. Geen catering-SaaS doet dit
 * goed op tenant-niveau. Bouw simpel: statische ingredient-factor-tabel,
 * Climatiq-API als upgrade-path.
 *
 * Output: gram CO2e per portie + breakdown per ingredient. Toonbaar in:
 *   - offerte-wizard preview ("Duurzaamheid: 1.2 kg CO2e/pp")
 *   - /q/[id] portal ("Eco-score: B+")
 *   - admin dashboard voor ESG-rapportage corporate-klanten
 *
 * Bron: openLCA / Our World in Data ingredient-emission-factors.
 * Eenheid: g CO2e per kg geserveerd ingredient (cradle-to-gate).
 */

/** g CO2e per kg eindproduct (NL-context, gemiddelde). */
const FACTORS_G_PER_KG: Record<string, number> = {
    // Vlees — hoog
    rundvlees: 27000,
    rund: 27000,
    biefstuk: 27000,
    brisket: 27000,
    entrecote: 27000,
    ribeye: 27000,
    lam: 24000,
    varkensvlees: 7600,
    varken: 7600,
    spareribs: 7600,
    'pulled pork': 7600,
    kip: 4800,
    kalkoen: 4800,
    eend: 5500,

    // Vis & schaaldieren
    zalm: 11800,
    tonijn: 6100,
    kabeljauw: 3500,
    vis: 5500,
    garnalen: 18000,
    schaaldieren: 18000,

    // Zuivel
    kaas: 21000,
    cheddar: 21000,
    parmezaan: 21000,
    boter: 12000,
    melk: 3200,
    yoghurt: 2200,
    room: 9000,
    crème: 9000,

    // Ei
    ei: 4500,
    eieren: 4500,

    // Plantaardig
    tofu: 2000,
    tempeh: 2300,
    seitan: 1900,
    rijst: 4500,
    pasta: 1400,
    brood: 1300,
    aardappel: 600,
    aardappelen: 600,
    groenten: 800,
    salade: 600,
    tomaat: 2100,
    paprika: 1800,
    courgette: 800,
    aubergine: 1700,
    champignon: 2200,
    bonen: 1900,
    linzen: 900,
    kikkererwten: 1500,
    quinoa: 2700,

    // Fruit
    appel: 400,
    peer: 400,
    citroen: 1100,
    avocado: 2300,
    banaan: 800,
    aardbei: 1100,
    framboos: 1500,

    // Granen / nuts
    noten: 2300,
    amandelen: 8500,
    pinda: 2500,
    sesam: 5200,

    // Suiker & olien
    suiker: 3200,
    olie: 6000,
    olijfolie: 6000,
    chocolade: 19000,
    chocolademousse: 8500,
    cacao: 19000,

    // Dranken
    wijn: 1800,
    bier: 1100,

    // Diversen / fallback
    saus: 2500,
    kruiden: 2000,
};

/** Match een ingredient-naam naar een factor, met fuzzy fallback. */
export function lookupCarbonFactor(naam: string): number | null {
    if (!naam) return null;
    const lower = naam.toLowerCase().trim();
    if (FACTORS_G_PER_KG[lower] != null) return FACTORS_G_PER_KG[lower];
    // Probeer woord-prefix-match
    for (const key of Object.keys(FACTORS_G_PER_KG)) {
        if (lower.includes(key)) return FACTORS_G_PER_KG[key];
    }
    return null;
}

interface CarbonIngredient {
    naam: string;
    hoeveelheid?: number; // per portie
    eenheid?: string;
}

export interface CarbonResult {
    total_g_per_pp: number;
    breakdown: Array<{ naam: string; factor_g_per_kg: number; kg_per_pp: number; g_per_pp: number }>;
    matched_count: number;
    unmatched: string[];
    score: 'A' | 'B' | 'C' | 'D';
}

/**
 * Schat de grams CO2e per portie op basis van ingredient-lijst.
 * Onbekende ingredients worden geskipt (telt mee in unmatched).
 * Score-thresholds gebaseerd op gemiddeld NL-diner ~1500g/pp:
 *   < 800g = A (zeer laag, plantaardig)
 *   < 1500g = B (gemiddeld, kip/vis)
 *   < 3000g = C (hoog, varken/rund-component)
 *   ≥ 3000g = D (zeer hoog, vlees-zwaar)
 */
export function estimateCarbon(ingredients: CarbonIngredient[]): CarbonResult {
    const breakdown: CarbonResult['breakdown'] = [];
    const unmatched: string[] = [];
    let total = 0;

    for (const ing of ingredients) {
        const factor = lookupCarbonFactor(ing.naam);
        if (factor == null) {
            unmatched.push(ing.naam);
            continue;
        }
        // Convert hoeveelheid naar kg per portie. Defaults: 100g per portie als
        // onbekend. Unit-detection is bewust simpel — voor v1.
        let kgPerPp = 0.1; // 100g default
        if (typeof ing.hoeveelheid === 'number' && ing.hoeveelheid > 0) {
            const eenheid = (ing.eenheid || 'g').toLowerCase();
            if (eenheid === 'kg') kgPerPp = ing.hoeveelheid;
            else if (eenheid === 'g' || eenheid === 'gr' || eenheid === 'gram') kgPerPp = ing.hoeveelheid / 1000;
            else if (eenheid === 'l' || eenheid === 'liter') kgPerPp = ing.hoeveelheid; // 1L ≈ 1kg water
            else if (eenheid === 'ml') kgPerPp = ing.hoeveelheid / 1000;
            else if (eenheid === 'stuks' || eenheid === 'stuk') kgPerPp = ing.hoeveelheid * 0.05; // 50g per stuk default
            else kgPerPp = ing.hoeveelheid / 1000; // fallback gram
        }
        const gPerPp = factor * kgPerPp;
        breakdown.push({ naam: ing.naam, factor_g_per_kg: factor, kg_per_pp: kgPerPp, g_per_pp: gPerPp });
        total += gPerPp;
    }

    let score: 'A' | 'B' | 'C' | 'D' = 'A';
    if (total >= 3000) score = 'D';
    else if (total >= 1500) score = 'C';
    else if (total >= 800) score = 'B';

    return {
        total_g_per_pp: Math.round(total),
        breakdown: breakdown.sort(function (a, b) { return b.g_per_pp - a.g_per_pp; }).slice(0, 10),
        matched_count: breakdown.length,
        unmatched,
        score,
    };
}

/**
 * Formatteer naar leesbare string voor UI.
 */
export function formatCarbon(g: number): string {
    if (g >= 1000) return (g / 1000).toFixed(1) + ' kg CO₂e';
    return Math.round(g) + ' g CO₂e';
}

export const SCORE_LABELS: Record<'A' | 'B' | 'C' | 'D', { label: string; color: string }> = {
    A: { label: 'Zeer duurzaam', color: '#22c55e' },
    B: { label: 'Goed',          color: '#84cc16' },
    C: { label: 'Gemiddeld',     color: '#f59e0b' },
    D: { label: 'Hoge impact',   color: '#dc2626' },
};
