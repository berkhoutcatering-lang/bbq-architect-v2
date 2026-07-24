/* supplierSync/pricing — deterministische geld- en verpakkingsberekening.
 *
 * ADR-4: AI en selectors mogen bronvelden UITLEZEN, maar nooit een kostprijs
 * bepalen. Alle euro's per kg/liter/stuk komen hier uit — reproduceerbaar en
 * testbaar. Dit is het serverzijdige zusje van src/lib/unitPrice.ts: unitPrice
 * levert de per-100 cents-conventie voor `components`; dit levert de
 * per-kg/liter/stuk 6-decimalen-canon voor `supplier_product_prices`.
 *
 * De verplichte voorbeelden uit briefing §14.2 slagen exact (zie pricing.test.ts):
 *   2,5 kg  €22,50/pak            → €9,000000/kg
 *   24 × 330 ml €18,96/doos       → 7,92 L → €2,393939/L
 *   12 stuks €5,04                → €0,420000/stuk
 *   6 × 1,5 L €13,50              → 9 L → €1,500000/L
 *   750 g €8,25                   → €11,000000/kg
 *   zichtbaar €8,95/kg (variabel) → priceBasis=kg, geen fictieve pakprijs
 */

import type { PriceBasis, ContentUnit, BaseUnit, SyncErrorCode } from './types';

/* ── Geldnotatie → hele centen ──────────────────────────────────────────────
 *
 * Adapters horen canonieke decimale strings te sturen ("22.50"), maar deze
 * parser is defensief: hij verwerkt NL én internationale notatie plus € en
 * spaties. Heuristiek voor het scheidingsteken:
 *   • beide '.' en ',' aanwezig → het RECHTSE teken is decimaal, het andere
 *     is duizendtal;
 *   • één teken, gevolgd door exact 3 cijfers → duizendtal (1.234 → 1234);
 *   • één teken, gevolgd door 1–2 cijfers → decimaal (22,50 → 22.50);
 *   • geen teken → hele euro's.
 * Retourneert hele centen (afgerond) of null bij onbruikbare input. */
export function parseMoneyToCents(input: string | number | null | undefined): number | null {
    if (input === null || input === undefined) return null;
    if (typeof input === 'number') {
        if (!Number.isFinite(input) || input < 0) return null;
        return Math.round(input * 100);
    }
    let s = String(input).trim();
    if (!s) return null;
    // Houd cijfers, punt, komma en een leidend minteken over.
    s = s.replace(/[^0-9.,-]/g, '');
    if (!s || s === '-' || s === '.' || s === ',') return null;
    const negative = s.startsWith('-');
    s = s.replace(/-/g, '');

    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    let normalized: string;

    if (lastDot !== -1 && lastComma !== -1) {
        // Beide aanwezig: rechtse = decimaal.
        const decIsComma = lastComma > lastDot;
        const decSep = decIsComma ? ',' : '.';
        const grpSep = decIsComma ? '.' : ',';
        normalized = s.split(grpSep).join('').replace(decSep, '.');
    } else if (lastComma !== -1) {
        normalized = decideSingleSeparator(s, ',');
    } else if (lastDot !== -1) {
        normalized = decideSingleSeparator(s, '.');
    } else {
        normalized = s;
    }

    const value = Number(normalized);
    if (!Number.isFinite(value) || value < 0) return null;
    const cents = Math.round(value * 100);
    return negative ? -cents : cents;
}

function decideSingleSeparator(s: string, sep: string): string {
    const parts = s.split(sep);
    if (parts.length > 2) {
        // Meerdere identieke scheidingstekens → duizendtallen (1.234.567).
        return parts.join('');
    }
    const decimals = parts[1] ?? '';
    if (decimals.length === 3) {
        // Exact 3 cijfers achter één teken → duizendtal (1.234 → 1234).
        return parts.join('');
    }
    // 1–2 (of >3) cijfers → decimaal.
    return `${parts[0]}.${decimals}`;
}

/** Ronde helpers: centen (2 dec) en basisprijzen (6 dec). */
export function round2(euro: number): number {
    return Math.round((euro + Number.EPSILON) * 100) / 100;
}
export function round6(euro: number): number {
    return Math.round((euro + Number.EPSILON) * 1e6) / 1e6;
}

/* ── Verpakking → totale basishoeveelheid ───────────────────────────────────
 * Weegt om naar de interne basiseenheid: gewicht→gram, volume→ml, stuks→stuk. */

const CONTENT_TO_BASE: Record<ContentUnit, { unit: BaseUnit; factor: number }> = {
    g: { unit: 'g', factor: 1 },
    kg: { unit: 'g', factor: 1000 },
    ml: { unit: 'ml', factor: 1 },
    liter: { unit: 'ml', factor: 1000 },
    piece: { unit: 'piece', factor: 1 },
};

export interface PackagingInput {
    priceBasis: PriceBasis;
    packCount: string | null;
    contentPerItemQuantity: string | null;
    contentPerItemUnit: ContentUnit | null;
    totalBaseQuantity: string | null;
    baseUnit: BaseUnit | null;
}

export interface PackagingResult {
    ok: boolean;
    totalBaseQuantity: number | null; // in gram/ml/stuk
    baseUnit: BaseUnit | null;
    codes: SyncErrorCode[];
}

function parsePositive(v: string | null | undefined): number | null {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

/**
 * Leidt totale basishoeveelheid + basiseenheid af.
 * Voorkeur: expliciet totalBaseQuantity+baseUnit. Anders multipack-formule:
 *   total = pack_count × content_per_item × conversion_to_base_unit
 */
export function resolvePackaging(input: PackagingInput): PackagingResult {
    const codes: SyncErrorCode[] = [];

    // Expliciet totaal meegegeven.
    const explicitTotal = parsePositive(input.totalBaseQuantity);
    if (explicitTotal !== null && input.baseUnit) {
        return { ok: true, totalBaseQuantity: explicitTotal, baseUnit: input.baseUnit, codes };
    }

    // Multipack-formule.
    const count = parsePositive(input.packCount) ?? 1;
    const content = parsePositive(input.contentPerItemQuantity);
    if (content !== null && input.contentPerItemUnit) {
        const conv = CONTENT_TO_BASE[input.contentPerItemUnit];
        return {
            ok: true,
            totalBaseQuantity: round6(count * content * conv.factor),
            baseUnit: conv.unit,
            codes,
        };
    }

    // Geen verpakking af te leiden.
    codes.push('AMBIGUOUS_PACKAGE');
    return { ok: false, totalBaseQuantity: null, baseUnit: null, codes };
}

/* ── Effectieve prijs (promo vs regulier) ───────────────────────────────────*/

export interface EffectivePriceInput {
    regularPriceExVat: string | null;
    promoPriceExVat: string | null;
}
export interface EffectivePriceResult {
    regularCents: number | null;
    promoCents: number | null;
    effectiveCents: number | null;
    codes: SyncErrorCode[];
}

export function computeEffectivePrice(input: EffectivePriceInput): EffectivePriceResult {
    const codes: SyncErrorCode[] = [];
    const regularCents = parseMoneyToCents(input.regularPriceExVat);
    const promoCents = parseMoneyToCents(input.promoPriceExVat);

    let effectiveCents: number | null;
    if (promoCents !== null && promoCents > 0) {
        if (regularCents !== null && promoCents > regularCents) {
            // Promo duurder dan regulier → verdacht; negeer promo, val terug op regulier.
            codes.push('PROMO_GT_REGULAR');
            effectiveCents = regularCents;
        } else {
            effectiveCents = promoCents;
        }
    } else {
        effectiveCents = regularCents;
    }

    if (effectiveCents === null) {
        codes.push('PRICE_NONPOSITIVE');
    } else if (effectiveCents <= 0) {
        codes.push('PRICE_NONPOSITIVE');
        effectiveCents = null;
    }

    return { regularCents, promoCents, effectiveCents, codes };
}

/* ── Volledige prijsberekening ──────────────────────────────────────────────*/

export interface PricingInput extends PackagingInput, EffectivePriceInput {
    variableWeight: boolean;
}

export interface PricingResult {
    ok: boolean;
    codes: SyncErrorCode[];
    regularPriceCents: number | null;
    promoPriceCents: number | null;
    effectivePriceCents: number | null;
    priceBasis: PriceBasis;
    totalBaseQuantity: number | null;
    baseUnit: BaseUnit | null;
    /** 6-decimalen euro's per eenheid; alleen de van toepassing zijnde is gevuld. */
    pricePerKg: number | null;
    pricePerLiter: number | null;
    pricePerPiece: number | null;
}

/**
 * De volledige deterministische prijsafleiding voor één waarneming.
 *
 * priceBasis-semantiek:
 *   • 'package'          → effectivePrice is de PAKprijs; per-eenheid = pak ÷ totaal.
 *   • 'kg'/'liter'/'piece' → effectivePrice is AL per die eenheid (bv. vanggewicht
 *     €8,95/kg); er wordt géén fictieve pakprijs verzonnen.
 *   • 'unknown'          → geen basisprijs; UNKNOWN_PRICE_BASIS → review.
 */
export function computePricing(input: PricingInput): PricingResult {
    const codes: SyncErrorCode[] = [];
    const price = computeEffectivePrice(input);
    codes.push(...price.codes);

    const result: PricingResult = {
        ok: false,
        codes,
        regularPriceCents: price.regularCents,
        promoPriceCents: price.promoCents,
        effectivePriceCents: price.effectiveCents,
        priceBasis: input.priceBasis,
        totalBaseQuantity: null,
        baseUnit: null,
        pricePerKg: null,
        pricePerLiter: null,
        pricePerPiece: null,
    };

    if (price.effectiveCents === null) {
        return result; // geen bruikbare prijs → niet ok.
    }
    const effectiveEuro = price.effectiveCents / 100;

    if (input.priceBasis === 'package') {
        const pack = resolvePackaging(input);
        result.totalBaseQuantity = pack.totalBaseQuantity;
        result.baseUnit = pack.baseUnit;
        if (!pack.ok || pack.totalBaseQuantity === null || !pack.baseUnit) {
            result.codes.push(...pack.codes);
            return result; // verpakking onbekend → geen basisprijs, review.
        }
        assignPerUnit(result, effectiveEuro, pack.baseUnit, pack.totalBaseQuantity);
        result.ok = true;
        return result;
    }

    if (input.priceBasis === 'kg') {
        result.pricePerKg = round6(effectiveEuro);
        result.baseUnit = 'g';
        result.ok = true;
        return result;
    }
    if (input.priceBasis === 'liter') {
        result.pricePerLiter = round6(effectiveEuro);
        result.baseUnit = 'ml';
        result.ok = true;
        return result;
    }
    if (input.priceBasis === 'piece') {
        result.pricePerPiece = round6(effectiveEuro);
        result.baseUnit = 'piece';
        result.ok = true;
        return result;
    }

    // priceBasis === 'unknown'
    result.codes.push('UNKNOWN_PRICE_BASIS');
    return result;
}

function assignPerUnit(result: PricingResult, effectiveEuro: number, baseUnit: BaseUnit, totalBase: number) {
    switch (baseUnit) {
        case 'g':
            // gram → per kg
            result.pricePerKg = round6(effectiveEuro / (totalBase / 1000));
            break;
        case 'ml':
            // ml → per liter
            result.pricePerLiter = round6(effectiveEuro / (totalBase / 1000));
            break;
        case 'piece':
            result.pricePerPiece = round6(effectiveEuro / totalBase);
            break;
    }
}

/** Herkenbaar label voor de UI ("€9,00 / kg"). Presentatie, geen canon. */
export function pricePerUnitLabel(result: Pick<PricingResult, 'pricePerKg' | 'pricePerLiter' | 'pricePerPiece'>): string | null {
    const euro = (n: number) => `€${n.toFixed(2).replace('.', ',')}`;
    if (result.pricePerKg !== null) return `${euro(result.pricePerKg)} / kg`;
    if (result.pricePerLiter !== null) return `${euro(result.pricePerLiter)} / liter`;
    if (result.pricePerPiece !== null) return `${euro(result.pricePerPiece)} / stuk`;
    return null;
}
