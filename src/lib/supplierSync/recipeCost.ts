/* supplierSync/recipeCost — de brug van een goedgekeurde leveranciersprijs naar
 * de receptkostprijs. Volgt de canonieke keten (briefing §12.6, ADR-5):
 *
 *   component_ingredient → inventory.preferred_supplier_product_id
 *                        → supplier_products.current_price → base cost → yield.
 *
 * NOOIT via id-gelijkheid tussen Catalogus A (master_products/supplier_prices) en
 * Catalogus B (supplier_products) — dat is exact de bug die migratie
 * 20260722120000 neutraliseerde. Puur en testbaar.
 */

import { packToBase, type BaseFields, type PackUnit } from '../unitPrice';

/** Minimale supplier_product-vorm die we nodig hebben voor de kostprijs. */
export interface SupplierProductCostRow {
    price_cents: number;                 // pakprijs ex BTW (package-basis) OF per-eenheid (kg/liter/stuk-basis)
    unit: string | null;                 // display/sales-eenheid ('kg','liter','stuk','g','ml')
    package_size: number | null;         // totale basisinhoud (bv. 2500) voor package-basis
    package_unit: string | null;         // 'g' | 'ml' | 'stuk'
    total_base_quantity?: number | null; // idem als package_size (voorkeur)
    base_unit?: string | null;           // 'g' | 'ml' | 'piece'
    variable_weight?: boolean | null;
}

const UNIT_TO_PACK: Record<string, PackUnit> = {
    g: 'g', kg: 'kg', ml: 'ml', l: 'liter', liter: 'liter', stuk: 'stuk', stuks: 'stuk', piece: 'stuk', portie: 'portie',
};

/**
 * Leidt de base-kostprijs (per 100 g / per 100 ml / per 1 stuk, in centen) af uit
 * een supplier_product. Deterministisch — hergebruikt de unitPrice-canon.
 */
export function supplierProductBaseCost(sp: SupplierProductCostRow): BaseFields | null {
    if (!Number.isFinite(sp.price_cents) || sp.price_cents < 0) return null;

    const totalBase = sp.total_base_quantity ?? sp.package_size;
    const baseUnitField = (sp.base_unit ?? sp.package_unit ?? '').toString().toLowerCase();

    // 1) Vaste verpakking met bekende totale inhoud → pakprijs ÷ inhoud.
    if (totalBase && totalBase > 0 && baseUnitField) {
        const pu = UNIT_TO_PACK[baseUnitField];
        if (pu) return packToBase(sp.price_cents, totalBase, pu);
    }

    // 2) Per-eenheid prijs (variabel gewicht / kg/liter/stuk-basis): price_cents is
    //    de prijs voor 1 kg / 1 liter / 1 stuk.
    const unit = (sp.unit ?? '').toString().toLowerCase();
    if (unit === 'kg') return { base_quantity: 100, base_unit: 'g', base_cost_cents: Math.round(sp.price_cents / 10) };
    if (unit === 'liter' || unit === 'l') return { base_quantity: 100, base_unit: 'ml', base_cost_cents: Math.round(sp.price_cents / 10) };
    if (unit === 'stuk' || unit === 'stuks' || unit === 'piece') return { base_quantity: 1, base_unit: 'stuk', base_cost_cents: sp.price_cents };
    if (unit === 'g') return { base_quantity: 100, base_unit: 'g', base_cost_cents: sp.price_cents * 100 };
    if (unit === 'ml') return { base_quantity: 100, base_unit: 'ml', base_cost_cents: sp.price_cents * 100 };

    return null;
}

/** Converteer een dosering (qty + unit) naar de basiseenheid van de base-cost. */
function toBaseAmount(qty: number, unit: string, baseUnit: string): number | null {
    const u = unit.toLowerCase();
    if (baseUnit === 'g') {
        if (u === 'g') return qty;
        if (u === 'kg') return qty * 1000;
        return null;
    }
    if (baseUnit === 'ml') {
        if (u === 'ml') return qty;
        if (u === 'l' || u === 'liter') return qty * 1000;
        return null;
    }
    if (baseUnit === 'stuk') {
        if (u === 'stuk' || u === 'stuks' || u === 'piece' || u === 'portie') return qty;
        return null;
    }
    return null;
}

/**
 * De werkelijke ingrediëntkost (centen) van een dosering, met yield.
 *   used_base_amount / base_quantity × base_cost_cents ÷ yield_factor
 * yieldFactor <= 0 → behandeld als 1 (geen deling door nul).
 * Retourneert null als de eenheid niet met de base samengaat (voorkomt 1000×-fout).
 */
export function ingredientCostCents(
    qty: number, unit: string, base: BaseFields, yieldFactor = 1,
): number | null {
    if (!Number.isFinite(qty) || qty <= 0 || base.base_quantity <= 0) return null;
    const amount = toBaseAmount(qty, unit, base.base_unit);
    if (amount === null) return null;
    const y = Number.isFinite(yieldFactor) && yieldFactor > 0 ? yieldFactor : 1;
    return Math.round(((amount / base.base_quantity) * base.base_cost_cents) / y);
}

/** Volledige keten: supplier_product → dosering → kost (centen). */
export function recipeIngredientCostFromSupplierProduct(
    sp: SupplierProductCostRow, qty: number, unit: string, yieldFactor = 1,
): number | null {
    const base = supplierProductBaseCost(sp);
    if (!base) return null;
    return ingredientCostCents(qty, unit, base, yieldFactor);
}

/**
 * Selectieregel voor prepared ingredients (§16 Fase C):
 *   1. expliciet gekozen supplier_product_id;
 *   2. anders inventory.preferred_supplier_product_id;
 *   3. anders geen automatische keuze → 'koppeling vereist'.
 */
export function selectSupplierProductId(opts: {
    explicitSupplierProductId?: number | null;
    preferredSupplierProductId?: number | null;
}): { supplierProductId: number | null; reason: 'explicit' | 'preferred' | 'link_required' } {
    if (opts.explicitSupplierProductId) return { supplierProductId: opts.explicitSupplierProductId, reason: 'explicit' };
    if (opts.preferredSupplierProductId) return { supplierProductId: opts.preferredSupplierProductId, reason: 'preferred' };
    return { supplierProductId: null, reason: 'link_required' };
}
