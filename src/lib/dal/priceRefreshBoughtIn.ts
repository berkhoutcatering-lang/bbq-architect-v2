/* Prijs-verversing voor BOUGHT-IN componenten uit Catalogus B (supplier_products).
 *
 * Aanvulling op refreshRecipePrices (dat alleen PREPARED componenten uit
 * Catalogus A ververst). Een bought_in component heeft een directe
 * `supplier_product_id`-koppeling, maar z'n base_cost_cents was een momentopname
 * bij import en werd nooit ververst. Deze functie herrekent die uit de HUIDIGE
 * leveranciersprijs (deterministisch, via de geteste supplierProductBaseCost) en
 * schrijft base_cost_cents terug. De bestaande DB-triggers cascaden dat naar
 * gerecht_components.cost_at_use_cents en gerechten.total_cost_cents → marge.
 *
 * Vergelijkt NOOIT Catalogus A- en B-id's: de koppeling is de expliciete
 * components.supplier_product_id → supplier_products.id (zelfde id-ruimte).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supplierProductBaseCost, type SupplierProductCostRow } from '@/lib/supplierSync/recipeCost';
import { costForBasisCents } from '@/lib/unitPrice';

export interface BoughtInRefreshReport {
    bekeken: number;        // bought_in componenten met een supplier_product-koppeling
    bijgewerkt: number;
    ongewijzigd: number;
    ongekoppeld: number;    // supplier_product verdwenen of zonder bruikbare prijs
    totaalOudCents: number;
    totaalNieuwCents: number;
}

function empty(): BoughtInRefreshReport {
    return { bekeken: 0, bijgewerkt: 0, ongewijzigd: 0, ongekoppeld: 0, totaalOudCents: 0, totaalNieuwCents: 0 };
}

export async function refreshBoughtInPrices(
    sb: SupabaseClient,
    orgId: string,
    opts: { menuTemplateId?: number } = {},
): Promise<BoughtInRefreshReport> {
    /* Optioneel: alleen componenten van één menukaart (zelfde scoping als
       refreshRecipePrices). */
    let componentIdFilter: number[] | null = null;
    if (opts.menuTemplateId != null) {
        const { data: items } = await sb
            .from('menu_template_items').select('gerecht_id').eq('menu_template_id', opts.menuTemplateId);
        const gerechtIds = Array.from(new Set((items ?? []).map((r: { gerecht_id?: number }) => r.gerecht_id).filter(Boolean)));
        if (gerechtIds.length === 0) return empty();
        const { data: gcs } = await sb
            .from('gerecht_components').select('component_id').eq('organization_id', orgId).in('gerecht_id', gerechtIds);
        componentIdFilter = Array.from(new Set((gcs ?? []).map((r: { component_id?: number }) => r.component_id).filter((v): v is number => typeof v === 'number')));
        if (componentIdFilter.length === 0) return empty();
    }

    let q = sb
        .from('components')
        .select('id, base_cost_cents, base_quantity, base_unit, supplier_product_id')
        .eq('organization_id', orgId)
        .eq('type', 'bought_in')
        .not('supplier_product_id', 'is', null);
    if (componentIdFilter) q = q.in('id', componentIdFilter);
    const { data: comps, error } = await q;
    if (error) throw new Error(`refreshBoughtInPrices: ${error.message}`);

    const report = empty();
    const rows = comps ?? [];
    report.bekeken = rows.length;
    if (rows.length === 0) return report;

    /* Gekoppelde supplier_products in één query (indexed point lookup). */
    const spIds = Array.from(new Set(rows.map((c) => c.supplier_product_id).filter((v): v is number => typeof v === 'number')));
    const { data: sps } = await sb
        .from('supplier_products')
        .select('id, price_cents, unit, package_size, package_unit, total_base_quantity, base_unit, variable_weight')
        .eq('organization_id', orgId)
        .in('id', spIds);
    const spById = new Map<number, SupplierProductCostRow & { id: number }>();
    for (const s of sps ?? []) spById.set(s.id, s as SupplierProductCostRow & { id: number });

    for (const c of rows) {
        const sp = c.supplier_product_id ? spById.get(c.supplier_product_id) : undefined;
        if (!sp || sp.price_cents == null) { report.ongekoppeld++; continue; }
        const base = supplierProductBaseCost(sp);
        if (!base) { report.ongekoppeld++; continue; }

        const oldBase = Number(c.base_cost_cents) || 0;

        /* Alleen de PRIJS ververst, niet de basis.
         *
         * Dit schreef eerder ook base_quantity en base_unit terug, en
         * supplierProductBaseCost normaliseert altijd naar 100 g / 100 ml /
         * 1 stuk. Zette een gebruiker zijn component bewust op 1 kg, dan draaide
         * de eerstvolgende prijs-verversing of leverancierssync dat stil terug
         * naar 100 g — precies de klacht die we in de drawer net verholpen,
         * binnengekomen via een andere deur.
         *
         * We rekenen de nieuwe leveranciersprijs dus om naar de basis die er al
         * staat. Zit die basis in een andere eenheid-familie dan de leverancier
         * (jouw basis in liter, hun prijs per kg), dan is er geen eerlijke
         * omrekening: overslaan en als ongekoppeld tellen, want dan bewéégt deze
         * prijs feitelijk niet mee. */
        const nieuwCents = costForBasisCents({
            srcCostCents: base.base_cost_cents,
            srcQuantity: base.base_quantity,
            srcUnit: base.base_unit,
            baseQuantity: Number(c.base_quantity),
            baseUnit: String(c.base_unit ?? ''),
        });
        if (nieuwCents === null) { report.ongekoppeld++; continue; }
        if (nieuwCents === oldBase) { report.ongewijzigd++; continue; }

        const { error: upErr } = await sb
            .from('components')
            .update({ base_cost_cents: nieuwCents })
            .eq('id', c.id)
            .eq('organization_id', orgId);
        if (upErr) continue; // best-effort per component
        report.bijgewerkt++;
        report.totaalOudCents += oldBase;
        report.totaalNieuwCents += nieuwCents;
    }

    return report;
}
