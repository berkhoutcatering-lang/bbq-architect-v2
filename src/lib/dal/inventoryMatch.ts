/* eslint-disable @typescript-eslint/no-explicit-any */
/* inventoryMatch — gedeelde ingredient→inventory naam-resolver.
 *
 * Eén bron van waarheid voor het koppelen van een ruwe ingredient-naam aan een
 * inventory-item. Wordt gebruikt door de demand-motor (inventoryDemand.ts) EN
 * hoort door de voorraad-aftrek gebruikt te worden, zodat vraag en mutatie op
 * DEZELFDE inventory_id landen (P0-2 uit de review: nu gebruiken ze verschillende
 * matchers waardoor current_stock tegen een andere rij drift dan `reserved`).
 *
 * Drie trappen (zoals voorheen inline in inventoryDemand.ts):
 *   1. exacte genormaliseerde naam-match op inventory.naam
 *   2. per-tenant alias (org_product_aliases.alias_normalized → master_product_id,
 *      hier geïnterpreteerd als inventory.id — bestaande conventie)
 *   3. meat_taxonomy.aliassen als laatste vangnet
 *
 * Perf: interne inventoryById-Map vervangt de oude O(n²) values()-loops.
 */

/** Standaard derving-opslag op de receptvraag (Sam: "× gasten plus altijd 10%").
 *  Per inventory-item overschrijfbaar via inventory.derving_pct. */
export const DEFAULT_DERVING_PCT = 10;

/** Normaliseer een naam voor matching tussen inventory en ingredient. */
export function norm(s: string | undefined | null): string {
  return String(s || '')
    .replace(/^\s*\[seed\]\s*/i, '')
    .toLowerCase()
    .trim();
}

/** Unit-factor om ingredient-eenheid (g, ml) om te rekenen naar inventory-eenheid (kg, L). */
export function unitFactor(ingredientUnit: string | undefined, inventoryUnit: string | undefined): number {
  const iu = (ingredientUnit || '').toLowerCase();
  const inv = (inventoryUnit || '').toLowerCase();
  if (iu === 'g' && inv === 'kg') return 0.001;
  if (iu === 'ml' && (inv === 'l' || inv === 'liter')) return 0.001;
  return 1;
}

export interface MatchContext {
  inventoryByNorm: Map<string, any>;
  inventoryById: Map<number, any>;
  aliasToInventoryId: Map<string, number>;
  meatTaxonomyAliases: Array<{ alias: string; inventory_id: number }>;
}

/** Bouw de resolver-context uit de al-geladen rijen (één keer per demand-/aftrek-call). */
export function buildMatchContext(
  inventory: any[],
  aliasRows: any[] | null | undefined,
  taxonomyRows: any[] | null | undefined,
): MatchContext {
  const inventoryByNorm = new Map<string, any>();
  const inventoryById = new Map<number, any>();
  inventory.forEach(function (inv: any) {
    inventoryByNorm.set(norm(inv.naam), inv);
    inventoryById.set(inv.id, inv);
  });

  const aliasToInventoryId = new Map<string, number>();
  (aliasRows || []).forEach(function (a: any) {
    if (a.alias_normalized && typeof a.master_product_id === 'number') {
      aliasToInventoryId.set(String(a.alias_normalized).toLowerCase().trim(), a.master_product_id);
    }
  });

  // meat_taxonomy is globaal (geen org_id). Koppel elke taxonomy-alias aan een
  // inventory-item waarvan de naam binnen die aliassen valt.
  const taxonomyAliasesByTaxId = new Map<number, string[]>();
  (taxonomyRows || []).forEach(function (t: any) {
    const arr = Array.isArray(t.aliassen) ? t.aliassen.map((a: string) => String(a).toLowerCase().trim()) : [];
    if (arr.length > 0) taxonomyAliasesByTaxId.set(t.id, arr);
  });
  const meatTaxonomyAliases: Array<{ alias: string; inventory_id: number }> = [];
  inventory.forEach(function (inv: any) {
    const invName = norm(inv.naam);
    taxonomyAliasesByTaxId.forEach(function (aliases) {
      if (aliases.includes(invName)) {
        aliases.forEach(function (al) { meatTaxonomyAliases.push({ alias: al, inventory_id: inv.id }); });
      }
    });
  });

  return { inventoryByNorm, inventoryById, aliasToInventoryId, meatTaxonomyAliases };
}

/** Los een ruwe ingredient-naam op naar een inventory-rij, of null. */
export function resolveInventory(rawName: string, ctx: MatchContext): any | null {
  const n = norm(rawName);
  if (!n) return null;
  // 1. Exacte norm-match.
  const direct = ctx.inventoryByNorm.get(n);
  if (direct) return direct;
  // 2. Per-tenant alias.
  const aliasId = ctx.aliasToInventoryId.get(n);
  if (aliasId != null) {
    const inv = ctx.inventoryById.get(aliasId);
    if (inv) return inv;
  }
  // 3. meat_taxonomy-alias als laatste vangnet.
  for (const entry of ctx.meatTaxonomyAliases) {
    if (entry.alias === n) {
      const inv = ctx.inventoryById.get(entry.inventory_id);
      if (inv) return inv;
    }
  }
  return null;
}
