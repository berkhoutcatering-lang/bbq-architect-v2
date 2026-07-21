/* eslint-disable @typescript-eslint/no-explicit-any */
/* stockMutation — één atomaire, gedeelde route voor álle voorraad-mutaties.
 *
 * Vóór deze module muteerden 6 plekken current_stock los + niet-atomair
 * (serve, prep, 2× bon, factuur, handmatig, EventEditor), terwijl alleen de
 * ontvangst-loop de atomaire RPC `increment_inventory_stock` gebruikte. Gevolg:
 * lost-updates + drift, en juist de bestellijst leunt op current_stock.
 *
 * Nu loopt alles hierlangs:
 *   - applyStockDelta(): één RPC-call (row-lock update + movement-insert +
 *     tenant-guard + floor-op-0), best-effort (no-throw).
 *   - applyConsumption(): verbruik-lijnen (naam of inventory_id) → dezelfde
 *     resolver (resolveInventory: exact → alias → meat_taxonomy) + unit-conversie
 *     als de demand-motor, zodat vraag én aftrek op DEZELFDE inventory_id landen.
 */

import {
  buildMatchContext,
  resolveInventory,
  unitFactor,
  type MatchContext,
} from './inventoryMatch';

export type StockMovementType = 'count' | 'usage' | 'receive' | 'adjust' | 'waste';

export interface StockDeltaArgs {
  inventoryId: number;
  /** Signed: negatief = verbruik, positief = ontvangst. */
  delta: number;
  type: StockMovementType;
  unitPrice?: number | null;
  orderLineId?: string | null;
  /** bonnen.id is BIGINT (migratie 010) → number, geen uuid. */
  bonId?: number | null;
  note?: string | null;
}

/**
 * Atomaire voorraad-mutatie via de RPC. Doet in één transactie: row-lock update
 * (floor op 0), stock_movements-insert, tenant-guard. Best-effort: geeft `null`
 * terug bij fout i.p.v. te gooien, zodat service-/prep-flows nooit blokkeren.
 * Returnt de nieuwe voorraad bij succes.
 */
export async function applyStockDelta(
  supabase: any,
  orgId: string,
  args: StockDeltaArgs,
): Promise<number | null> {
  if (!args.inventoryId || !Number.isFinite(args.delta)) return null;
  try {
    const { data, error } = await supabase.rpc('increment_inventory_stock', {
      p_org: orgId,
      p_inventory_id: args.inventoryId,
      p_delta: args.delta,
      p_type: args.type,
      p_unit_price: args.unitPrice ?? null,
      p_order_line_id: args.orderLineId ?? null,
      p_note: args.note ?? null,
      p_bon_id: args.bonId ?? null,
    });
    if (error) return null;
    return typeof data === 'number' ? data : Number(data);
  } catch {
    return null;
  }
}

export interface ConsumeLine {
  /** Directe koppeling wint — geen matching nodig (bv. uit een recept-koppeling). */
  inventory_id?: number | null;
  /** Anders: ruwe ingredient-naam voor de gedeelde resolver. */
  name?: string | null;
  /** Hoeveelheid in de eenheid van `unit` (wordt server-side omgerekend). */
  qty: number;
  /** Eenheid van qty (g/ml/kg/L/stuks…). Nodig voor correcte conversie. */
  unit?: string | null;
  note?: string | null;
}

export interface ConsumeResult {
  name: string | null;
  inventory_id: number | null;
  matched: boolean;
  /** Afgetrokken hoeveelheid in inventory-eenheid (na conversie), of 0 bij mismatch. */
  deducted: number;
  new_stock: number | null;
  inventory_naam: string | null;
  unit: string | null;
}

/**
 * Trek verbruik-lijnen af via dezelfde resolver + unit-conversie als de demand-
 * motor, atomair via de RPC. Laadt de resolver-context (inventory + aliassen +
 * taxonomy) één keer. Best-effort per lijn; niet-gematchte lijnen worden
 * gerapporteerd (matched=false) zodat de UI kan waarschuwen i.p.v. stil scheef.
 */
export async function applyConsumption(
  supabase: any,
  orgId: string,
  lines: ConsumeLine[],
  opts?: { defaultType?: StockMovementType; defaultNote?: string | null },
): Promise<{ results: ConsumeResult[]; posted: number; skipped: number }> {
  const results: ConsumeResult[] = [];
  if (!Array.isArray(lines) || lines.length === 0) return { results, posted: 0, skipped: 0 };

  const type = opts?.defaultType ?? 'usage';

  // Resolver-context: exact dezelfde bronnen als inventoryDemand.ts.
  const { data: inventory } = await supabase
    .from('inventory')
    .select('id, naam, unit, current_stock')
    .eq('organization_id', orgId);
  const { data: aliasRows } = await supabase
    .from('org_product_aliases')
    .select('alias_normalized, master_product_id')
    .eq('organization_id', orgId);
  const { data: taxonomyRows } = await supabase
    .from('meat_taxonomy')
    .select('id, aliassen');
  const ctx: MatchContext = buildMatchContext(inventory || [], aliasRows, taxonomyRows);

  let posted = 0;
  let skipped = 0;

  for (const line of lines) {
    const qty = Number(line.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      results.push({ name: line.name ?? null, inventory_id: line.inventory_id ?? null, matched: false, deducted: 0, new_stock: null, inventory_naam: null, unit: null });
      skipped++;
      continue;
    }

    // Koppeling: directe inventory_id wint, anders resolver op naam.
    let inv: any = null;
    if (line.inventory_id != null) {
      inv = ctx.inventoryById.get(Number(line.inventory_id)) || null;
    }
    if (!inv && line.name) {
      inv = resolveInventory(line.name, ctx);
    }
    if (!inv) {
      results.push({ name: line.name ?? null, inventory_id: line.inventory_id ?? null, matched: false, deducted: 0, new_stock: null, inventory_naam: null, unit: null });
      skipped++;
      continue;
    }

    const deducted = qty * unitFactor(line.unit ?? undefined, inv.unit);
    const newStock = await applyStockDelta(supabase, orgId, {
      inventoryId: inv.id,
      delta: -deducted,
      type,
      note: line.note ?? opts?.defaultNote ?? null,
    });

    if (newStock == null) {
      results.push({ name: line.name ?? null, inventory_id: inv.id, matched: true, deducted: 0, new_stock: null, inventory_naam: inv.naam, unit: inv.unit });
      skipped++;
    } else {
      results.push({ name: line.name ?? null, inventory_id: inv.id, matched: true, deducted, new_stock: newStock, inventory_naam: inv.naam, unit: inv.unit });
      posted++;
    }
  }

  return { results, posted, skipped };
}
