import { describe, it, expect } from 'vitest';
import {
    supplierProductBaseCost, ingredientCostCents, recipeIngredientCostFromSupplierProduct, selectSupplierProductId,
} from './recipeCost';
import { buildCheckpointDecisions, type CheckpointScope } from './checkpoint';
import { validRawObservation } from './__testdata__/observation';

describe('supplierProductBaseCost', () => {
    it('vaste verpakking 2,5 kg / €22,50 → 90 cent per 100 g', () => {
        const b = supplierProductBaseCost({ price_cents: 2250, unit: 'kg', package_size: 2500, package_unit: 'g', total_base_quantity: 2500, base_unit: 'g' });
        expect(b).toEqual({ base_quantity: 100, base_unit: 'g', base_cost_cents: 90 });
    });
    it('variabel gewicht (per kg, €8,95) → per 100 g', () => {
        const b = supplierProductBaseCost({ price_cents: 895, unit: 'kg', package_size: null, package_unit: null });
        expect(b).toEqual({ base_quantity: 100, base_unit: 'g', base_cost_cents: 90 }); // round(895/10)=90 (89,5→90)
    });
    it('per liter → per 100 ml', () => {
        const b = supplierProductBaseCost({ price_cents: 150, unit: 'liter', package_size: null, package_unit: null });
        expect(b).toEqual({ base_quantity: 100, base_unit: 'ml', base_cost_cents: 15 });
    });
    it('per stuk', () => {
        const b = supplierProductBaseCost({ price_cents: 42, unit: 'stuk', package_size: null, package_unit: null });
        expect(b).toEqual({ base_quantity: 1, base_unit: 'stuk', base_cost_cents: 42 });
    });
});

describe('ingredientCostCents — dosering + yield', () => {
    const base = { base_quantity: 100, base_unit: 'g', base_cost_cents: 90 };
    it('180 g zonder yield → 162 cent', () => {
        expect(ingredientCostCents(180, 'g', base, 1)).toBe(162);
    });
    it('180 g met yield 82% → 198 cent', () => {
        expect(ingredientCostCents(180, 'g', base, 0.82)).toBe(198);
    });
    it('kg-dosering wordt correct naar gram omgezet', () => {
        expect(ingredientCostCents(0.18, 'kg', base, 1)).toBe(162);
    });
    it('onverenigbare eenheid → null (voorkomt 1000×-fout)', () => {
        expect(ingredientCostCents(180, 'ml', base, 1)).toBeNull();
    });
    it('yield <= 0 wordt als 1 behandeld', () => {
        expect(ingredientCostCents(180, 'g', base, 0)).toBe(162);
    });
});

describe('§20.5 end-to-end procureurtest', () => {
    it('P123 2,5 kg €22,50 → observation → supplier_product → 180 g @ yield 82% = €1,98', () => {
        const scope: CheckpointScope = { organizationId: 'org-1', supplierId: 7, supplierAccountKey: 'acct', adapterKnownActive: true };
        const raw = validRawObservation({
            supplierSku: 'P123', ean: null, productName: 'Procureur (schouderkarbonade)',
            regularPriceExVat: '22.50', packCount: '1', contentPerItemQuantity: '2.5', contentPerItemUnit: 'kg',
            productUrl: 'https://www.baktotaal.nl/product/procureur',
        });
        const { decisions } = buildCheckpointDecisions([raw], scope);
        const d = decisions[0];
        expect(d.validation_status).toBe('accepted');

        // Simuleer wat de RPC in supplier_products schrijft (uit d.price).
        const p = d.price!;
        const sp = {
            price_cents: p.effective_price_cents as number,
            unit: p.unit as string,
            package_size: p.total_base_quantity as number,
            package_unit: p.base_unit as string,
            total_base_quantity: p.total_base_quantity as number,
            base_unit: p.base_unit as string,
        };
        expect(sp.price_cents).toBe(2250);
        expect(sp.total_base_quantity).toBe(2500);

        const cost = recipeIngredientCostFromSupplierProduct(sp, 180, 'g', 0.82);
        expect(cost).toBe(198); // 0,18 × €9,00 ÷ 0,82 = €1,975… → €1,98
    });
});

describe('selectSupplierProductId — §16 Fase C selectieregel', () => {
    it('expliciete keuze wint', () => {
        expect(selectSupplierProductId({ explicitSupplierProductId: 5, preferredSupplierProductId: 9 }))
            .toEqual({ supplierProductId: 5, reason: 'explicit' });
    });
    it('anders preferred', () => {
        expect(selectSupplierProductId({ preferredSupplierProductId: 9 }))
            .toEqual({ supplierProductId: 9, reason: 'preferred' });
    });
    it('geen keuze → koppeling vereist', () => {
        expect(selectSupplierProductId({}))
            .toEqual({ supplierProductId: null, reason: 'link_required' });
    });
});
