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

/** Vorm van een gescand bestel-product (Catalog B): kostprijs per basis-eenheid. */
export interface SupplierProductBaseShape {
    base_cost_cents?: number | null;
    base_quantity?: number | null;
    base_unit?: string | null;   // 'g' | 'ml' | 'stuk'
}

/**
 * Zelfde rekenwijze, maar voor een product uit de gescande bestel-catalogus.
 * Dat levert kostprijs per basis-eenheid (bv. 203 cent per 100 g) i.p.v. een
 * prijs-per-kg veld, dus reken we terug naar de rekenwijze die de ingrediënt-
 * regels gebruiken:
 *
 *   g   → per kilo   (regel mag in g of kg blijven rekenen)
 *   ml  → per liter  (als vaste eenheid, net als een verpakking)
 *   stuk→ per stuk
 *
 * Null bij een onbekende of onbruikbare basis-eenheid — dan koppelen we niet
 * en blijft de kostprijs handmatig, i.p.v. een fout getal.
 */
export function resolvePricingFromSupplierProduct(
    sp: SupplierProductBaseShape,
): { price_basis: PriceBasis; unit_price: number; price_unit: string } | null {
    const cents = Number(sp.base_cost_cents);
    const qty = Number(sp.base_quantity);
    if (!Number.isFinite(cents) || cents <= 0) return null;
    if (!Number.isFinite(qty) || qty <= 0) return null;

    /* Euro's per 1 gram / milliliter / stuk. */
    const perBase = cents / qty / 100;
    const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

    switch ((sp.base_unit || '').toLowerCase()) {
        case 'g': return { price_basis: 'kg', unit_price: r4(perBase * 1000), price_unit: 'kg' };
        case 'ml': return { price_basis: 'stuk', unit_price: r4(perBase * 1000), price_unit: 'liter' };
        case 'stuk': return { price_basis: 'stuk', unit_price: r4(perBase), price_unit: 'stuk' };
        default: return null;
    }
}

/**
 * Bepaalt bij GOEDKEURING of de vrije-tekst eenheid ONDUBBELZINNIG een
 * per-kg / per-stuk prijs betekent — of een PAKHOEVEELHEID (dan is `prijs` de
 * pakprijs en mag prijs_per_kg/prijs_per_stuk NIET worden ingevuld).
 *
 * Fix voor de bevestigde bug: het oude `eenhLower.includes('kg')` zette een
 * pakprijs ("doos 5 kg", "2,5 kg") als prijs_per_kg weg, waarna de leeskant die
 * corrupte waarde vertrouwde. Deze helper vangt een getal vóór het gewicht/volume
 * af (→ verpakking) en zet alleen bij een kale eenheid ("kg", "per kg", "/kg")
 * de per-kg prijs.
 */
export function inferApprovalPriceBasis(
    eenheid: string | null | undefined,
    prijs: number,
): { prijs_per_kg: number | null; prijs_per_stuk: number | null } {
    const s = (eenheid || '').toLowerCase().trim();
    // Een getal direct vóór een gewicht/volume-eenheid = pakhoeveelheid, geen per-eenheid prijs.
    const hasQtyBeforeUnit = /\d\s*(kg|kilo|kilogram|gram|g|ml|liter|ltr|l)\b/.test(s);
    const isPerKg = !hasQtyBeforeUnit && (s === 'kg' || s === 'kilo' || s === 'kilogram' || /(^|\bper\s*|\/)\s*(kg|kilo)\b/.test(s));
    const isPerStuk = !/\d/.test(s) && (s === 'stuk' || s === 'stuks' || /(^|\bper\s*)(stuk|stuks)\b/.test(s));
    return {
        prijs_per_kg: isPerKg ? prijs : null,
        prijs_per_stuk: isPerStuk ? prijs : null,
    };
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
