/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Bestelvoorstel DAL
 * ──────────────────
 * Groepeert "wat moet ik bestellen voor de events komende N dagen" per
 * leverancier. Pillar #1 (event-aware) + #2 (BBQ-yields ingebakken).
 *
 * Math is server-side & deterministic — AI bemoeit zich NIET met getallen.
 * Voor leveranciers zonder match: items komen onder 'Onbekend' bucket zodat
 * cateraar handmatig een leverancier kan kiezen.
 *
 * P0-5 (bucket D): pas user-overrides toe NÁ demand-calc, VÓÓR groepering.
 * P0-3 (bucket D): zorg per leverancier-bucket dat er een open concept_order
 * bestaat zodat overrides ergens aan kunnen hangen en "Verstuur" een doel heeft.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getInventoryWithDemand, type InventoryDemandRow, type UnmatchedIngredient } from './inventoryDemand';
import { ensureConceptOrder } from './inkoopOrders';
import { getOverridesForOrg, type OrderOverride } from './orderOverrides';

export interface BestelvoorstelItem {
  inventory_id: number;
  naam: string;
  qty: number;
  unit: string;
  unit_price_eur: number | null;
  est_total_eur: number;
  last_price_at: string | null;
  events_count: number;
  events: Array<{ event_id: number; event_name: string; event_date: string; qty: number }>;
  categorie: string | null;
  // P0-5: override-metadata zodat de UI kan tonen "user-aangepast".
  override_applied: boolean;
  original_qty: number;
}

export interface BestelvoorstelLeverancier {
  leverancier_id: number | null;
  leverancier_naam: string;
  leverancier_type: string;
  leverancier_email: string | null;
  leverancier_phone: string | null;
  // Concept-order id: er bestaat altijd één voor (org, leverancier, window).
  concept_order_id: string | null;
  items: BestelvoorstelItem[];
  subtotal_eur: number;
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

  // 1. Demand-snapshot ophalen.
  const demand = await getInventoryWithDemand(supabase, orgId, windowDays);
  const shortItems = demand.rows.filter(function (r) { return r.shortfall > 0; });

  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowDays * 86400000);
  const windowStartIso = toIsoDate(now);
  const windowEndIso = toIsoDate(windowEnd);

  if (shortItems.length === 0) {
    return {
      per_leverancier: [],
      totals: {
        items_total: 0,
        leveranciers_count: 0,
        estimated_total_eur: 0,
        window_days: windowDays,
      },
      has_unknown_supplier: demand.unmatched.length > 0,
      unmatched_ingredients: demand.unmatched,
      window: { start: windowStartIso, end: windowEndIso },
    };
  }

  // 2. Inventory-meta (last_price + leverancier).
  const inventoryIds = shortItems.map(function (r) { return r.id; });
  const { data: invRows } = await supabase
    .from('inventory')
    .select('id, leverancier_id, last_price_eur, last_price_at, last_price_leverancier_id, purchase_price, categorie')
    .in('id', inventoryIds);
  const invMap = new Map<number, any>();
  (invRows || []).forEach(function (r: any) { invMap.set(r.id, r); });

  // 3. Overrides ophalen (P0-5).
  const overrides: OrderOverride[] = await getOverridesForOrg(supabase, orgId).catch(() => []);
  const overridesByInv = new Map<number, OrderOverride>();
  overrides.forEach(function (o) { overridesByInv.set(o.inventory_id, o); });

  // 4. Leveranciers-meta — eerst original supplier-ids verzamelen, daarna
  //    de override-doel-leveranciers erbij voor query-efficiency.
  const supplierIdsSet = new Set<number>();
  (invRows || []).forEach(function (r: any) {
    const supId = r.last_price_leverancier_id ?? r.leverancier_id;
    if (supId) supplierIdsSet.add(supId);
  });
  overrides.forEach(function (o) {
    if (o.override_leverancier_id) supplierIdsSet.add(o.override_leverancier_id);
  });
  const supplierIds = Array.from(supplierIdsSet);

  type SupplierMeta = { naam: string; type: string; email: string | null; phone: string | null };
  let suppliers: Record<number, SupplierMeta> = {};
  if (supplierIds.length > 0) {
    const { data: levRows } = await supabase
      .from('leveranciers')
      .select('id, naam, type, email, tel')
      .in('id', supplierIds);
    (levRows || []).forEach(function (l: any) {
      suppliers[l.id] = {
        naam: l.naam,
        type: l.type || 'Overig',
        email: l.email || null,
        phone: l.tel || null,
      };
    });
  }

  // 5. Groeperen + overrides toepassen.
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
      };
      grouped.set(k, b);
    }
    return b;
  }

  shortItems.forEach(function (r: InventoryDemandRow) {
    const ov = overridesByInv.get(r.id);
    if (ov?.removed) return; // item verwijderd door gebruiker

    const invMeta = invMap.get(r.id) || {};
    const defaultSupId: number | null =
      invMeta.last_price_leverancier_id ?? invMeta.leverancier_id ?? r.leverancier_id ?? null;
    const effectiveSupId = ov?.override_leverancier_id ?? defaultSupId;

    const price = Number(invMeta.last_price_eur || invMeta.purchase_price || 0);
    const originalQty = r.shortfall;
    const effectiveQty = ov?.override_qty != null ? Number(ov.override_qty) : originalQty;
    if (effectiveQty <= 0) return;

    const estTotal = price > 0 ? effectiveQty * price : 0;

    const item: BestelvoorstelItem = {
      inventory_id: r.id,
      naam: r.naam,
      qty: effectiveQty,
      unit: r.unit,
      unit_price_eur: price > 0 ? price : null,
      est_total_eur: Math.round(estTotal * 100) / 100,
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
    bucket.subtotal_eur += estTotal;
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

  // 6. Per leverancier-bucket een concept-order garanderen (skipable voor read-only contexts).
  if (persistConcepts) {
    for (const bucket of list) {
      if (bucket.items.length === 0) continue;
      try {
        bucket.concept_order_id = await ensureConceptOrder(
          supabase, orgId, bucket.leverancier_id, windowStartIso, windowEndIso,
        );
      } catch (e) {
        // Best-effort — UI werkt ook zonder concept_order_id, alleen overrides kunnen
        // dan niet opgeslagen worden. Log voor debug maar break the build niet.
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
    window: { start: windowStartIso, end: windowEndIso },
  };
}
