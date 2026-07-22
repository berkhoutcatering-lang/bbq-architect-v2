/* Batch prijs-verversing: herresolvet de gekozen leverancier-prijzen uit
 * supplier_prices (Catalog A) en herschrijft components.base_cost_cents. De
 * bestaande DB-triggers cascaden dat naar gerecht_components.cost_at_use_cents
 * en gerechten.total_cost_cents — dus hier alleen base_cost_cents (her)schrijven.
 *
 * Hard rule: prijs = code-rekenwerk (ingredientPricing.ts), nooit AI. Alleen
 * PREPARED componenten met gekoppelde ingrediënt-regels worden ververst; een
 * handmatig/AI gezette kostprijs wordt NOOIT overschreven (override-guard).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ingredientRowCostCents, resolvePricingFromSupplierPrice } from '@/lib/ingredientPricing';

interface IngredientJsonRow {
    name?: string;
    qty?: number;
    unit?: string;
    cost_cents?: number;
    master_product_id?: number;
    supplier_price_id?: number | null;
    leverancier?: string | null;
    unit_price?: number | null;
    price_basis?: 'kg' | 'stuk' | null;
    price_unit?: string | null;
}

export interface PriceRefreshReport {
    receptenBekeken: number;        // prepared componenten met koppelingen
    receptenBijgewerkt: number;
    overgeslagenHandmatig: number;  // base_cost_cents ≠ som → niet aangeraakt
    ongekoppeld: string[];          // ingrediënt-namen zonder actuele prijs
    totaalOudCents: number;         // over bijgewerkte componenten
    totaalNieuwCents: number;
    pctDelta: number | null;        // (nieuw − oud) / oud × 100
}

function emptyReport(): PriceRefreshReport {
    return { receptenBekeken: 0, receptenBijgewerkt: 0, overgeslagenHandmatig: 0, ongekoppeld: [], totaalOudCents: 0, totaalNieuwCents: 0, pctDelta: null };
}

export async function refreshRecipePrices(
    sb: SupabaseClient,
    orgId: string,
    opts: { menuTemplateId?: number } = {},
): Promise<PriceRefreshReport> {
    /* 1. Doel-componenten: alle prepared, of alleen die van één menukaart. */
    let componentIdFilter: number[] | null = null;
    if (opts.menuTemplateId != null) {
        const { data: items } = await sb
            .from('menu_template_items')
            .select('gerecht_id')
            .eq('menu_template_id', opts.menuTemplateId);
        const gerechtIds = Array.from(new Set((items ?? []).map((r: any) => r.gerecht_id).filter(Boolean)));
        if (gerechtIds.length === 0) return emptyReport();
        const { data: gcs } = await sb
            .from('gerecht_components')
            .select('component_id')
            .eq('organization_id', orgId)
            .in('gerecht_id', gerechtIds);
        componentIdFilter = Array.from(new Set((gcs ?? []).map((r: any) => r.component_id).filter((v: any) => typeof v === 'number')));
        if (componentIdFilter.length === 0) return emptyReport();
    }

    /* 2. Componenten laden. */
    let q = sb
        .from('components')
        .select('id, name, type, base_cost_cents, ingredients')
        .eq('organization_id', orgId)
        .eq('type', 'prepared');
    if (componentIdFilter) q = q.in('id', componentIdFilter);
    const { data: comps, error } = await q;
    if (error) throw new Error(`refreshRecipePrices: ${error.message}`);

    const targets: Array<{ id: number; base: number; rows: IngredientJsonRow[] }> = [];
    const masterIds = new Set<number>();
    for (const c of comps ?? []) {
        const rows: IngredientJsonRow[] = Array.isArray((c as any).ingredients) ? (c as any).ingredients : [];
        const linked = rows.filter(r => typeof r.master_product_id === 'number');
        if (linked.length === 0) continue;
        for (const r of linked) masterIds.add(r.master_product_id as number);
        targets.push({ id: (c as any).id, base: Number((c as any).base_cost_cents) || 0, rows });
    }

    const report = emptyReport();
    report.receptenBekeken = targets.length;
    if (targets.length === 0) return report;

    /* 3. Actuele prijzen — één query, nieuwste actieve per (product × leverancier). */
    const { data: prices } = await sb
        .from('supplier_prices')
        .select('id, master_product_id, leverancier, prijs, eenheid, prijs_per_kg, prijs_per_stuk, datum')
        .eq('organization_id', orgId)
        .in('master_product_id', Array.from(masterIds))
        .eq('actief', true)
        .order('datum', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });
    const byKey = new Map<string, any>();
    const byId = new Map<number, any>();
    for (const p of prices ?? []) {
        const key = `${p.master_product_id}|${(p.leverancier || '').toLowerCase()}`;
        if (!byKey.has(key)) byKey.set(key, p);
        byId.set(p.id, p);
    }

    /* 4. Per component herrekenen (met override-guard) en base_cost_cents schrijven. */
    const ongekoppeld = new Set<string>();
    for (const t of targets) {
        /* Override-guard: een NIET-nul base_cost_cents die afwijkt van de som van
           de bevroren regel-kosten is handmatig/AI gezet → NIET overschrijven.
           base = 0 is géén bewuste override (uncosted/stale recept) → wél verversen. */
        const frozenSum = t.rows.reduce((s, r) => s + (Number(r.cost_cents) || 0), 0);
        if (t.base > 0 && Math.abs(frozenSum - t.base) > 2) { report.overgeslagenHandmatig++; continue; }

        let changed = false;
        const newRows = t.rows.map(r => {
            if (typeof r.master_product_id !== 'number') return r; // vrije-tekst-regel blijft
            const key = `${r.master_product_id}|${(r.leverancier || '').toLowerCase()}`;
            const price = byKey.get(key) ?? (typeof r.supplier_price_id === 'number' ? byId.get(r.supplier_price_id) : undefined);
            if (!price) { ongekoppeld.add(r.name || `product ${r.master_product_id}`); return r; }
            const pr = resolvePricingFromSupplierPrice(price);
            const newCost = ingredientRowCostCents({ qty: Number(r.qty) || 0, unit: r.unit || '', unit_price: pr.unit_price, price_basis: pr.price_basis });
            if (newCost == null) { ongekoppeld.add(r.name || `product ${r.master_product_id}`); return r; } // eenheid-mismatch → laat staan
            if (newCost !== (Number(r.cost_cents) || 0) || pr.unit_price !== (r.unit_price ?? null) || price.id !== (r.supplier_price_id ?? null)) changed = true;
            return {
                ...r,
                unit_price: pr.unit_price,
                price_basis: pr.price_basis,
                price_unit: pr.price_unit,
                supplier_price_id: price.id,
                leverancier: price.leverancier ?? r.leverancier ?? null,
                cost_cents: newCost,
            };
        });

        const newBase = newRows.reduce((s, r) => s + (Number(r.cost_cents) || 0), 0);
        if (!changed && newBase === t.base) continue;

        const { error: upErr } = await sb
            .from('components')
            .update({ base_cost_cents: newBase, ingredients: newRows })
            .eq('id', t.id)
            .eq('organization_id', orgId);
        if (upErr) continue; // best-effort per component; rapport telt alleen geslaagde
        report.receptenBijgewerkt++;
        report.totaalOudCents += t.base;
        report.totaalNieuwCents += newBase;
    }

    report.ongekoppeld = Array.from(ongekoppeld).slice(0, 25);
    report.pctDelta = report.totaalOudCents > 0 ? ((report.totaalNieuwCents - report.totaalOudCents) / report.totaalOudCents) * 100 : null;
    return report;
}
