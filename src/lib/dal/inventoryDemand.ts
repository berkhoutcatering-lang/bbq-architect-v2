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
 *
 * P0-6 (bucket D): wanneer ingredient_costs leeg of ontbreekt, valt de
 * berekening terug op gerecht_components → component_ingredients → inventory.
 * P0-7 (bucket D): naam-matching tussen ingredient en inventory probeert
 * achtereenvolgens (1) exacte norm-match, (2) org_product_aliases per tenant,
 * (3) meat_taxonomy.aliassen als laatste vangnet. Bij geen match: het
 * ingredient wordt geregistreerd in unmatched_ingredients zodat de banner
 * "Onbekende leverancier" 'm kan tonen.
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
        // String kan óók een UUID zijn (na unify_gerechten_componenten).
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

/** Resolver-context met de drie matching-paden uit P0-7.
 *  Wordt eenmalig opgebouwd per demand-call (cheap als organisatie klein is). */
interface MatchContext {
  inventoryByNorm: Map<string, any>;
  aliasToInventoryId: Map<string, number>;
  meatTaxonomyAliases: Array<{ alias: string; inventory_id: number }>;
}

function resolveInventory(rawName: string, ctx: MatchContext): any | null {
  const n = norm(rawName);
  if (!n) return null;
  // 1. Exacte norm-match op inventory.naam.
  const direct = ctx.inventoryByNorm.get(n);
  if (direct) return direct;
  // 2. Per-tenant alias (org_product_aliases).
  const aliasId = ctx.aliasToInventoryId.get(n);
  if (aliasId != null) {
    // master_product_id in alias-tabel is soft-FK naar inventory.id;
    // val toch nog terug op direct als deze id niet bestaat.
    for (const inv of ctx.inventoryByNorm.values()) {
      if (inv.id === aliasId) return inv;
    }
  }
  // 3. meat_taxonomy.aliassen — als de raw_name een synoniem is van een cut,
  //    en daar één inventory-item van bestaat dat erbij hoort, gebruik die.
  for (const entry of ctx.meatTaxonomyAliases) {
    if (entry.alias === n) {
      for (const inv of ctx.inventoryByNorm.values()) {
        if (inv.id === entry.inventory_id) return inv;
      }
    }
  }
  return null;
}

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
    .select('id, naam, categorie, unit, current_stock, min_stock, par_level, leverancier_id, yield_factor')
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

  const inventoryByNorm = new Map<string, any>();
  inventory.forEach(function (inv: any) { inventoryByNorm.set(norm(inv.naam), inv); });

  // 4. Alias-tabellen voor P0-7 resolver.
  const { data: aliasRows } = await supabase
    .from('org_product_aliases')
    .select('alias_normalized, master_product_id')
    .eq('organization_id', orgId);
  const aliasToInventoryId = new Map<string, number>();
  (aliasRows || []).forEach(function (a: any) {
    if (a.alias_normalized && typeof a.master_product_id === 'number') {
      aliasToInventoryId.set(String(a.alias_normalized).toLowerCase().trim(), a.master_product_id);
    }
  });

  // meat_taxonomy is global (geen org_id) — koppel via inventory.cut_taxonomy_id
  // óf via inventory.naam staat in aliases-array.
  const { data: taxonomyRows } = await supabase
    .from('meat_taxonomy')
    .select('id, aliassen');
  const meatTaxonomyAliases: Array<{ alias: string; inventory_id: number }> = [];
  const taxonomyAliasesByTaxId = new Map<number, string[]>();
  (taxonomyRows || []).forEach(function (t: any) {
    const arr = Array.isArray(t.aliassen) ? t.aliassen.map((a: string) => String(a).toLowerCase().trim()) : [];
    if (arr.length > 0) taxonomyAliasesByTaxId.set(t.id, arr);
  });
  // Voor elk inventory-item: als z'n naam binnen één van de taxonomy-aliassen
  // valt, koppel die aliassen aan z'n id.
  inventory.forEach(function (inv: any) {
    const invName = norm(inv.naam);
    taxonomyAliasesByTaxId.forEach(function (aliases, _taxId) {
      if (aliases.includes(invName)) {
        aliases.forEach(function (al) { meatTaxonomyAliases.push({ alias: al, inventory_id: inv.id }); });
      }
    });
  });

  const matchCtx: MatchContext = { inventoryByNorm, aliasToInventoryId, meatTaxonomyAliases };

  // 5. Voor de fallback (P0-6) verzamelen we welke gerechten leeg/null
  //    ingredient_costs hebben en laden gerecht_components voor die set.
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

    // gerecht_components + components in één hit.
    const { data: gcRows } = await supabase
      .from('gerecht_components')
      .select('gerecht_id, component_id, quantity_used, unit, components!inner(id, base_quantity, base_unit)')
      .eq('organization_id', orgId)
      .in('gerecht_id', gerechtIds);

    const componentIds: number[] = [];
    (gcRows || []).forEach(function (r: any) {
      if (typeof r.component_id === 'number') componentIds.push(r.component_id);
    });

    // component_ingredients voor die componenten.
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

  // Bijhouden welke raw-names géén match kregen — voor "Onbekende leverancier" banner.
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
          // qty_pp_in_component_unit = quantity_used (component-unit per portie).
          // Voor elk ingredient van het component:
          //   ingredient_qty_per_portion =
          //       quantity_used * (ingredient.quantity / component.base_quantity) * unit-conv
          cr.ingredients.forEach(function (ing) {
            const rawName = ing.inventory_id != null
              ? null
              : (ing.fallback_name || null);
            let inv: any = null;
            if (ing.inventory_id != null) {
              for (const i of inventoryByNorm.values()) if (i.id === ing.inventory_id) { inv = i; break; }
            } else if (rawName) {
              inv = resolveInventory(rawName, matchCtx);
            }

            const ratio = cr.component_base_qty > 0 ? cr.quantity_used / cr.component_base_qty : 0;
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

  // 7. Bouw rows.
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
