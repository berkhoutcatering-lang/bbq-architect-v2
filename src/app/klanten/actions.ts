/**
 * Server Actions voor klant-CRUD.
 *
 * Hard rule 5 (BBQ Architect): Zod-validatie + re-auth binnen de actie.
 * RLS doet tenant-isolatie via `organization_id` policies op `klanten`.
 *
 * Vervangt direct-Supabase calls vanuit de Client component, waarmee een
 * gemanipuleerde request niet langer rechtstreeks naar `klanten` kan
 * schrijven met een vervalste shape — alles gaat eerst door dit schema.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { KlantSchema, type KlantInput } from '@/lib/schemas/klant';

export type { KlantInput };

interface ActionResult<T = unknown> {
    data?: T;
    error?: string;
    fields?: Record<string, string[]>;
}

export async function upsertKlant(input: unknown): Promise<ActionResult<{ id: number | string }>> {
    const parsed = KlantSchema.safeParse(input);
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

    if (id) {
        const { data, error } = await supabase
            .from('klanten')
            .update(rest)
            .eq('id', id)
            .select('id')
            .single();
        if (error) return { error: error.message };
        revalidatePath('/klanten');
        return { data: { id: data.id } };
    }

    const { data, error } = await supabase
        .from('klanten')
        .insert(rest)
        .select('id')
        .single();
    if (error) return { error: error.message };
    revalidatePath('/klanten');
    return { data: { id: data.id } };
}

export async function deleteKlant(id: number | string): Promise<ActionResult<{ ok: true }>> {
    const parsedId = z.union([z.string().uuid(), z.coerce.number().int()]).safeParse(id);
    if (!parsedId.success) return { error: 'validation' };

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    /* Zachte fail bij FK-conflict: een klant met events/offertes/facturen
       mag niet stilletjes verdwijnen. RLS + DB-constraint zijn de echte
       backstop; we leveren hier een leesbare error voor de UI. */
    const { error } = await supabase.from('klanten').delete().eq('id', parsedId.data);
    if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('foreign key') || msg.includes('violates')) {
            return { error: 'klant heeft nog gekoppelde events/offertes/facturen' };
        }
        return { error: error.message };
    }
    revalidatePath('/klanten');
    return { data: { ok: true } };
}
