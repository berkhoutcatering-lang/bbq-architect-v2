/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Bestelvoorstel DAL
 * ──────────────────
 * Groepeert "wat moet ik bestellen voor de events komende N dagen" per
 * leverancier. Math is server-side & deterministic — AI bemoeit zich NIET met
 * de getallen.
 *
 * Nieuw t.o.v. v1:
 *  - Vaste leverancier-koppeling (inventory.preferred_supplier_product_id) bepaalt
 *    de leverancier-bucket én levert de pakmaat voor de afronding.
 *  - Pak-afronding: besteld = ceil(nodig / pak) × pak (packRounding.ts).
 *  - Elke regel draagt `qty_needed` (kaal tekort) én `qty_ordered` (afgerond).
 *  - Prijs-precedentie: last_price_eur → purchase_price → onbekend. NOOIT stil €0:
 *    onbekende prijs → price_unknown=true en telt niet mee in het subtotaal.
 *    (supplier_products.price_cents blijft buiten de prijs tot fase-2 de eenheid
 *    opschoont — die kolom is nu inconsistent pak- vs per-eenheid.)
 *  - `blocking`: ongekoppelde ingrediënten → verzenden op slot (onderbestelling).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getInventoryWithDemand, type InventoryDemandRow, type UnmatchedIngredient } from './inventoryDemand';
import { ensureConceptOrder } from './inkoopOrders';
import { getOverridesForOrg, type OrderOverride } from './orderOverrides';
import { roundUpToPack, type RoundingReason } from './packRounding';

export interface BestelvoorstelItem {
  inventory_id: number;
  naam: string;
  qty: number; // = qty_ordered (backward-compat voor bestaande UI/PDF)
  qty_needed: number; // kaal tekort (na derving + onderweg)
  qty_ordered: number; // afgerond naar hele pakken
  packs: number | null;
  pack_label: string | null;
  pack_size: number | null;
  pack_unit: string | null;
  rounding_reason: RoundingReason;
  supplier_product_id: number | null;
  unit: string;
  unit_price_eur: number | null;
  price_source: 'last_price' | 'purchase_price' | 'unknown';
  price_unknown: boolean;
  est_total_eur: number; // 0 bij onbekende prijs (zie price_unknown) — nooit "stil" een prijs verzinnen
  last_price_at: string | null;
  events_count: number;
  events: Array<{ event_id: number; event_name: string; event_date: string; qty: number }>;
  categorie: string | null;
  override_applied: boolean;
  original_qty: number;
}

export interface BestelvoorstelLeverancier {
  leverancier_id: number | null;
  leverancier_naam: string;
  leverancier_type: string;
  leverancier_email: string | null;
  leverancier_phone: string | null;
  concept_order_id: string | null;
  items: BestelvoorstelItem[];
  subtotal_eur: number;
  subtotal_incomplete: boolean; // true = er zitten items zonder prijs in deze bucket
}

export interface OrderBlocker {
  raw_name: string;
  qty_total: number;
  unit: string | null;
  affected_events: Array<{ event_id: number; event_name: string; event_date: string; qty: number }>;
}

export interface BestelvoorstelSummary {
  per_leverancier: BestelvoorstelLeverancier[];
  totals: {
    items_total: number;
    leveranciers_count: number;
    estimated_total_eur: number;
    window_days: number;
  };
  has_unknown_supplier: boolean;
  unmatched_ingredients: UnmatchedIngredient[];
  // Blokkerende koppel-waarschuwing: zolang is_blocked, mag "verstuur alle orders" niet.
  blocking: {
    is_blocked: boolean;
    unmatched_count: number;
    affected_event_count: number;
    items: OrderBlocker[];
    message: string;
  };
  window: { start: string; end: string };
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function buildBestelvoorstel(
  supabase: SupabaseClient,
  orgId: string,
  windowDays: number = 14,
  opts: { persistConcepts?: boolean } = {},
): Promise<BestelvoorstelSummary> {
  const persistConcepts = opts.persistConcepts !== false;

  // 1. Demand-snapshot (bevat al derving + par + in-flight in de shortfall).
  const demand = await getInventoryWithDemand(supabase, orgId, windowDays);
  const shortItems = demand.rows.filter(function (r) { return r.shortfall > 0; });

  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowDays * 86400000);
  const windowStartIso = toIsoDate(now);
  const windowEndIso = toIsoDate(windowEnd);

  const blocking = buildBlocking(demand.unmatched);

  if (shortItems.length === 0) {
    return {
      per_leverancier: [],
      totals: { items_total: 0, leveranciers_count: 0, estimated_total_eur: 0, window_days: windowDays },
      has_unknown_supplier: demand.unmatched.length > 0,
      unmatched_ingredients: demand.unmatched,
      blocking,
      window: { start: windowStartIso, end: windowEndIso },
    };
  }

  // 2. Inventory-meta (last_price + leverancier + vaste supplier_product-koppeling).
  const inventoryIds = shortItems.map(function (r) { return r.id; });
  const { data: invRows } = await supabase
    .from('inventory')
    .select('id, leverancier_id, last_price_eur, last_price_at, last_price_leverancier_id, purchase_price, categorie, preferred_supplier_product_id')
    .in('id', inventoryIds);
  const invMap = new Map<number, any>();
  (invRows || []).forEach(function (r: any) { invMap.set(r.id, r); });

  // 2b. Gekoppelde supplier_products (leverancier + pakmaat).
  const spIds: number[] = [];
  (invRows || []).forEach(function (r: any) {
    if (typeof r.preferred_supplier_product_id === 'number') spIds.push(r.preferred_supplier_product_id);
  });
  const spById = new Map<number, any>();
  if (spIds.length > 0) {
    const { data: spRows } = await supabase
      .from('supplier_products')
      .select('id, supplier_id, package_size, package_unit')
      .eq('organization_id', orgId)
      .in('id', spIds);
    (spRows || []).forEach(function (s: any) { spById.set(s.id, s); });
  }

  // 3. Overrides (P0-5).
  const overrides: OrderOverride[] = await getOverridesForOrg(supabase, orgId).catch(() => []);
  const overridesByInv = new Map<number, OrderOverride>();
  overrides.forEach(function (o) { overridesByInv.set(o.inventory_id, o); });

  // 4. Leveranciers-meta (vaste binding, override-doel, last-price, legacy FK).
  const supplierIdsSet = new Set<number>();
  (invRows || []).forEach(function (r: any) {
    const sp = typeof r.preferred_supplier_product_id === 'number' ? spById.get(r.preferred_supplier_product_id) : null;
    const supId = sp?.supplier_id ?? r.last_price_leverancier_id ?? r.leverancier_id;
    if (supId) supplierIdsSet.add(supId);
  });
  overrides.forEach(function (o) {
    if (o.override_leverancier_id) supplierIdsSet.add(o.override_leverancier_id);
  });
  const supplierIds = Array.from(supplierIdsSet);

  type SupplierMeta = { naam: string; type: string; email: string | null; phone: string | null };
  const suppliers: Record<number, SupplierMeta> = {};
  if (supplierIds.length > 0) {
    const { data: levRows } = await supabase
      .from('leveranciers')
      .select('id, naam, type, email, tel')
      .in('id', supplierIds);
    (levRows || []).forEach(function (l: any) {
      suppliers[l.id] = { naam: l.naam, type: l.type || 'Overig', email: l.email || null, phone: l.tel || null };
    });
  }

  // 5. Groeperen + overrides + pak-afronding + prijs.
  const grouped = new Map<number | string, BestelvoorstelLeverancier>();

  function getBucket(key: number | null): BestelvoorstelLeverancier {
    const k: number | string = key == null ? '__unknown' : key;
    let b = grouped.get(k);
    if (!b) {
      const meta = key != null ? suppliers[key] : null;
      b = {
        leverancier_id: key,
        leverancier_naam: meta ? meta.naam : 'Nog te kiezen',
        leverancier_type: meta ? meta.type : 'Overig',
        leverancier_email: meta ? meta.email : null,
        leverancier_phone: meta ? meta.phone : null,
        concept_order_id: null,
        items: [],
        subtotal_eur: 0,
        subtotal_incomplete: false,
      };
      grouped.set(k, b);
    }
    return b;
  }

  shortItems.forEach(function (r: InventoryDemandRow) {
    const ov = overridesByInv.get(r.id);
    if (ov?.removed) return;

    const invMeta = invMap.get(r.id) || {};
    const sp = typeof invMeta.preferred_supplier_product_id === 'number'
      ? spById.get(invMeta.preferred_supplier_product_id)
      : null;

    // Leverancier-bucket: order-override → vaste binding → last-price → legacy FK.
    const defaultSupId: number | null =
      sp?.supplier_id ?? invMeta.last_price_leverancier_id ?? invMeta.leverancier_id ?? r.leverancier_id ?? null;
    const effectiveSupId = ov?.override_leverancier_id ?? defaultSupId;

    // Nodig (kaal tekort of user-override) → afronden op pakmaat van het supplier_product.
    const originalQty = r.shortfall;
    const needed = ov?.override_qty != null ? Number(ov.override_qty) : originalQty;
    if (needed <= 0) return;

    const packed = roundUpToPack(needed, r.unit, {
      package_size: sp?.package_size ?? null,
      package_unit: sp?.package_unit ?? null,
      moq_packs: null,
    });

    // Prijs per inventory-eenheid: last_price (bon-historie) → purchase_price → onbekend.
    let unitPriceEur: number | null = null;
    let priceSource: 'last_price' | 'purchase_price' | 'unknown';
    if (invMeta.last_price_eur != null) {
      unitPriceEur = Number(invMeta.last_price_eur);
      priceSource = 'last_price';
    } else if (invMeta.purchase_price != null) {
      unitPriceEur = Number(invMeta.purchase_price);
      priceSource = 'purchase_price';
    } else {
      priceSource = 'unknown';
    }
    const priceUnknown = priceSource === 'unknown' || unitPriceEur == null || !(unitPriceEur > 0);
    const estTotal = priceUnknown ? 0 : Math.round(packed.qty_ordered * (unitPriceEur as number) * 100) / 100;

    const item: BestelvoorstelItem = {
      inventory_id: r.id,
      naam: r.naam,
      qty: packed.qty_ordered,
      qty_needed: packed.qty_needed,
      qty_ordered: packed.qty_ordered,
      packs: packed.packs,
      pack_label: packed.packs != null ? `${packed.packs}× ${packed.pack_size} ${packed.pack_unit}` : null,
      pack_size: packed.pack_size,
      pack_unit: packed.pack_unit,
      rounding_reason: packed.reason,
      supplier_product_id: sp?.id ?? null,
      unit: r.unit,
      unit_price_eur: priceUnknown ? null : unitPriceEur,
      price_source: priceSource,
      price_unknown: priceUnknown,
      est_total_eur: estTotal,
      last_price_at: invMeta.last_price_at || null,
      events_count: r.events.length,
      events: r.events.map(function (e) {
        return { event_id: e.event_id, event_name: e.event_name, event_date: e.event_date, qty: e.qty };
      }),
      categorie: invMeta.categorie ?? r.categorie ?? null,
      override_applied: !!ov && (ov.override_qty != null || ov.override_leverancier_id != null),
      original_qty: originalQty,
    };

    const bucket = getBucket(effectiveSupId);
    bucket.items.push(item);
    if (item.price_unknown) bucket.subtotal_incomplete = true;
    else bucket.subtotal_eur += estTotal;
  });

  // Sorteer.
  const list = Array.from(grouped.values()).sort(function (a, b) {
    if (a.leverancier_id == null && b.leverancier_id != null) return 1;
    if (b.leverancier_id == null && a.leverancier_id != null) return -1;
    return a.leverancier_naam.localeCompare(b.leverancier_naam, 'nl');
  });
  list.forEach(function (l) {
    l.items.sort(function (a, b) { return b.qty - a.qty; });
    l.subtotal_eur = Math.round(l.subtotal_eur * 100) / 100;
  });

  // 6. Per bucket een concept-order garanderen.
  if (persistConcepts) {
    for (const bucket of list) {
      if (bucket.items.length === 0) continue;
      try {
        bucket.concept_order_id = await ensureConceptOrder(
          supabase, orgId, bucket.leverancier_id, windowStartIso, windowEndIso,
        );
      } catch (e) {
        console.warn('[bestelvoorstel] ensureConceptOrder failed for', bucket.leverancier_naam, e);
      }
    }
  }

  const totalItems = list.reduce(function (s, l) { return s + l.items.length; }, 0);
  const totalEur = list.reduce(function (s, l) { return s + l.subtotal_eur; }, 0);

  return {
    per_leverancier: list,
    totals: {
      items_total: totalItems,
      leveranciers_count: list.filter(function (l) { return l.leverancier_id != null; }).length,
      estimated_total_eur: Math.round(totalEur * 100) / 100,
      window_days: windowDays,
    },
    has_unknown_supplier: list.some(function (l) { return l.leverancier_id == null; }) || demand.unmatched.length > 0,
    unmatched_ingredients: demand.unmatched,
    blocking,
    window: { start: windowStartIso, end: windowEndIso },
  };
}

function buildBlocking(unmatched: UnmatchedIngredient[]) {
  const affectedEvents = new Set<number>();
  unmatched.forEach(function (u) { u.events.forEach(function (e) { affectedEvents.add(e.event_id); }); });
  return {
    is_blocked: unmatched.length > 0,
    unmatched_count: unmatched.length,
    affected_event_count: affectedEvents.size,
    items: unmatched.map(function (u): OrderBlocker {
      return { raw_name: u.raw_name, qty_total: u.qty_total, unit: u.unit, affected_events: u.events };
    }),
    message: unmatched.length > 0
      ? `${unmatched.length} ingrediënt(en) van ${affectedEvents.size} event(s) zijn niet gekoppeld aan voorraad — hierdoor bestel je te weinig. Koppel ze eerst.`
      : '',
  };
}
