/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Gedeelde food-cost berekeningen — gebruikt door Offertes, Financien,
 * Gerechten, Service Mode en Menu Engineering.
 *
 * Vóór deze module had elke pagina z'n eigen `calcDishCostPP` met subtiele
 * verschillen (lege-array handling, unit-factor edge cases). Nu één
 * implementatie zodat bug-fixes overal landen.
 */

export interface InventoryLookup {
    naam: string;
    purchase_price?: number;
    unit?: string;
    yield_factor?: number;
}

export interface IngredientCost {
    naam: string;
    qty_pp?: number;
    unit?: string;
    yield?: number;
}

export interface GerechtForCost {
    naam: string;
    ingredient_costs?: IngredientCost[];
    /** Pre-calculated cost-per-portie (ingevuld door AI Wizard, handmatige invoer, of menu-engineering). Wordt gebruikt als fallback wanneer ingredient_costs ontbreekt. */
    kostprijs_pp?: number;
}

/** Lookup inventory-item op normalised naam (case-insensitive trim). */
export function getInvPrice(
    inventory: InventoryLookup[],
    naam: string
): { price: number; unit: string; yield_factor: number } | null {
    if (!naam) return null;
    const target = String(naam).toLowerCase().trim();
    const inv = inventory.find(i => (i.naam || '').toLowerCase().trim() === target);
    if (!inv) return null;
    return {
        price: Number(inv.purchase_price) || 0,
        unit: inv.unit || 'kg',
        yield_factor: Number(inv.yield_factor) || 1.0,
    };
}

/**
 * Bereken food-cost per portie voor één gerecht.
 *
 * Logica:
 *  - Voor elk ingredient: prijs uit inventory × qty_pp ÷ yield-factor
 *  - Unit-conversie: g→kg en ml→L (factor 0.001) als inventory in kg/L staat
 *  - Eigen yield op het ingredient overrulet inventory yield_factor
 */
/** Normalize: lowercase, trim, strip "[SEED]" prefix die seed-data gebruikt
 *  zodat menu_selectie-strings ook matchen op gerecht-namen ongeacht prefix. */
function normalizeName(s: string | undefined | null): string {
    return String(s || '').replace(/^\s*\[seed\]\s*/i, '').toLowerCase().trim();
}

export function calcDishCostPP(
    gerechten: GerechtForCost[],
    inventory: InventoryLookup[],
    gerechtNaam: string
): number {
    if (!gerechtNaam) return 0;
    const target = normalizeName(gerechtNaam);

    // 1) Exact match (na normalize) — meest betrouwbaar
    let gerecht = gerechten.find(g => normalizeName(g.naam) === target);

    // 2) Substring match — voor menu-strings die korter/langer zijn dan gerecht-naam.
    //    Bijvoorbeeld menu="Sliders" matcht "[SEED] Pulled Pork Sliders".
    //    Vereist 4+ tekens overlap om accidentele woord-matches te voorkomen.
    if (!gerecht && target.length >= 4) {
        gerecht = gerechten.find(g => {
            const n = normalizeName(g.naam);
            return n.length >= 4 && (n.includes(target) || target.includes(n));
        });
    }

    if (!gerecht) return 0;

    const costsArray = Array.isArray(gerecht.ingredient_costs) ? gerecht.ingredient_costs : [];

    // Path 1: gedetailleerde ingredient-berekening (gerechten met volledige receptuur)
    if (costsArray.length > 0) {
        return costsArray.reduce((sum, item) => {
            if (!item || !item.naam) return sum;
            const inv = getInvPrice(inventory, item.naam);
            const price = inv ? inv.price : 0;
            const yld = (item.yield || (inv ? inv.yield_factor : 1.0)) || 1.0;
            let unitFactor = 1;
            if (item.unit === 'g' && inv && inv.unit === 'kg') unitFactor = 0.001;
            if (item.unit === 'ml' && inv && inv.unit === 'L') unitFactor = 0.001;
            return sum + ((item.qty_pp || 0) * unitFactor / yld) * price;
        }, 0);
    }

    // Path 2: fallback naar pre-calculated kostprijs_pp (AI-gegenereerde gerechten,
    // handmatig ingevoerd, of geïmporteerd zonder ingredient-detail). Voorkomt
    // €0 foodcost in /financien wanneer gerecht alleen een totaal-kostprijs heeft.
    if (typeof gerecht.kostprijs_pp === 'number' && gerecht.kostprijs_pp > 0) {
        return gerecht.kostprijs_pp;
    }

    return 0;
}

/**
 * Bereken volledige offerte-marge.
 * Single source of truth voor offerte-PnL.
 */
export interface OfferteMargeData {
    gasten: number;
    prijsPP: number;
    omzet: number;
    foodcostPP: number;
    foodcostTotaal: number;
    vasteKosten: number;
    nettoWinst: number;
    margePct: number;
}

export function calcOfferteMarge(
    offerte: Record<string, any>,
    gerechten: GerechtForCost[],
    inventory: InventoryLookup[]
): OfferteMargeData {
    const gasten = offerte.aantal_gasten || (offerte.items?.[0]?.qty) || 0;
    const prijsPP = offerte.basis_prijs_pp || 38.50;
    const omzet = gasten * prijsPP;

    // menu_selectie kan drie vormen hebben:
    //  - legacy array van objects: [{gerecht_naam}, ...]
    //  - object met arrays van objects: {voorgerecht: [{gerecht_naam}], ...}
    //  - object met arrays van strings: {voorgerecht: ["Pinsa", "Carpaccio"]}  ← huidig in DB
    const ms = offerte.menu_selectie;
    const menuGerechten: any[] = Array.isArray(ms)
        ? ms
        : (ms && typeof ms === 'object' ? Object.values(ms).flat() : []);
    let foodcostPP = 0;
    menuGerechten.forEach((sel: any) => {
        const naam = typeof sel === 'string'
            ? sel
            : (sel && (sel.gerecht_naam || sel.naam)) || '';
        if (naam) foodcostPP += calcDishCostPP(gerechten, inventory, naam);
    });
    const foodcostTotaal = foodcostPP * gasten;

    const vk = Array.isArray(offerte.vaste_kosten) ? offerte.vaste_kosten : [];
    const vasteKosten = vk.reduce((s: number, k: any) => s + (parseFloat(k.bedrag) || 0), 0);

    const nettoWinst = omzet - foodcostTotaal - vasteKosten;
    const margePct = omzet > 0 ? (nettoWinst / omzet) * 100 : 0;

    return { gasten, prijsPP, omzet, foodcostPP, foodcostTotaal, vasteKosten, nettoWinst, margePct };
}
