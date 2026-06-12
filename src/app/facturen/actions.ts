/**
 * Server Actions voor facturen-CRUD + status-mutatie met inventory-cascade.
 *
 * Hard rule 5 (BBQ Architect): Zod-validatie + re-auth in elke action.
 * RLS doet tenant-isolatie via `organization_id` policies op `facturen`.
 *
 * Voorheen kon de Client direct een factuur op "verzonden" / "betaald"
 * markeren en daarmee `drainInventory()` triggeren — een gemanipuleerde
 * request kon dus zonder server-side checks de voorraad leegtrekken. Nu
 * loopt de status-cascade + voorraad-aftrek server-side via
 * `markFactuurStatus`.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import {
    FactuurSchema,
    FACTUUR_STATUSES,
} from '@/lib/schemas/factuur';

/* Geen `export type { FactuurInput }` — een 'use server' module mag alleen
   async functions exporteren, anders crasht de Turbopack server-actions-loader
   runtime. Importeer types direct uit @/lib/schemas/factuur. */

/* StatusMutationSchema blijft lokaal — het is een action-payload (niet de
   entity-shape) en hoort daarom niet in de centrale schemas-module. Hij
   gebruikt wel de geëxporteerde FACTUUR_STATUSES constant. */
const StatusMutationSchema = z.object({
    id: z.union([z.string().uuid(), z.coerce.number().int()]),
    new_status: z.enum(FACTUUR_STATUSES),
});

interface ActionResult<T = unknown> {
    data?: T;
    error?: string;
    fields?: Record<string, string[]>;
}

/* ─── upsertFactuur ─────────────────────────────────────────── */

export async function upsertFactuur(input: unknown): Promise<ActionResult<{ id: number | string; statusChanged: boolean }>> {
    const parsed = FactuurSchema.safeParse(input);
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

    /* RLS-fix 2026-06-12: WITH CHECK op `facturen` eist organization_id —
       zonder dit veld weigert de database elke nieuwe factuur stilletjes. */
    const { data: mem } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!mem?.organization_id) return { error: 'geen actieve organisatie gevonden' };

    if (id) {
        /* Detect of de status verandert — voor de UI om de inventory-cascade
           trigger te kunnen aanroepen na succes. */
        const { data: oldFactuur } = await supabase
            .from('facturen').select('status').eq('id', id).maybeSingle();
        const oldStatus = oldFactuur?.status ?? null;

        const { data, error } = await supabase
            .from('facturen').update(rest).eq('id', id)
            .select('id, status').single();
        if (error) return { error: error.message };

        const statusChanged = oldStatus !== data.status && (data.status === 'verzonden' || data.status === 'betaald');
        revalidatePath('/facturen');
        revalidatePath('/financien');
        return { data: { id: data.id, statusChanged } };
    }

    const { data, error } = await supabase
        .from('facturen').insert({ ...rest, organization_id: mem.organization_id }).select('id').single();
    if (error) return { error: error.message };

    revalidatePath('/facturen');
    revalidatePath('/financien');
    return { data: { id: data.id, statusChanged: false } };
}

/* ─── deleteFactuur ─────────────────────────────────────────── */

export async function deleteFactuur(id: number | string): Promise<ActionResult<{ ok: true }>> {
    const parsedId = z.union([z.string().uuid(), z.coerce.number().int()]).safeParse(id);
    if (!parsedId.success) return { error: 'validation' };

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    /* Veilige delete-policy: alleen concept-facturen verwijderbaar.
       Betaalde / verzonden facturen moeten gecrediteerd worden, niet
       hard-deleted (BTW-audit trail). */
    const { data: factuur } = await supabase
        .from('facturen').select('status').eq('id', parsedId.data).maybeSingle();
    if (factuur && factuur.status && factuur.status !== 'concept' && factuur.status !== 'geannuleerd') {
        return { error: 'alleen concept- of geannuleerde facturen mogen worden verwijderd — credit de factuur i.p.v. te verwijderen' };
    }

    const { error } = await supabase.from('facturen').delete().eq('id', parsedId.data);
    if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('foreign key') || msg.includes('violates')) {
            return { error: 'factuur heeft gekoppelde mutaties — eerst ontkoppelen' };
        }
        return { error: error.message };
    }
    revalidatePath('/facturen');
    revalidatePath('/financien');
    return { data: { ok: true } };
}

/* ─── markFactuurStatus + server-side inventory-cascade ─────── */

interface DrainedItem {
    inventory_id: number;
    naam: string;
    delta: number;
    resulting_stock: number;
}

/**
 * Verander factuur-status en doe — bij overgang naar 'verzonden' of
 * 'betaald' — een inventory-cascade voor regels waarvan de description
 * matcht met een inventory.naam. Best-effort: faalt niet als individuele
 * items niet matchen. Audit-trail via stock_movements.
 */
export async function markFactuurStatus(input: unknown): Promise<ActionResult<{ status: string; drained: DrainedItem[] }>> {
    const parsed = StatusMutationSchema.safeParse(input);
    if (!parsed.success) return { error: 'validation' };

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    const { data: factuur, error: readErr } = await supabase
        .from('facturen').select('id, status, items').eq('id', parsed.data.id).single();
    if (readErr || !factuur) return { error: 'factuur niet gevonden' };

    const oldStatus = factuur.status as string | null;
    const newStatus = parsed.data.new_status;

    if (oldStatus === newStatus) {
        return { data: { status: newStatus, drained: [] } };
    }

    const { error: updateErr } = await supabase
        .from('facturen').update({ status: newStatus }).eq('id', parsed.data.id);
    if (updateErr) return { error: updateErr.message };

    /* Inventory-cascade alleen bij eerste overgang naar verzonden/betaald.
       Niet bij ongedaan-maken (concept → terug-revert) en niet bij
       betaald → verlopen e.d. */
    const shouldDrain = (newStatus === 'verzonden' || newStatus === 'betaald')
        && (oldStatus === 'concept' || oldStatus === null);

    const drained: DrainedItem[] = [];
    if (shouldDrain && Array.isArray(factuur.items)) {
        const { data: inventory } = await supabase
            .from('inventory').select('id, naam, current_stock');

        for (const lineItem of factuur.items as Array<{ desc?: string; qty?: number }>) {
            const desc = (lineItem.desc || '').toLowerCase();
            const qty = Number(lineItem.qty || 0);
            if (!desc || qty <= 0) continue;

            for (const inv of inventory ?? []) {
                const naam = (inv.naam || '').toLowerCase();
                if (!naam || !desc.includes(naam)) continue;
                const newStock = Math.max(0, Number(inv.current_stock || 0) - qty);
                const delta = newStock - Number(inv.current_stock || 0);
                await supabase
                    .from('inventory').update({ current_stock: newStock }).eq('id', inv.id);
                /* Audit-trail naar stock_movements; best-effort. */
                void supabase.from('stock_movements').insert({
                    inventory_id: inv.id,
                    type: 'usage',
                    qty: delta,
                    resulting_stock: newStock,
                    note: `Factuur ${parsed.data.id} → ${newStatus}`,
                }).then(() => null, () => null);
                drained.push({ inventory_id: inv.id, naam: inv.naam, delta, resulting_stock: newStock });
                break;  /* eén match per regel — voorkomt dubbele aftrek */
            }
        }
    }

    revalidatePath('/facturen');
    revalidatePath('/financien');
    revalidatePath('/voorraad');
    return { data: { status: newStatus, drained } };
}
