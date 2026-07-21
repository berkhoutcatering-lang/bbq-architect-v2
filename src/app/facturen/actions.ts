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

/* ─── markFactuurStatus (status-mutatie, server-side) ─────── */

/**
 * Verander factuur-status server-side (Zod + re-auth).
 *
 * Sinds de perfect-pass (2026-07-21) trekt dit GEEN voorraad meer af. Verbruik
 * is een keuken-/event-gebeurtenis (service-mise + event-afronden via
 * completeEventConsumption), niet iets dat bij het factureren van de klant
 * hoort. De oude drain matchte factuurregels via substring op willekeurige
 * inventory-rijen in de verkeerde eenheid en telde dubbel bovenop de event-
 * aftrek — een derde, ongecoördineerde schrijver op het getal waar de
 * bestellijst op leunt. Verwijderd.
 */
export async function markFactuurStatus(input: unknown): Promise<ActionResult<{ status: string }>> {
    const parsed = StatusMutationSchema.safeParse(input);
    if (!parsed.success) return { error: 'validation' };

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    const { data: factuur, error: readErr } = await supabase
        .from('facturen').select('id, status').eq('id', parsed.data.id).single();
    if (readErr || !factuur) return { error: 'factuur niet gevonden' };

    const newStatus = parsed.data.new_status;
    if (factuur.status === newStatus) return { data: { status: newStatus } };

    const { error: updateErr } = await supabase
        .from('facturen').update({ status: newStatus }).eq('id', parsed.data.id);
    if (updateErr) return { error: updateErr.message };

    revalidatePath('/facturen');
    revalidatePath('/financien');
    return { data: { status: newStatus } };
}
