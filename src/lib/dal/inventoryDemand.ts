/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Inventory demand DAL
 * ────────────────────
 * Centrale berekening van "wat heeft mijn voorraad nodig de komende N dagen
 * op basis van bevestigde events × menu × gerecht-recepten". Dit is de
 * data-laag voor de EventSpine en het bestelvoorstel.
 *
 * Pillar #1 (Event-aware voorraad): elke voorraad-pagina kan zien welke
 * items hoeveel zijn 'gereserveerd' voor welke events.
 * Pillar #2 (BBQ-yields ingebakken): gebruikt `gerechten.ingredient_costs`
 * met `qty_pp` per ingredient (Pulled Pork rauw 0.4 kg/pax, etc.).
 *
 * Demand wordt server-side berekend — AI bemoeit zich NIET met de getallen,
 * alleen met uitleg / suggesties. Productie-hoeveelheden zijn deterministic.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface DemandPerEvent {
  event_id: number;
  event_name: string;
  event_date: string;
  guests: number;
  qty: number;
}

export interface InventoryDemandRow {
  id: number;
  naam: string;
  categorie: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  par_level: number | null;
  reserved_qty: number;
  shortfall: number;
  events: DemandPerEvent[];
  leverancier_id: number | null;
}

export interface InventoryDemandSummary {
  rows: InventoryDemandRow[];
  events_in_window: Array<{ id: number; name: string; date: string; guests: number; status: string }>;
  totals: {
    items_with_demand: number;
    items_with_shortfall: number;
    total_reserved_value_kg: number;
    window_days: number;
    window_start_iso: string;
    window_end_iso: string;
  };
}

/** Normalize naam voor matching tussen inventory en ingredient_costs. */
function norm(s: string | undefined | null): string {
  return String(s || '').replace(/^\s*\[seed\]\s*/i, '').toLowerCase().trim();
}

/** Unit-factor om ingredient-eenheid (g, ml) te converteren naar inventory-eenheid (kg, L). */
function unitFactor(ingredientUnit: string | undefined, inventoryUnit: string | undefined): number {
  const iu = (ingredientUnit || '').toLowerCase();
  const inv = (inventoryUnit || '').toLowerCase();
  if (iu === 'g' && inv === 'kg') return 0.001;
  if (iu === 'ml' && inv === 'l') return 0.001;
  return 1;
}

/** Parse de menu-veld van een event naar een vlakke lijst gerecht-namen.
 *  events.menu kan zijn: id-array, menu_selectie-object (gang → string[]),
 *  of een JSON-string. Geeft altijd een gestripte naam-lijst terug. */
function extractDishNames(menuField: unknown, gerechtenById: Map<number, string>): string[] {
  if (!menuField) return [];
  // String? Probeer te parsen.
  let m: any = menuField;
  if (typeof m === 'string') {
    try { m = JSON.parse(m); } catch { return []; }
  }
  if (Array.isArray(m)) {
    // Legacy: array van id's of objecten met gerecht_naam.
    return m.map(function (x) {
      if (typeof x === 'number') return gerechtenById.get(x) || '';
      if (typeof x === 'string') return x;
      if (x && typeof x === 'object') {
        if (x.gerecht_naam) return String(x.gerecht_naam);
        if (x.naam) return String(x.naam);
        if (typeof x.id === 'number') return gerechtenById.get(x.id) || '';
      }
      return '';
    }).filter(Boolean);
  }
  if (typeof m === 'object') {
    // Modern: { voorgerecht: [...], hoofdgerecht: [...], ... }
    const out: string[] = [];
    Object.keys(m).forEach(function (gangKey) {
      if (gangKey.endsWith('_vega')) return; // vega-varianten apart
      const items = m[gangKey];
      if (!Array.isArray(items)) return;
      items.forEach(function (it) {
        if (typeof it === 'string') out.push(it);
        else if (it && typeof it === 'object') {
          if (it.gerecht_naam) out.push(String(it.gerecht_naam));
          else if (it.naam) out.push(String(it.naam));
        }
      });
    });
    return out;
  }
  return [];
}

/** Parse event.date dat soms TEXT is in YYYY-MM-DD of full ISO. */
function parseEventDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  // YYYY-MM-DD prefix is genoeg
  const s = String(d).trim();
  if (!s) return null;
  const dt = new Date(s.length === 10 ? s + 'T00:00:00' : s);
  return isNaN(dt.getTime()) ? null : dt;
}

const DEMAND_STATUSES = ['goedgekeurd', 'in_voorbereiding', 'bevestigd', 'confirmed'];

export async function getInventoryWithDemand(
  supabase: SupabaseClient,
  orgId: string,
  windowDays: number = 14
): Promise<InventoryDemandSummary> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowDays * 86400000);

  // 1. Inventory voor deze org
  const { data: inventoryRaw } = await supabase
    .from('inventory')
    .select('id, naam, categorie, unit, current_stock, min_stock, par_level, leverancier_id')
    .eq('organization_id', orgId);
  const inventory = inventoryRaw || [];

  // 2. Events in window met demand-status
  const { data: eventsRaw } = await supabase
    .from('events')
    .select('id, name, date, guests, status, menu, organization_id')
    .eq('organization_id', orgId);
  const events = (eventsRaw || []).filter(function (e: any) {
    if (!DEMAND_STATUSES.includes(String(e.status || '').toLowerCase())) return false;
    const ed = parseEventDate(e.date);
    if (!ed) return false;
    return ed >= now && ed <= windowEnd;
  });

  // 3. Gerechten voor naam-resolving en ingredient_costs lookup
  const { data: gerechtenRaw } = await supabase
    .from('gerechten')
    .select('id, naam, ingredient_costs')
    .eq('organization_id', orgId);
  const gerechten = gerechtenRaw || [];

  // Maps voor snelle lookup
  const gerechtenById = new Map<number, string>();
  const gerechtenByNorm = new Map<string, any>();
  gerechten.forEach(function (g: any) {
    if (typeof g.id === 'number') gerechtenById.set(g.id, g.naam);
    gerechtenByNorm.set(norm(g.naam), g);
  });

  const inventoryByNorm = new Map<string, any>();
  inventory.forEach(function (inv: any) { inventoryByNorm.set(norm(inv.naam), inv); });

  // Aggregatie: voor elk inventory-item → lijst events die het claimen + qty
  const demandMap = new Map<number, DemandPerEvent[]>();
  inventory.forEach(function (inv: any) { demandMap.set(inv.id, []); });

  events.forEach(function (event: any) {
    const dishNames = extractDishNames(event.menu, gerechtenById);
    const guests = Number(event.guests) || 0;
    if (guests <= 0 || dishNames.length === 0) return;

    // Per gerecht in menu: itereer ingredient_costs
    dishNames.forEach(function (dishName) {
      const g = gerechtenByNorm.get(norm(dishName));
      if (!g) return;
      const costs = Array.isArray(g.ingredient_costs) ? g.ingredient_costs : [];
      costs.forEach(function (ic: any) {
        if (!ic || !ic.naam || typeof ic.qty_pp !== 'number') return;
        const inv = inventoryByNorm.get(norm(ic.naam));
        if (!inv) return; // ingredient niet in voorraad-lijst — geen demand
        const factor = unitFactor(ic.unit, inv.unit);
        const yld = Number(ic.yield) || 1.0;
        const qtyForEvent = (ic.qty_pp * guests * factor) / yld;
        if (qtyForEvent <= 0) return;
        const list = demandMap.get(inv.id) || [];
        // Mogelijk komt dezelfde inventory meerdere keren voor in 1 event
        // (verschillende gerechten gebruiken hetzelfde ingredient) — bundel per event.
        const existing = list.find(function (e) { return e.event_id === event.id; });
        if (existing) {
          existing.qty += qtyForEvent;
        } else {
          list.push({
            event_id: event.id,
            event_name: event.name || `Event #${event.id}`,
            event_date: event.date,
            guests: guests,
            qty: qtyForEvent,
          });
        }
        demandMap.set(inv.id, list);
      });
    });
  });

  // Bouw rows
  const rows: InventoryDemandRow[] = inventory.map(function (inv: any) {
    const eventsForInv = demandMap.get(inv.id) || [];
    const reserved = eventsForInv.reduce(function (s, e) { return s + e.qty; }, 0);
    const stock = Number(inv.current_stock) || 0;
    const shortfall = Math.max(0, reserved - stock);
    return {
      id: inv.id,
      naam: inv.naam,
      categorie: inv.categorie || '',
      unit: inv.unit || 'kg',
      current_stock: stock,
      min_stock: Number(inv.min_stock) || 0,
      par_level: inv.par_level == null ? null : Number(inv.par_level),
      reserved_qty: Math.round(reserved * 1000) / 1000,
      shortfall: Math.round(shortfall * 1000) / 1000,
      events: eventsForInv.sort(function (a, b) { return a.event_date.localeCompare(b.event_date); }),
      leverancier_id: inv.leverancier_id ?? null,
    };
  }).filter(function (r) { return r.reserved_qty > 0 || r.events.length > 0 || r.shortfall > 0 || r.current_stock > 0; });

  const itemsWithDemand = rows.filter(function (r) { return r.reserved_qty > 0; }).length;
  const itemsWithShortfall = rows.filter(function (r) { return r.shortfall > 0; }).length;
  const totalReservedKg = rows.reduce(function (s, r) {
    return s + (r.unit.toLowerCase() === 'kg' ? r.reserved_qty : 0);
  }, 0);

  return {
    rows: rows.sort(function (a, b) { return b.shortfall - a.shortfall || b.reserved_qty - a.reserved_qty; }),
    events_in_window: events.map(function (e: any) {
      return {
        id: e.id,
        name: e.name || `Event #${e.id}`,
        date: e.date,
        guests: Number(e.guests) || 0,
        status: String(e.status || ''),
      };
    }).sort(function (a, b) { return a.date.localeCompare(b.date); }),
    totals: {
      items_with_demand: itemsWithDemand,
      items_with_shortfall: itemsWithShortfall,
      total_reserved_value_kg: Math.round(totalReservedKg * 100) / 100,
      window_days: windowDays,
      window_start_iso: now.toISOString(),
      window_end_iso: windowEnd.toISOString(),
    },
  };
}
