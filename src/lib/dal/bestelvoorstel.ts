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
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getInventoryWithDemand, type InventoryDemandRow } from './inventoryDemand';

export interface BestelvoorstelItem {
  inventory_id: number;
  naam: string;
  qty: number;                   // shortfall vs current_stock
  unit: string;
  unit_price_eur: number | null; // last_price_eur uit inventory (cache uit price_history)
  est_total_eur: number;         // qty * unit_price
  last_price_at: string | null;
  events_count: number;          // hoeveel events dragen bij aan deze shortfall
  events: Array<{ event_id: number; event_name: string; event_date: string; qty: number }>;
}

export interface BestelvoorstelLeverancier {
  leverancier_id: number | null; // null = onbekend bucket
  leverancier_naam: string;
  leverancier_type: string;
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
}

export async function buildBestelvoorstel(
  supabase: SupabaseClient,
  orgId: string,
  windowDays: number = 14
): Promise<BestelvoorstelSummary> {
  // 1. Demand-snapshot ophalen (event × inventory × shortfall)
  const demand = await getInventoryWithDemand(supabase, orgId, windowDays);
  const shortItems = demand.rows.filter(function (r) { return r.shortfall > 0; });

  if (shortItems.length === 0) {
    return {
      per_leverancier: [],
      totals: {
        items_total: 0,
        leveranciers_count: 0,
        estimated_total_eur: 0,
        window_days: windowDays,
      },
      has_unknown_supplier: false,
    };
  }

  // 2. Inventory-meta ophalen (incl. last_price_eur) voor alle short-items
  const inventoryIds = shortItems.map(function (r) { return r.id; });
  const { data: invRows } = await supabase
    .from('inventory')
    .select('id, leverancier_id, last_price_eur, last_price_at, last_price_leverancier_id, purchase_price')
    .in('id', inventoryIds);
  const invMap = new Map<number, any>();
  (invRows || []).forEach(function (r: any) { invMap.set(r.id, r); });

  // 3. Leveranciers-meta
  const supplierIdsSet = new Set<number>();
  (invRows || []).forEach(function (r: any) {
    const supId = r.last_price_leverancier_id ?? r.leverancier_id;
    if (supId) supplierIdsSet.add(supId);
  });
  const supplierIds = Array.from(supplierIdsSet);

  let suppliers: Record<number, { naam: string; type: string }> = {};
  if (supplierIds.length > 0) {
    const { data: levRows } = await supabase
      .from('leveranciers')
      .select('id, naam, type')
      .in('id', supplierIds);
    (levRows || []).forEach(function (l: any) { suppliers[l.id] = { naam: l.naam, type: l.type || 'Overig' }; });
  }

  // 4. Groeperen
  const grouped = new Map<number | string, BestelvoorstelLeverancier>();

  function getBucket(key: number | null): BestelvoorstelLeverancier {
    const k: number | string = key == null ? '__unknown' : key;
    let b = grouped.get(k);
    if (!b) {
      const meta = key && suppliers[key];
      b = {
        leverancier_id: key,
        leverancier_naam: meta ? meta.naam : 'Nog te kiezen',
        leverancier_type: meta ? meta.type : 'Overig',
        items: [],
        subtotal_eur: 0,
      };
      grouped.set(k, b);
    }
    return b;
  }

  shortItems.forEach(function (r: InventoryDemandRow) {
    const invMeta = invMap.get(r.id) || {};
    const supId: number | null = invMeta.last_price_leverancier_id ?? invMeta.leverancier_id ?? r.leverancier_id ?? null;
    const price = Number(invMeta.last_price_eur || invMeta.purchase_price || 0);
    const estTotal = price > 0 ? r.shortfall * price : 0;
    const item: BestelvoorstelItem = {
      inventory_id: r.id,
      naam: r.naam,
      qty: r.shortfall,
      unit: r.unit,
      unit_price_eur: price > 0 ? price : null,
      est_total_eur: estTotal,
      last_price_at: invMeta.last_price_at || null,
      events_count: r.events.length,
      events: r.events.map(function (e) { return { event_id: e.event_id, event_name: e.event_name, event_date: e.event_date, qty: e.qty }; }),
    };
    const bucket = getBucket(supId);
    bucket.items.push(item);
    bucket.subtotal_eur += estTotal;
  });

  // Sorteer: bekende leveranciers eerst (alfabetisch), onbekend laatst
  const list = Array.from(grouped.values()).sort(function (a, b) {
    if (a.leverancier_id == null && b.leverancier_id != null) return 1;
    if (b.leverancier_id == null && a.leverancier_id != null) return -1;
    return a.leverancier_naam.localeCompare(b.leverancier_naam, 'nl');
  });
  list.forEach(function (l) {
    l.items.sort(function (a, b) { return b.qty - a.qty; });
    l.subtotal_eur = Math.round(l.subtotal_eur * 100) / 100;
  });

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
    has_unknown_supplier: list.some(function (l) { return l.leverancier_id == null; }),
  };
}
