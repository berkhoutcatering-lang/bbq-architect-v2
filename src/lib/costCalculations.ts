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
    /** Soft-FK doel — beste tight-coupling tussen ingredient_costs en inventory.
     *  Pages die deze kolom niet queryen vallen netjes terug op naam-match. */
    id?: number;
    naam: string;
    purchase_price?: number;
    /** Pillar #4 — meest recente leverancier-prijs (uit price_history via trigger).
     *  Wordt geprefereerd boven purchase_price zodat offerte-marge real-time klopt
     *  i.p.v. op stale gemiddelde-inkoop-prijs. Pages die deze kolom niet queryen,
     *  vallen netjes terug op purchase_price. */
    last_price_eur?: number | null;
    last_price_at?: string | null;
    unit?: string;
    yield_factor?: number;
}

export interface IngredientCost {
    naam: string;
    /** Tight-coupling naar inventory.id — overleeft rename van het voorraad-item.
     *  Gevuld bij selectie via InventoryAutocomplete; legacy ingredient_costs hebben dit niet. */
    inventory_id?: number | null;
    qty_pp?: number;
    unit?: string;
    yield?: number;
    /** AI-flag: prijs is een schatting, niet gebaseerd op gemeten voorraad-prijs.
     *  UI toont dan "Geschat €X — verfijn met foto" en biedt screenshot-upload. */
    is_estimated?: boolean;
    estimated_price?: number | null;
}

export interface GerechtForCost {
    naam: string;
    ingredient_costs?: IngredientCost[];
    /** Pre-calculated cost-per-portie (ingevuld door AI Wizard, handmatige invoer, of menu-engineering). Wordt gebruikt als fallback wanneer ingredient_costs ontbreekt. */
    kostprijs_pp?: number;
    /** Componenten-rollup (DB-trigger op gerecht_components). Hardste bron —
     *  wint boven ingredient_costs en kostprijs_pp; zie lib/gerecht-kosten.ts. */
    total_cost_cents?: number | null;
}

/** Lookup inventory-item — eerst op `inventory_id` (tight-coupling, overleeft rename),
 *  daarna fallback op normalised naam-match voor legacy-rijen.
 *  Pillar #4 — prefereert `last_price_eur` (meest recent betaalde leverancier-prijs)
 *  boven `purchase_price` (gemiddelde/standaard). Stop margelek op stale prijzen. */
export function getInvPrice(
    inventory: InventoryLookup[],
    naam: string,
    inventoryId?: number | null
): { price: number; unit: string; yield_factor: number; price_source: 'fresh' | 'stale' | 'missing'; matched_by: 'id' | 'name' } | null {
    let inv: InventoryLookup | undefined;
    let matchedBy: 'id' | 'name' = 'name';

    if (inventoryId && Number.isFinite(inventoryId)) {
        inv = inventory.find(i => i.id === inventoryId);
        if (inv) matchedBy = 'id';
    }

    if (!inv) {
        if (!naam) return null;
        const target = String(naam).toLowerCase().trim();
        inv = inventory.find(i => (i.naam || '').toLowerCase().trim() === target);
    }

    if (!inv) return null;
    const fresh = Number(inv.last_price_eur);
    const stale = Number(inv.purchase_price);
    const price = fresh > 0 ? fresh : stale > 0 ? stale : 0;
    const price_source: 'fresh' | 'stale' | 'missing' =
        fresh > 0 ? 'fresh' : stale > 0 ? 'stale' : 'missing';
    return {
        price,
        unit: inv.unit || 'kg',
        yield_factor: Number(inv.yield_factor) || 1.0,
        price_source,
        matched_by: matchedBy,
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

    // Path 0: componenten-rollup — de hardste bron (DB-trigger houdt 'm bij zodra
    // een component-prijs wijzigt). Rangorde gelijk aan effectieveKostprijsPP:
    // ① rollup > ② voorraad-foodcost > ③ handmatig. Zonder dit pad zag de
    // offerte-marge €0 kostprijs voor gerechten die uit componenten zijn opgebouwd.
    const rollupCents = Number(gerecht.total_cost_cents || 0);
    if (rollupCents > 0) return rollupCents / 100;

    const costsArray = Array.isArray(gerecht.ingredient_costs) ? gerecht.ingredient_costs : [];

    // Path 1: gedetailleerde ingredient-berekening (gerechten met volledige receptuur).
    // Levert dit €0 op (geen enkele ingrediënt-prijs bekend), dan NIET kortsluiten
    // maar doorvallen naar Path 2 — anders blokkeert een lege regel-lijst het
    // kostprijs_pp-vangnet en toont het gerecht alsnog €0.
    if (costsArray.length > 0) {
        const som = costsArray.reduce((sum, item) => {
            if (!item || !item.naam) return sum;
            const inv = getInvPrice(inventory, item.naam, item.inventory_id);
            const price = inv ? inv.price : 0;
            const yld = (item.yield || (inv ? inv.yield_factor : 1.0)) || 1.0;
            let unitFactor = 1;
            if (item.unit === 'g' && inv && inv.unit === 'kg') unitFactor = 0.001;
            if (item.unit === 'ml' && inv && inv.unit === 'L') unitFactor = 0.001;
            return sum + ((item.qty_pp || 0) * unitFactor / yld) * price;
        }, 0);
        if (som > 0) return som;
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
    /** Aantal gerechten in het menu waarvan geen kostprijs bekend is. Zolang dit
     *  boven nul staat is de foodcost onvolledig en is een marge-oordeel
     *  ("Sterk") misleidend — de UI hoort dan te zeggen wat er mist. */
    gerechtenZonderKostprijs: number;
    /** Totaal aantal gerechten in het menu. */
    gerechtenTotaal: number;
}

export function calcOfferteMarge(
    offerte: Record<string, any>,
    gerechten: GerechtForCost[],
    inventory: InventoryLookup[]
): OfferteMargeData {
    const gasten = offerte.aantal_gasten || (offerte.items?.[0]?.qty) || 0;

    /* Omzet komt uit de offerteregels — dat is wat de klant daadwerkelijk
       betaalt en wat het portaal en de factuur tonen. Eerder werd hier
       `basis_prijs_pp` gebruikt: typte je € 42,50 in de regel, dan rekende dit
       blok stug door met de basisprijs van de menukaart (€ 1.155 in plaats van
       € 1.275). Er stond bovendien een hardgecodeerde terugval van € 38,50 —
       een verzonnen prijs voor een offerte zonder basisprijs.
       Zonder regels valt het terug op gasten × basisprijs; ontbreekt die ook,
       dan is de omzet 0 en oordeelt de UI niet. */
    const rawItems = Array.isArray(offerte.items) ? offerte.items : [];
    const regelOmzet = rawItems.reduce(
        (s: number, it: any) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.prijs) || 0),
        0,
    );
    const basisPP = Number(offerte.basis_prijs_pp) || 0;
    const omzet = regelOmzet > 0 ? regelOmzet : gasten * basisPP;
    const prijsPP = gasten > 0 ? omzet / gasten : basisPP;

    // menu_selectie kan drie vormen hebben:
    //  - legacy array van objects: [{gerecht_naam}, ...]
    //  - object met arrays van objects: {voorgerecht: [{gerecht_naam}], ...}
    //  - object met arrays van strings: {voorgerecht: ["Pinsa", "Carpaccio"]}  ← huidig in DB
    const ms = offerte.menu_selectie;
    const menuGerechten: any[] = Array.isArray(ms)
        ? ms
        : (ms && typeof ms === 'object' ? Object.values(ms).flat() : []);
    let foodcostPP = 0;
    let gerechtenTotaal = 0;
    let gerechtenZonderKostprijs = 0;
    menuGerechten.forEach((sel: any) => {
        const naam = typeof sel === 'string'
            ? sel
            : (sel && (sel.gerecht_naam || sel.naam)) || '';
        if (!naam) return;
        gerechtenTotaal += 1;
        const kost = calcDishCostPP(gerechten, inventory, naam);
        if (kost <= 0) gerechtenZonderKostprijs += 1;
        foodcostPP += kost;
    });
    const foodcostTotaal = foodcostPP * gasten;

    const vk = Array.isArray(offerte.vaste_kosten) ? offerte.vaste_kosten : [];
    const vasteKosten = vk.reduce((s: number, k: any) => s + (parseFloat(k.bedrag) || 0), 0);

    const nettoWinst = omzet - foodcostTotaal - vasteKosten;
    const margePct = omzet > 0 ? (nettoWinst / omzet) * 100 : 0;

    return { gasten, prijsPP, omzet, foodcostPP, foodcostTotaal, vasteKosten, nettoWinst, margePct, gerechtenZonderKostprijs, gerechtenTotaal };
}
