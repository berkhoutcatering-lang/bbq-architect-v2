/* Gedeelde reken-canon voor ingrediënt→leverancier-koppelingen.
 *
 * Eén plek zodat de component-editor (picker) en de batch prijs-verversing
 * byte-identiek rekenen. Hard rule: dit is code-rekenwerk, NOOIT AI.
 */

export type PriceBasis = 'kg' | 'stuk';

export interface SupplierPriceShape {
    prijs_per_kg?: number | null;
    prijs_per_stuk?: number | null;
    prijs?: number | null;
    eenheid?: string | null;
}

/**
 * Bepaalt eerlijk de rekenwijze + het label uit een supplier_prices-rij:
 *   prijs_per_kg wint → per kilo;
 *   anders prijs_per_stuk → per stuk;
 *   anders eenheid exact 'kg'/'kilo' → per kilo (NIET substring: '12kg doos' valt eruit);
 *   anders generieke verpakking → prijs geldt per die eenheid (doos/pak/stuk).
 */
export function resolvePricingFromSupplierPrice(
    sp: SupplierPriceShape,
): { price_basis: PriceBasis; unit_price: number; price_unit: string } {
    const eenheid = (sp.eenheid || '').trim();
    const eLow = eenheid.toLowerCase();
    if (sp.prijs_per_kg && sp.prijs_per_kg > 0) return { price_basis: 'kg', unit_price: Number(sp.prijs_per_kg), price_unit: 'kg' };
    if (sp.prijs_per_stuk && sp.prijs_per_stuk > 0) return { price_basis: 'stuk', unit_price: Number(sp.prijs_per_stuk), price_unit: 'stuk' };
    /* Woord-grens-match op 'kg': vangt "kg" / "per kg" / "1 kg" / "kg." (gewicht-
       labels → per kilo) maar NIET "12kg doos" (verpakking → per stuk). */
    if (eLow === 'kilo' || eLow === 'kilogram' || /(^|[^a-z0-9])kg([^a-z]|$)/.test(eLow)) return { price_basis: 'kg', unit_price: Number(sp.prijs) || 0, price_unit: 'kg' };
    return { price_basis: 'stuk', unit_price: Number(sp.prijs) || 0, price_unit: eenheid || 'stuk' };
}

/**
 * Kostprijs (cents) van een gekoppelde ingrediëntregel = prijs × aantal.
 *   per kg  → alleen g/kg zijn geldig; een niet-gewicht-eenheid (ml/liter/stuk)
 *             geeft null terug (voorkomt de 1000×-fout).
 *   per stuk/verpakking → prijs × aantal.
 * Null = niet (correct) te berekenen — de aanroeper laat dan de bestaande
 * kostprijs staan i.p.v. een fout getal weg te schrijven.
 */
export function ingredientRowCostCents(opts: {
    qty: number;
    unit: string;
    unit_price: number | null | undefined;
    price_basis: PriceBasis | null | undefined;
}): number | null {
    const { qty, unit, unit_price, price_basis } = opts;
    if (!unit_price || unit_price <= 0) return null;
    if (!Number.isFinite(qty) || qty <= 0) return null;
    if (price_basis === 'kg') {
        const u = (unit || '').trim().toLowerCase();
        if (u === 'kg') return Math.round(unit_price * qty * 100);
        if (u === 'g') return Math.round(unit_price * (qty / 1000) * 100);
        return null;
    }
    return Math.round(unit_price * qty * 100);
}
