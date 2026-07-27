import { describe, it, expect } from 'vitest';
import {
    inferApprovalPriceBasis,
    resolvePricingFromSupplierPrice,
    resolvePricingFromSupplierProduct,
    ingredientRowCostCents,
    recipeYieldFromRows,
    costPerBaseFromRecipe,
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

describe('recipeYieldFromRows — hoeveel levert de receptuur op?', () => {
    it('telt gram en kilo op tot gram', () => {
        expect(recipeYieldFromRows([{ qty: 1, unit: 'kg' }, { qty: 250, unit: 'g' }]))
            .toEqual({ quantity: 1250, unit: 'g' });
    });
    it('liter telt op tot milliliter', () => {
        expect(recipeYieldFromRows([{ qty: 0.5, unit: 'liter' }])).toEqual({ quantity: 500, unit: 'ml' });
    });
    it('gram naast stuks → null (niet optelbaar)', () => {
        expect(recipeYieldFromRows([{ qty: 100, unit: 'g' }, { qty: 2, unit: 'stuk' }])).toBeNull();
    });
    it('onbekende eenheid → null', () => {
        expect(recipeYieldFromRows([{ qty: 1, unit: 'snufje' }])).toBeNull();
    });
    it('regels zonder hoeveelheid tellen niet mee', () => {
        expect(recipeYieldFromRows([{ qty: 0, unit: 'g' }, { qty: 200, unit: 'g' }]))
            .toEqual({ quantity: 200, unit: 'g' });
    });
    it('lege lijst → null', () => {
        expect(recipeYieldFromRows([])).toBeNull();
    });
});

describe('costPerBaseFromRecipe — de bavette-fout', () => {
    it('€32,85 voor 1 kg met basis 100 g → 328,5 ct (was 3285)', () => {
        const y = recipeYieldFromRows([{ qty: 1, unit: 'kg' }])!;
        expect(costPerBaseFromRecipe(3285, y, 100, 'g')).toBe(329);   // afgerond op hele centen
    });
    it('en 8 g in een gerecht kost dan € 0,26 i.p.v. € 2,63', () => {
        const y = recipeYieldFromRows([{ qty: 1, unit: 'kg' }])!;
        const perBase = costPerBaseFromRecipe(3285, y, 100, 'g')!;
        expect(Math.round((8 / 100) * perBase)).toBe(26);
    });
    it('basis gelijk aan de receptuur → som blijft ongewijzigd', () => {
        const y = recipeYieldFromRows([{ qty: 500, unit: 'g' }])!;
        expect(costPerBaseFromRecipe(1000, y, 500, 'g')).toBe(1000);
    });
    it('basis in kilo werkt ook', () => {
        const y = recipeYieldFromRows([{ qty: 2, unit: 'kg' }])!;
        expect(costPerBaseFromRecipe(4000, y, 1, 'kg')).toBe(2000);
    });
    it('eenheid sluit niet aan (ml-recept, basis in gram) → null', () => {
        const y = recipeYieldFromRows([{ qty: 1, unit: 'liter' }])!;
        expect(costPerBaseFromRecipe(500, y, 100, 'g')).toBeNull();
    });
    it('basis-hoeveelheid 0 → null (geen deling door nul)', () => {
        const y = recipeYieldFromRows([{ qty: 1, unit: 'kg' }])!;
        expect(costPerBaseFromRecipe(3285, y, 0, 'g')).toBeNull();
    });
});
