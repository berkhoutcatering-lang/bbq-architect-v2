/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Inventory demand DAL
 * ────────────────────
 * Centrale berekening van "wat heeft mijn voorraad nodig de komende N dagen
 * op basis van bevestigde events × menu × gerecht-recepten". Dit is de
 * data-laag voor de EventSpine en het bestelvoorstel.
 *
 * Canon (één formule, geen /porties, geen qty_per_guest — geverifieerd: geen
 * live event draagt qty_per_guest ≠ 1):
 *     qty_event = qty_per_guest × guests × unitFactor / yield
 *   waarbij qty_per_guest = ingredient_costs[].qty_pp (primair) of, via het
 *   component-pad, quantity_used × (ing.quantity / component.base_quantity).
 *
 * Demand-buffer (Sam: "× gasten plus altijd 10% derving"):
 *     reserved_met_derving = reserved × (1 + derving_pct/100)   // per item
 *     target   = reserved_met_derving + par_level               // par IS een
 *                bestel-ondergrens: wat je minimaal in huis wilt houden staat
 *                LOS van wat de cateringen opeten, dus het telt erbovenop
 *     shortfall = max(0, target − current_stock − in_flight)
 *
 *   Waarom optellen en niet max(): de events verbruiken je voorraad. Wil je 4 kg
 *   overhouden voor een spoedaanvraag én vraagt een catering 6 kg, dan moet er
 *   10 kg staan — bij max() zou je op 6 uitkomen en na het event op nul.
 *   in_flight = verzonden-maar-niet-ontvangen orderregels (uit inkoop_order_lines),
 *   met een guard tegen vergeten/oude 'sent'-orders (P0-1 uit de review).
 *
 * Math is server-side & deterministic — AI bemoeit zich NIET met de getallen.
 * Naam-matching + derving-constante komen uit de gedeelde inventoryMatch-module.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_DERVING_PCT,
  norm,
  unitFactor,
  buildMatchContext,
  resolveInventory,
  type MatchContext,
} from './inventoryMatch';

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
  // NIEUW: buffer + onderweg + doel maken de shortfall-berekening transparant.
  derving_pct: number;
  /** reserved_qty inclusief de dervingsbuffer, vóór par erbij komt. Apart veld
   *  zodat de "waarom dit aantal"-opbouw regel voor regel blijft optellen. */
  reserved_buffered_qty: number;
  in_flight_qty: number;
  target_qty: number;
  shortfall: number;
  events: DemandPerEvent[];
  leverancier_id: number | null;
}

/**
 * Doel en tekort voor één voorraad-item — de kern-rekenregel van de bestellijst.
 *
 * Losse pure functie zodat dit narekenbaar is zonder database eromheen. Dit is
 * het getal waar de bestelling en dus het geld aan hangt.
 *
 *   doel   = event-vraag × (1 + derving%)  +  minimale voorraad (par)
 *   tekort = max(0, doel − wat er ligt − wat onderweg is)
 */
export function berekenTekort(opts: {
  /** Som van de per-event vraag, vóór derving. */
  reserved: number;
  /** Dervingsbuffer in procenten, alleen op de event-vraag. */
  dervingPct: number;
  /** Wat je minimaal in huis wilt houden nádat de events eruit zijn. */
  parLevel: number;
  stock: number;
  inFlight: number;
}): { reservedBuffered: number; target: number; shortfall: number } {
  const reserved = Math.max(0, Number(opts.reserved) || 0);
  const par = Math.max(0, Number(opts.parLevel) || 0);
  const stock = Math.max(0, Number(opts.stock) || 0);
  const inFlight = Math.max(0, Number(opts.inFlight) || 0);
  const dervingFactor = 1 + Math.max(0, Number(opts.dervingPct) || 0) / 100;

  const reservedBuffered = reserved * dervingFactor;
  const target = reservedBuffered + par;
  const shortfall = Math.max(0, target - stock - inFlight);

  const rond = (n: number) => Math.round(n * 1000) / 1000;
  return { reservedBuffered: rond(reservedBuffered), target: rond(target), shortfall: rond(shortfall) };
}

export interface UnmatchedIngredient {
  raw_name: string;
  qty_total: number;
  unit: string | null;
  events: Array<{ event_id: number; event_name: string; event_date: string; qty: number }>;
}

export interface InventoryDemandSummary {
  rows: InventoryDemandRow[];
  events_in_window: Array<{ id: number; name: string; date: string; guests: number; status: string }>;
  unmatched: UnmatchedIngredient[];
  totals: {
    items_with_demand: number;
    items_with_shortfall: number;
    total_reserved_value_kg: number;
    window_days: number;
    window_start_iso: string;
    window_end_iso: string;
  };
}

/** Parse de menu-veld van een event naar een vlakke lijst gerecht-namen.
 *  events.menu kan zijn: id-array, menu_selectie-object (gang → string[]),
 *  of een JSON-string. Geeft altijd een gestripte naam-lijst terug. */
function extractDishNames(menuField: unknown, gerechtenById: Map<string | number, string>): string[] {
  if (!menuField) return [];
  let m: any = menuField;
  if (typeof m === 'string') {
    try { m = JSON.parse(m); } catch { return []; }
  }
  if (Array.isArray(m)) {
    return m.map(function (x) {
      if (typeof x === 'number') return gerechtenById.get(x) || '';
      if (typeof x === 'string') {
        return gerechtenById.get(x) || x;
      }
      if (x && typeof x === 'object') {
        if (x.gerecht_naam) return String(x.gerecht_naam);
        if (x.naam) return String(x.naam);
        if (x.id != null) return gerechtenById.get(x.id) || '';
      }
      return '';
    }).filter(Boolean);
  }
  if (typeof m === 'object') {
    const out: string[] = [];
    Object.keys(m).forEach(function (gangKey) {
      if (gangKey.endsWith('_vega')) return;
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

  // 1. Inventory voor deze org.
  const { data: inventoryRaw } = await supabase
    .from('inventory')
    .select('id, naam, categorie, unit, current_stock, min_stock, par_level, leverancier_id, yield_factor, derving_pct')
    .eq('organization_id', orgId);
  const inventory = inventoryRaw || [];

  // 2. Events in window met demand-status.
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

  // 3. Gerechten voor naam-resolving en ingredient_costs lookup.
  const { data: gerechtenRaw } = await supabase
    .from('gerechten')
    .select('id, naam, ingredient_costs')
    .eq('organization_id', orgId);
  const gerechten = gerechtenRaw || [];

  const gerechtenById = new Map<string | number, string>();
  const gerechtenByNorm = new Map<string, any>();
  gerechten.forEach(function (g: any) {
    if (g.id != null) gerechtenById.set(g.id, g.naam);
    gerechtenByNorm.set(norm(g.naam), g);
  });

  // 4. Gedeelde naam-resolver (exact → org_product_aliases → meat_taxonomy).
  const { data: aliasRows } = await supabase
    .from('org_product_aliases')
    .select('alias_normalized, master_product_id')
    .eq('organization_id', orgId);
  const { data: taxonomyRows } = await supabase
    .from('meat_taxonomy')
    .select('id, aliassen');
  const matchCtx: MatchContext = buildMatchContext(inventory, aliasRows, taxonomyRows);

  // 5. Fallback-pad (P0-6): gerecht_components → component_ingredients → inventory,
  //    alleen voor gerechten zonder ingredient_costs.
  const gerechtenZonderIcosts = gerechten.filter(function (g: any) {
    const ic = g.ingredient_costs;
    if (Array.isArray(ic) && ic.length > 0) return false;
    return true;
  });

  type ComponentRow = {
    gerecht_id: string | number;
    component_id: number;
    quantity_used: number;
    unit: string;
    component_base_qty: number;
    component_base_unit: string;
    ingredients: Array<{
      inventory_id: number | null;
      fallback_name: string | null;
      quantity: number;
      unit: string;
      yield_override: number | null;
    }>;
  };
  const componentsByGerecht = new Map<string, ComponentRow[]>();

  if (gerechtenZonderIcosts.length > 0) {
    const gerechtIds = gerechtenZonderIcosts.map(function (g: any) { return g.id; }).filter(Boolean);

    const { data: gcRows } = await supabase
      .from('gerecht_components')
      .select('gerecht_id, component_id, quantity_used, unit, components!inner(id, base_quantity, base_unit)')
      .eq('organization_id', orgId)
      .in('gerecht_id', gerechtIds);

    const componentIds: number[] = [];
    (gcRows || []).forEach(function (r: any) {
      if (typeof r.component_id === 'number') componentIds.push(r.component_id);
    });

    let ciRows: any[] = [];
    if (componentIds.length > 0) {
      const { data: ci } = await supabase
        .from('component_ingredients')
        .select('component_id, inventory_id, fallback_name, quantity, unit, yield_override')
        .in('component_id', componentIds);
      ciRows = ci || [];
    }
    const ciByComponent = new Map<number, any[]>();
    ciRows.forEach(function (ci: any) {
      const arr = ciByComponent.get(ci.component_id) || [];
      arr.push(ci);
      ciByComponent.set(ci.component_id, arr);
    });

    (gcRows || []).forEach(function (gc: any) {
      const comp = Array.isArray(gc.components) ? gc.components[0] : gc.components;
      if (!comp) return;
      const row: ComponentRow = {
        gerecht_id: gc.gerecht_id,
        component_id: gc.component_id,
        quantity_used: Number(gc.quantity_used) || 0,
        unit: String(gc.unit || ''),
        component_base_qty: Number(comp.base_quantity) || 1,
        component_base_unit: String(comp.base_unit || ''),
        ingredients: (ciByComponent.get(gc.component_id) || []).map(function (ci: any) {
          return {
            inventory_id: ci.inventory_id == null ? null : Number(ci.inventory_id),
            fallback_name: ci.fallback_name ?? null,
            quantity: Number(ci.quantity) || 0,
            unit: String(ci.unit || ''),
            yield_override: ci.yield_override == null ? null : Number(ci.yield_override),
          };
        }),
      };
      const k = String(gc.gerecht_id);
      const arr = componentsByGerecht.get(k) || [];
      arr.push(row);
      componentsByGerecht.set(k, arr);
    });
  }

  // 6. Aggregatie: voor elk inventory-item → lijst events die het claimen + qty.
  const demandMap = new Map<number, DemandPerEvent[]>();
  inventory.forEach(function (inv: any) { demandMap.set(inv.id, []); });

  const unmatchedAgg = new Map<string, { unit: string | null; qty_total: number; events: Map<number, DemandPerEvent> }>();

  function addDemand(invId: number, event: any, qtyForEvent: number, guests: number) {
    if (qtyForEvent <= 0) return;
    const list = demandMap.get(invId) || [];
    const existing = list.find(function (e) { return e.event_id === event.id; });
    if (existing) {
      existing.qty += qtyForEvent;
    } else {
      list.push({
        event_id: event.id,
        event_name: event.name || `Event #${event.id}`,
        event_date: event.date,
        guests,
        qty: qtyForEvent,
      });
    }
    demandMap.set(invId, list);
  }

  function addUnmatched(rawName: string, event: any, qty: number, unit: string | null, guests: number) {
    const k = norm(rawName) || rawName;
    const bucket = unmatchedAgg.get(k) || { unit, qty_total: 0, events: new Map<number, DemandPerEvent>() };
    bucket.qty_total += qty;
    if (unit && !bucket.unit) bucket.unit = unit;
    const existing = bucket.events.get(event.id);
    if (existing) existing.qty += qty;
    else bucket.events.set(event.id, {
      event_id: event.id,
      event_name: event.name || `Event #${event.id}`,
      event_date: event.date,
      guests,
      qty,
    });
    unmatchedAgg.set(k, bucket);
  }

  events.forEach(function (event: any) {
    const dishNames = extractDishNames(event.menu, gerechtenById);
    const guests = Number(event.guests) || 0;
    if (guests <= 0 || dishNames.length === 0) return;

    dishNames.forEach(function (dishName) {
      const g = gerechtenByNorm.get(norm(dishName));
      if (!g) return;

      const costs = Array.isArray(g.ingredient_costs) ? g.ingredient_costs : [];

      if (costs.length > 0) {
        // Primair pad: ingredient_costs JSONB.
        costs.forEach(function (ic: any) {
          if (!ic || !ic.naam || typeof ic.qty_pp !== 'number') return;
          const inv = resolveInventory(ic.naam, matchCtx);
          if (!inv) {
            const qtyTotal = (Number(ic.qty_pp) || 0) * guests * unitFactor(ic.unit, ic.unit);
            addUnmatched(ic.naam, event, qtyTotal, ic.unit ?? null, guests);
            return;
          }
          const factor = unitFactor(ic.unit, inv.unit);
          const yld = Number(ic.yield) || 1.0;
          const qtyForEvent = (ic.qty_pp * guests * factor) / yld;
          addDemand(inv.id, event, qtyForEvent, guests);
        });
      } else {
        // Fallback (P0-6): gerecht_components → component_ingredients → inventory.
        const compRows = componentsByGerecht.get(String(g.id)) || [];
        compRows.forEach(function (cr) {
          cr.ingredients.forEach(function (ing) {
            const rawName = ing.inventory_id != null ? null : (ing.fallback_name || null);
            let inv: any = null;
            if (ing.inventory_id != null) {
              inv = matchCtx.inventoryById.get(ing.inventory_id) || null;
            } else if (rawName) {
              inv = resolveInventory(rawName, matchCtx);
            }

            // quantity_used eerst naar de component-basis-eenheid brengen; anders geeft
            // "200 g" tegen base_unit 'kg' een factor-1000-fout in de ratio.
            const usedInBaseUnit = cr.quantity_used * unitFactor(cr.unit, cr.component_base_unit);
            const ratio = cr.component_base_qty > 0 ? usedInBaseUnit / cr.component_base_qty : 0;
            const ingPerPortionInIngUnit = ing.quantity * ratio;
            const factor = unitFactor(ing.unit, inv?.unit);
            const yld = ing.yield_override != null ? ing.yield_override : (Number(inv?.yield_factor) || 1.0);
            const qtyForEvent = (ingPerPortionInIngUnit * guests * factor) / Math.max(yld, 0.001);

            if (!inv) {
              addUnmatched(rawName || `ingredient-${ing.inventory_id}`, event, qtyForEvent, ing.unit, guests);
              return;
            }
            addDemand(inv.id, event, qtyForEvent, guests);
          });
        });
      }
    });
  });

  // 7. In-flight: verzonden-maar-niet-ontvangen orderregels per inventory_id.
  //    Bron = durable inkoop_order_lines (deel-ontvangst = qty_received < qty_ordered).
  //    Guard (P0-1): negeer vergeten 'sent'-orders waarvan het window ver voorbij is,
  //    anders zou zo'n order de vraag eeuwig blijven wegdrukken → onderbestelling.
  const inFlightByInv = new Map<number, number>();
  try {
    const { data: openLines } = await supabase
      .from('inkoop_order_lines')
      .select('inventory_id, qty_ordered, qty_received, concept_inkoop_orders!inner(status, window_end)')
      .eq('organization_id', orgId)
      .eq('concept_inkoop_orders.status', 'sent');
    const staleBefore = new Date(now.getTime() - 30 * 86400000);
    (openLines || []).forEach(function (l: any) {
      if (l.inventory_id == null) return;
      const parent = Array.isArray(l.concept_inkoop_orders) ? l.concept_inkoop_orders[0] : l.concept_inkoop_orders;
      const we = parent?.window_end ? new Date(parent.window_end) : null;
      if (we && !isNaN(we.getTime()) && we < staleBefore) return; // vergeten order → niet aftrekken
      const open = (Number(l.qty_ordered) || 0) - (Number(l.qty_received) || 0);
      if (open > 0) inFlightByInv.set(l.inventory_id, (inFlightByInv.get(l.inventory_id) || 0) + open);
    });
  } catch {
    // inkoop_order_lines bestaat mogelijk nog niet (pre-migratie) — dan geen aftrek.
  }

  // 8. Bouw rows: par + derving-buffer − voorraad − onderweg.
  const rows: InventoryDemandRow[] = inventory.map(function (inv: any) {
    const eventsForInv = demandMap.get(inv.id) || [];
    const reserved = eventsForInv.reduce(function (s, e) { return s + e.qty; }, 0);
    const stock = Number(inv.current_stock) || 0;
    const par = Number(inv.par_level) || 0;
    const dervingPct = inv.derving_pct != null ? Number(inv.derving_pct) : DEFAULT_DERVING_PCT;
    const inFlight = inFlightByInv.get(inv.id) || 0;
    // Par IS een ondergrens (Sam, 2026-07-31): "ik wil niet dat alles op is —
    // als er opeens een aanvraag komt moet ik kunnen koken". Vandaar par ÉN de
    // events, niet de hoogste van de twee: de events eten je voorraad op, dus
    // wat je minimaal wilt overhouden komt er bovenop.
    //   4 kg suiker in huis willen + een catering die 6 kg vraagt = 10 kg doel.
    const { reservedBuffered, target, shortfall } = berekenTekort({
      reserved, dervingPct, parLevel: par, stock, inFlight,
    });
    return {
      id: inv.id,
      naam: inv.naam,
      categorie: inv.categorie || '',
      unit: inv.unit || 'kg',
      current_stock: stock,
      min_stock: Number(inv.min_stock) || 0,
      par_level: inv.par_level == null ? null : par,
      reserved_qty: Math.round(reserved * 1000) / 1000,
      derving_pct: dervingPct,
      reserved_buffered_qty: Math.round(reservedBuffered * 1000) / 1000,
      in_flight_qty: Math.round(inFlight * 1000) / 1000,
      target_qty: Math.round(target * 1000) / 1000,
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

  const unmatched: UnmatchedIngredient[] = Array.from(unmatchedAgg.entries()).map(function ([raw, b]) {
    return {
      raw_name: raw,
      qty_total: Math.round(b.qty_total * 1000) / 1000,
      unit: b.unit,
      events: Array.from(b.events.values()).sort(function (a, c) { return a.event_date.localeCompare(c.event_date); }),
    };
  }).sort(function (a, b) { return b.qty_total - a.qty_total; });

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
    unmatched,
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
