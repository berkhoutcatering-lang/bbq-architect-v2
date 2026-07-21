/* eslint-disable @typescript-eslint/no-explicit-any */
/* supplierBinding — de vaste leverancier-product-koppeling per voorraad-item
 * (inventory.preferred_supplier_product_id).
 *
 * Sam-model: je koopt een product áltijd bij dezelfde leverancier (om kwaliteit).
 * Die keuze zet je één keer op het product; de bestelmotor groepeert + rondt
 * dan vanzelf af op basis van die koppeling. Geen recept-override — een andere
 * kwaliteit = een ander component → ander inventory-item → eigen binding.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildMatchContext, resolveInventory } from './inventoryMatch';

export interface AutoBindResult {
  auto_bound: number; // producten 1-op-1 gekoppeld
  needs_choice: Array<{ inventory_id: number; naam: string; candidates: number }>; // meerdere kandidaten → cateraar kiest
}

/** Koppel geïmporteerde supplier_products automatisch aan voorraad-items, maar
 *  ALLEEN als het ondubbelzinnig is: het item is nog niet gekoppeld én er is
 *  precies één kandidaat-product. Bij twijfel niet gokken (needs_choice). */
export async function autoBindPreferredSuppliers(
  supabase: SupabaseClient,
  orgId: string,
  products: Array<{ id: number; name: string }>,
): Promise<AutoBindResult> {
  if (!products.length) return { auto_bound: 0, needs_choice: [] };

  const [invRes, aliasRes, taxRes] = await Promise.all([
    supabase.from('inventory').select('id, naam, preferred_supplier_product_id').eq('organization_id', orgId),
    supabase.from('org_product_aliases').select('alias_normalized, master_product_id').eq('organization_id', orgId),
    supabase.from('meat_taxonomy').select('id, aliassen'),
  ]);
  const inventory = invRes.data || [];
  const ctx = buildMatchContext(inventory, aliasRes.data, taxRes.data);

  const byInv = new Map<number, { naam: string; unbound: boolean; productIds: number[] }>();
  for (const p of products) {
    const inv = resolveInventory(p.name, ctx);
    if (!inv) continue;
    const entry = byInv.get(inv.id) || {
      naam: inv.naam,
      unbound: inv.preferred_supplier_product_id == null,
      productIds: [],
    };
    entry.productIds.push(p.id);
    byInv.set(inv.id, entry);
  }

  let autoBound = 0;
  const needsChoice: AutoBindResult['needs_choice'] = [];
  for (const [invId, e] of byInv) {
    if (!e.unbound) continue; // respecteer een bestaande keuze — nooit overschrijven
    if (e.productIds.length === 1) {
      const { error } = await supabase
        .from('inventory')
        .update({ preferred_supplier_product_id: e.productIds[0] })
        .eq('id', invId)
        .eq('organization_id', orgId);
      if (!error) autoBound++;
    } else {
      needsChoice.push({ inventory_id: invId, naam: e.naam, candidates: e.productIds.length });
    }
  }
  return { auto_bound: autoBound, needs_choice: needsChoice };
}

/** Zet (of wis) de vaste leverancier-product van een voorraad-item.
 *  Verifieert org-eigenaarschap van ZOWEL het inventory-item ALS het
 *  supplier_product (P1-2: supplier_products.id is een raadbare BIGINT, dus
 *  niet op RLS alleen vertrouwen). */
export async function setPreferredSupplierProduct(
  supabase: SupabaseClient,
  orgId: string,
  inventoryId: number,
  supplierProductId: number | null,
): Promise<void> {
  const { data: inv } = await supabase
    .from('inventory').select('id').eq('id', inventoryId).eq('organization_id', orgId).maybeSingle();
  if (!inv) throw new Error('Voorraad-item niet gevonden in eigen organisatie');

  if (supplierProductId != null) {
    const { data: sp } = await supabase
      .from('supplier_products').select('id').eq('id', supplierProductId).eq('organization_id', orgId).maybeSingle();
    if (!sp) throw new Error('Leverancier-product niet gevonden in eigen organisatie');
  }

  const { error } = await supabase
    .from('inventory')
    .update({ preferred_supplier_product_id: supplierProductId })
    .eq('id', inventoryId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Vaste leverancier opslaan mislukt: ' + error.message);
}
