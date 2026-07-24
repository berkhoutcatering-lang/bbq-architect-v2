/* dal/supplierProductPricing — leest de goedgekeurde leveranciersprijs uit de
 * NIEUWE canon (supplier_products + supplier_product_prices) voor receptkost.
 *
 * Dit is het aanhechtpunt voor Fase C (§16): prepared/bought-in ingredient →
 * supplier_product current price → base cost. Selectieregel:
 *   1. expliciet supplier_product_id;
 *   2. inventory.preferred_supplier_product_id;
 *   3. anders 'koppeling vereist' (nooit stil de goedkoopste kiezen).
 *
 * Vergelijkt NOOIT Catalogus A- en B-id's. Expliciete organizationfilter naast RLS.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
    supplierProductBaseCost, ingredientCostCents, selectSupplierProductId,
    type SupplierProductCostRow,
} from '../supplierSync/recipeCost';

export interface IngredientCostResult {
    ok: boolean;
    supplierProductId: number | null;
    reason: 'explicit' | 'preferred' | 'link_required' | 'no_price' | 'incompatible_unit';
    costCents: number | null;
    base: { base_quantity: number; base_unit: string; base_cost_cents: number } | null;
}

/**
 * Resolvet de kostprijs (centen) van één ingrediëntdosering via de nieuwe
 * leveranciersprijs-keten. Retourneert een expliciete reden i.p.v. een fout getal.
 */
export async function resolveIngredientCostFromSupplierProducts(
    sb: SupabaseClient,
    orgId: string,
    opts: {
        inventoryId?: number | null;
        explicitSupplierProductId?: number | null;
        qty: number;
        unit: string;
        yieldFactor?: number;
    },
): Promise<IngredientCostResult> {
    // Preferred supplier ophalen als er geen expliciete keuze is.
    let preferredId: number | null = null;
    if (!opts.explicitSupplierProductId && opts.inventoryId) {
        const { data: inv } = await sb
            .from('inventory')
            .select('preferred_supplier_product_id')
            .eq('id', opts.inventoryId)
            .eq('organization_id', orgId)
            .maybeSingle();
        preferredId = inv?.preferred_supplier_product_id ?? null;
    }

    const sel = selectSupplierProductId({
        explicitSupplierProductId: opts.explicitSupplierProductId ?? null,
        preferredSupplierProductId: preferredId,
    });
    if (!sel.supplierProductId) {
        return { ok: false, supplierProductId: null, reason: 'link_required', costCents: null, base: null };
    }

    const { data: sp } = await sb
        .from('supplier_products')
        .select('price_cents, unit, package_size, package_unit, total_base_quantity, base_unit, variable_weight, current_price_id')
        .eq('id', sel.supplierProductId)
        .eq('organization_id', orgId)
        .maybeSingle();

    if (!sp || sp.price_cents == null) {
        return { ok: false, supplierProductId: sel.supplierProductId, reason: 'no_price', costCents: null, base: null };
    }

    const base = supplierProductBaseCost(sp as SupplierProductCostRow);
    if (!base) {
        return { ok: false, supplierProductId: sel.supplierProductId, reason: 'no_price', costCents: null, base: null };
    }

    const costCents = ingredientCostCents(opts.qty, opts.unit, base, opts.yieldFactor ?? 1);
    if (costCents === null) {
        return { ok: false, supplierProductId: sel.supplierProductId, reason: 'incompatible_unit', costCents: null, base };
    }

    return { ok: true, supplierProductId: sel.supplierProductId, reason: sel.reason as 'explicit' | 'preferred', costCents, base };
}
