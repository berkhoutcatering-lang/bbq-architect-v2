/* eslint-disable @typescript-eslint/no-explicit-any */
/* componentIngredients — houdt de genormaliseerde `component_ingredients`-tabel
 * in sync met het vrije `components.ingredients` JSONB.
 *
 * Waarom: de demand-motor (component-pad) leest `component_ingredients` met een
 * échte inventory_id, maar de component-editor schreef tot nu toe alléén het
 * JSONB-veld → 0 gekoppelde rijen → de motor kon niks berekenen voor
 * component-gebaseerde gerechten. Deze helper vult de keten zodra een component
 * wordt opgeslagen: elke ingredient-naam wordt via de GEDEELDE resolver aan een
 * inventory-item gekoppeld (of als fallback_name bewaard).
 *
 * Sam-model: een gerecht = componenten; een component = receptuur met
 * ingrediënten; elk ingrediënt = een inventory-item met z'n eigen vaste
 * leverancier. Dit is de schakel die dat model laat werken.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildMatchContext, resolveInventory } from './inventoryMatch';

interface ParsedIngredient {
  name: string;
  quantity: number;
  unit: string;
}

/** Accepteer de bekende JSONB-vormen: {name|naam, qty|quantity|qty_pp, unit|eenheid}. */
function parseIngredients(raw: unknown): ParsedIngredient[] {
  let arr: any = raw;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out: ParsedIngredient[] = [];
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const name = String(it.name ?? it.naam ?? '').trim();
    if (!name) continue;
    const quantity = Number(it.qty ?? it.quantity ?? it.qty_pp ?? 0) || 0;
    const unit = String(it.unit ?? it.eenheid ?? 'stuk').trim() || 'stuk';
    out.push({ name, quantity, unit });
  }
  return out;
}

export interface SyncResult {
  linked: number; // ingrediënten gekoppeld aan een inventory-item
  unlinked: number; // bewaard als fallback_name (nog geen voorraad-match)
  error?: string;
}

/** Vervang de component_ingredients van één component door de rijen afgeleid uit
 *  het JSONB-veld. Best-effort: geeft een SyncResult terug i.p.v. te gooien, zodat
 *  de component-opslag zelf nooit faalt op dit koppelwerk. */
export async function syncComponentIngredients(
  supabase: SupabaseClient,
  orgId: string,
  componentId: number,
  ingredientsJson: unknown,
): Promise<SyncResult> {
  try {
    const parsed = parseIngredients(ingredientsJson);

    // Replace-strategie: eerst weg (org-scoped), dan opnieuw.
    await supabase
      .from('component_ingredients')
      .delete()
      .eq('component_id', componentId)
      .eq('organization_id', orgId);

    if (parsed.length === 0) return { linked: 0, unlinked: 0 };

    // Resolver-context (zelfde 3-traps match als de demand-motor).
    const [invRes, aliasRes, taxRes] = await Promise.all([
      supabase.from('inventory').select('id, naam').eq('organization_id', orgId),
      supabase.from('org_product_aliases').select('alias_normalized, master_product_id').eq('organization_id', orgId),
      supabase.from('meat_taxonomy').select('id, aliassen'),
    ]);
    const ctx = buildMatchContext(invRes.data || [], aliasRes.data, taxRes.data);

    let linked = 0;
    let unlinked = 0;
    const rows = parsed.map(function (ing) {
      const inv = resolveInventory(ing.name, ctx);
      if (inv) linked++; else unlinked++;
      return {
        organization_id: orgId,
        component_id: componentId,
        inventory_id: inv ? inv.id : null,
        fallback_name: inv ? null : ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
      };
    });

    const { error } = await supabase.from('component_ingredients').insert(rows);
    if (error) return { linked, unlinked, error: error.message };
    return { linked, unlinked };
  } catch (e) {
    return { linked: 0, unlinked: 0, error: e instanceof Error ? e.message : 'ingrediënt-sync mislukt' };
  }
}
