/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Order-overrides DAL
 * ───────────────────
 * Override-laag bovenop bestelvoorstel. Eén rij per (concept_order, inventory):
 *   - override_qty: gebruiker schoof het bedrag bij
 *   - override_leverancier_id: gebruiker koos een andere leverancier
 *   - removed: gebruiker wil dit item niet bestellen
 *
 * UPSERT-pattern: setOverride() schrijft naar een unieke (concept_order, inventory).
 * Wanneer ALLE override-velden null/false zijn verwijderen we de rij — zodat
 * bestelvoorstel niet zinloos extra werk doet.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface OrderOverride {
    id: string;
    organization_id: string;
    concept_order_id: string;
    inventory_id: number;
    override_qty: number | null;
    override_leverancier_id: number | null;
    removed: boolean;
    note: string | null;
    created_at: string;
    updated_at: string;
}

export interface SetOverrideInput {
    override_qty?: number | null;
    override_leverancier_id?: number | null;
    removed?: boolean;
    note?: string | null;
}

/** UPSERT-helper. Wanneer het resultaat "geen wijziging" wordt (alles null/false)
 *  verwijderen we de rij — voorkomt no-op rijen. */
export async function setOverride(
    sb: SupabaseClient,
    orgId: string,
    conceptOrderId: string,
    inventoryId: number,
    fields: SetOverrideInput,
): Promise<OrderOverride | null> {
    // Lees bestaande override (mag null zijn).
    const { data: existing } = await sb
        .from('order_overrides')
        .select('*')
        .eq('concept_order_id', conceptOrderId)
        .eq('inventory_id', inventoryId)
        .maybeSingle();

    const merged = {
        override_qty: fields.override_qty !== undefined ? fields.override_qty : existing?.override_qty ?? null,
        override_leverancier_id:
            fields.override_leverancier_id !== undefined
                ? fields.override_leverancier_id
                : existing?.override_leverancier_id ?? null,
        removed: fields.removed !== undefined ? fields.removed : existing?.removed ?? false,
        note: fields.note !== undefined ? fields.note : existing?.note ?? null,
    };

    // Niets meer over → rij weghalen.
    const isEmpty =
        merged.override_qty == null
        && merged.override_leverancier_id == null
        && merged.removed === false
        && (merged.note == null || merged.note.trim() === '');

    if (isEmpty) {
        if (existing) {
            await sb.from('order_overrides').delete().eq('id', existing.id);
        }
        return null;
    }

    // UPSERT — uniek op (concept_order_id, inventory_id) door table-constraint.
    const { data, error } = await sb
        .from('order_overrides')
        .upsert(
            {
                organization_id: orgId,
                concept_order_id: conceptOrderId,
                inventory_id: inventoryId,
                ...merged,
            },
            { onConflict: 'concept_order_id,inventory_id' },
        )
        .select('*')
        .single();

    if (error) throw new Error('Override opslaan mislukt: ' + error.message);
    return data as OrderOverride;
}

/** Alle overrides voor één order. */
export async function getOverridesByOrder(
    sb: SupabaseClient,
    conceptOrderId: string,
): Promise<OrderOverride[]> {
    const { data, error } = await sb
        .from('order_overrides')
        .select('*')
        .eq('concept_order_id', conceptOrderId);
    if (error) throw new Error('Overrides ophalen mislukt: ' + error.message);
    return (data as OrderOverride[]) ?? [];
}

/** Alle overrides voor alle open concept-orders van een org. Gebruikt door
 *  bestelvoorstel.ts om in één query de overrides te laden zodat we per
 *  inventory_id snel kunnen toepassen. */
export async function getOverridesForOrg(
    sb: SupabaseClient,
    orgId: string,
): Promise<OrderOverride[]> {
    const { data, error } = await sb
        .from('order_overrides')
        .select('*, concept_inkoop_orders!inner(status)')
        .eq('organization_id', orgId)
        .eq('concept_inkoop_orders.status', 'concept');
    if (error) {
        // Sommige Postgrest-versies vereisen quoting van de relation-alias;
        // bij syntax-fout val terug op simpele query zonder status-filter.
        if (/syntax|relation/i.test(error.message)) {
            const { data: fb } = await sb
                .from('order_overrides')
                .select('*')
                .eq('organization_id', orgId);
            return (fb as OrderOverride[]) ?? [];
        }
        throw new Error('Overrides ophalen mislukt: ' + error.message);
    }
    return (data as OrderOverride[]) ?? [];
}
