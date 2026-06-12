/**
 * Server Actions voor voorraad-CRUD (P0.27).
 *
 * Hard rule 5 (BBQ Architect): Zod-validatie + re-auth in elke action.
 * RLS doet tenant-isolatie via `organization_id` policies op `inventory`
 * en `stock_movements`.
 *
 * Naast CRUD ook `adjustStock(...)` voor delta-mutaties met optionele
 * audit-log naar `stock_movements`. Negative-stock-prevention zit hier
 * server-side zodat een gemanipuleerde request niet onder 0 kan komen.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

/* ─── Schemas ────────────────────────────────────────────────── */

const InventoryItemSchema = z.object({
    id: z.coerce.number().int().optional(),
    naam: z.string().min(1, 'Naam is verplicht').max(200),
    categorie: z.string().max(100).optional().default(''),
    current_stock: z.coerce.number().min(0, 'Voorraad kan niet negatief zijn').default(0),
    min_stock: z.coerce.number().min(0).optional().default(0),
    par_level: z.coerce.number().min(0).optional().default(0),
    unit: z.string().max(50).optional().default('stuks'),
    purchase_price: z.coerce.number().min(0).optional().default(0),
    supplier: z.string().max(200).optional().default(''),
    leverancier_id: z.coerce.number().int().nullable().optional(),
    yield_factor: z.coerce.number().min(0).max(2).optional(),
    tht: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    avg_daily: z.coerce.number().min(0).optional(),
    allergenen: z.array(z.string()).optional().default([]),
});

const AdjustStockSchema = z.object({
    inventory_id: z.coerce.number().int().positive(),
    /* Delta kan negatief zijn (verbruik) of positief (ontvangst). */
    delta: z.coerce.number(),
    type: z.enum(['receive', 'usage', 'count', 'waste', 'transfer']),
    note: z.string().max(500).optional(),
});

export type InventoryItemInput = z.input<typeof InventoryItemSchema>;
export type AdjustStockInput = z.input<typeof AdjustStockSchema>;

interface ActionResult<T = unknown> {
    data?: T;
    error?: string;
    fields?: Record<string, string[]>;
}

/* ─── upsertInventory ─────────────────────────────────────────── */

export async function upsertInventory(input: unknown): Promise<ActionResult<{ id: number }>> {
    const parsed = InventoryItemSchema.safeParse(input);
    if (!parsed.success) {
        return {
            error: 'validation',
            fields: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        };
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    const { id, ...rest } = parsed.data;

    /* RLS-fix 2026-06-12: WITH CHECK op `inventory` eist organization_id —
       zonder dit veld weigert de database elke nieuwe rij stilletjes. */
    const { data: mem } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!mem?.organization_id) return { error: 'geen actieve organisatie gevonden' };

    /* Dedup-check op naam binnen tenant. RLS scope't dit automatisch
       op de eigen organization_id; client kan niet over tenant-grenzen
       kijken. Migration 028 voegde een UNIQUE-index toe als laatste
       vangnet, maar dit pad geeft een leesbare error. */
    if (!id) {
        const naamNorm = rest.naam.trim().toLowerCase();
        const { data: existing } = await supabase
            .from('inventory')
            .select('id, naam')
            .ilike('naam', naamNorm)
            .limit(1);
        if (existing && existing.length > 0) {
            return { error: `"${existing[0].naam}" bestaat al in voorraad — bewerk dat item i.p.v. nieuw aan te maken` };
        }
    }

    if (id) {
        const { data, error } = await supabase
            .from('inventory')
            .update(rest)
            .eq('id', id)
            .select('id')
            .single();
        if (error) return { error: error.message };
        revalidatePath('/voorraad');
        return { data: { id: data.id } };
    }

    const { data, error } = await supabase
        .from('inventory')
        .insert({ ...rest, organization_id: mem.organization_id })
        .select('id')
        .single();
    if (error) {
        /* Race-condition vangnet: DB-unique-index (ux_inventory_naam_org) */
        if (String(error.message || '').includes('ux_inventory_naam_org')) {
            return { error: 'Bestaat al — kon niet toevoegen' };
        }
        return { error: error.message };
    }
    revalidatePath('/voorraad');
    return { data: { id: data.id } };
}

/* ─── deleteInventory ─────────────────────────────────────────── */

export async function deleteInventory(id: number): Promise<ActionResult<{ ok: true }>> {
    const parsedId = z.coerce.number().int().positive().safeParse(id);
    if (!parsedId.success) return { error: 'validation' };

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    const { error } = await supabase.from('inventory').delete().eq('id', parsedId.data);
    if (error) {
        /* FK-violation: ingredient_costs / gerecht_components / etc. */
        const msg = error.message.toLowerCase();
        if (msg.includes('foreign key') || msg.includes('violates')) {
            return { error: 'item wordt nog gebruikt in een gerecht of recept — eerst ontkoppelen' };
        }
        return { error: error.message };
    }
    revalidatePath('/voorraad');
    return { data: { ok: true } };
}

/* ─── adjustStock ─────────────────────────────────────────────── */

/**
 * Delta-mutatie op current_stock met optionele audit-log naar
 * `stock_movements`. Server-side bewaakt:
 *   - inventory_id bestaat
 *   - resulting_stock ≥ 0 (negative-stock-prevention)
 *   - movement-log is best-effort: faalt niet als movement-table down is
 */
export async function adjustStock(input: unknown): Promise<ActionResult<{ resulting_stock: number }>> {
    const parsed = AdjustStockSchema.safeParse(input);
    if (!parsed.success) {
        return {
            error: 'validation',
            fields: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        };
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    /* Lees huidige stock + reken nieuwe. We doen geen atomic UPDATE met
       SQL-formule omdat we de exacte resulting_stock willen rapporteren
       én een floor op 0 willen forceren. Korte race-window acceptabel
       voor de huidige tenant-grootte. */
    const { data: item, error: readErr } = await supabase
        .from('inventory')
        .select('id, current_stock')
        .eq('id', parsed.data.inventory_id)
        .single();
    if (readErr || !item) return { error: 'item niet gevonden' };

    const oldStock = Number(item.current_stock || 0);
    const newStock = Math.max(0, oldStock + parsed.data.delta);

    const { error: updateErr } = await supabase
        .from('inventory')
        .update({ current_stock: newStock })
        .eq('id', parsed.data.inventory_id);
    if (updateErr) return { error: updateErr.message };

    /* Best-effort audit-log. Stock_movements heeft zijn eigen RLS. */
    void supabase.from('stock_movements').insert({
        inventory_id: parsed.data.inventory_id,
        type: parsed.data.type,
        qty: parsed.data.delta,
        resulting_stock: newStock,
        note: parsed.data.note || null,
    }).then(() => null, () => null);

    revalidatePath('/voorraad');
    return { data: { resulting_stock: newStock } };
}
