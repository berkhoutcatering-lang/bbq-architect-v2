import { describe, it, expect } from 'vitest';
import {
    inferApprovalPriceBasis,
    resolvePricingFromSupplierPrice,
    resolvePricingFromSupplierProduct,
    ingredientRowCostCents,
} from './ingredientPricing';

describe('inferApprovalPriceBasis — fix voor de .includes("kg")-bug', () => {
    it('pakhoeveelheid "doos 5 kg" → GEEN per-kg prijs (dit was de bug)', () => {
        expect(inferApprovalPriceBasis('doos 5 kg', 62.5)).toEqual({ prijs_per_kg: null, prijs_per_stuk: null });
    });
    it('"2,5 kg" → GEEN per-kg prijs (pakhoeveelheid)', () => {
        expect(inferApprovalPriceBasis('2,5 kg', 22.5)).toEqual({ prijs_per_kg: null, prijs_per_stuk: null });
    });
    it('"5kg" (zonder spatie) → GEEN per-kg prijs', () => {
        expect(inferApprovalPriceBasis('5kg', 40)).toEqual({ prijs_per_kg: null, prijs_per_stuk: null });
    });
    it('kale "kg" → wel per-kg', () => {
        expect(inferApprovalPriceBasis('kg', 9).prijs_per_kg).toBe(9);
    });
    it('"per kg" en "/kg" → per-kg', () => {
        expect(inferApprovalPriceBasis('per kg', 9).prijs_per_kg).toBe(9);
        expect(inferApprovalPriceBasis('€/kg', 9).prijs_per_kg).toBe(9);
    });
    it('"12 stuks" → GEEN per-stuk prijs (pak van 12)', () => {
        expect(inferApprovalPriceBasis('12 stuks', 5.04)).toEqual({ prijs_per_kg: null, prijs_per_stuk: null });
    });
    it('kale "stuks" → per-stuk', () => {
        expect(inferApprovalPriceBasis('stuks', 0.42).prijs_per_stuk).toBe(0.42);
    });
});

describe('resolvePricingFromSupplierPrice', () => {
    it('prijs_per_kg wint', () => {
        expect(resolvePricingFromSupplierPrice({ prijs_per_kg: 9, prijs: 22.5, eenheid: '2,5 kg' }))
            .toEqual({ price_basis: 'kg', unit_price: 9, price_unit: 'kg' });
    });
    it('exact "kg" via woordgrens → per kg', () => {
        expect(resolvePricingFromSupplierPrice({ prijs: 9, eenheid: 'kg' }).price_basis).toBe('kg');
    });
    it('"12kg doos" valt NIET als per-kg (woordgrens)', () => {
        expect(resolvePricingFromSupplierPrice({ prijs: 30, eenheid: '12kg doos' }).price_basis).toBe('stuk');
    });
});

describe('ingredientRowCostCents', () => {
    it('per kg met g-dosering', () => {
        expect(ingredientRowCostCents({ qty: 180, unit: 'g', unit_price: 9, price_basis: 'kg' })).toBe(162);
    });
    it('per kg met niet-gewicht eenheid → null (voorkomt 1000×)', () => {
        expect(ingredientRowCostCents({ qty: 180, unit: 'ml', unit_price: 9, price_basis: 'kg' })).toBeNull();
    });
    it('per stuk', () => {
        expect(ingredientRowCostCents({ qty: 3, unit: 'stuk', unit_price: 0.42, price_basis: 'stuk' })).toBe(126);
    });
});

describe('resolvePricingFromSupplierProduct (gescande bestel-catalogus)', () => {
    it('gram-basis → per kilo (Bidfood coppa: 203 ct per 100 g = €20,30/kg)', () => {
        expect(resolvePricingFromSupplierProduct({ base_cost_cents: 203, base_quantity: 100, base_unit: 'g' }))
            .toEqual({ price_basis: 'kg', unit_price: 20.3, price_unit: 'kg' });
    });
    it('ml-basis → per liter als vaste eenheid', () => {
        expect(resolvePricingFromSupplierProduct({ base_cost_cents: 82, base_quantity: 100, base_unit: 'ml' }))
            .toEqual({ price_basis: 'stuk', unit_price: 8.2, price_unit: 'liter' });
    });
    it('stuk-basis → per stuk', () => {
        expect(resolvePricingFromSupplierProduct({ base_cost_cents: 28, base_quantity: 1, base_unit: 'stuk' }))
            .toEqual({ price_basis: 'stuk', unit_price: 0.28, price_unit: 'stuk' });
    });
    it('onbekende basis-eenheid → null (liever niet koppelen dan fout rekenen)', () => {
        expect(resolvePricingFromSupplierProduct({ base_cost_cents: 100, base_quantity: 1, base_unit: 'doos' })).toBeNull();
    });
    it('ontbrekende kostprijs → null', () => {
        expect(resolvePricingFromSupplierProduct({ base_cost_cents: null, base_quantity: 100, base_unit: 'g' })).toBeNull();
    });
    it('hoeveelheid 0 → null (geen deling door nul)', () => {
        expect(resolvePricingFromSupplierProduct({ base_cost_cents: 203, base_quantity: 0, base_unit: 'g' })).toBeNull();
    });
    it('de afgeleide kg-prijs rekent correct door in een regel', () => {
        const p = resolvePricingFromSupplierProduct({ base_cost_cents: 203, base_quantity: 100, base_unit: 'g' })!;
        // 150 g coppa à €20,30/kg = €3,05
        expect(ingredientRowCostCents({ qty: 150, unit: 'g', unit_price: p.unit_price, price_basis: p.price_basis })).toBe(305);
    });
});
