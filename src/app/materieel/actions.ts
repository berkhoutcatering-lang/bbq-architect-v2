/**
 * Server Actions voor materieel-CRUD (Bundel 7 — server-actions completion).
 *
 * Hard rule 5 (BBQ Architect): Zod-validatie + re-auth INSIDE de actie,
 * niet via middleware-auth alleen. RLS doet tenant-isolatie via
 * `organization_id`-policies op `materieel`.
 *
 * Voorheen ging `/materieel` CRUD direct via `useSupabase.insert/update/
 * remove` vanaf de Client — geen server-side shape-validatie, geen
 * re-auth-check. Een gemanipuleerde request kon willekeurige velden
 * schrijven.
 *
 * Patroon volgt /klanten + /facturen + /voorraad (PR #87-#99).
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { MaterieelSchema, type MaterieelInput } from '@/lib/schemas/materieel';

export type { MaterieelInput };

interface ActionResult<T = unknown> {
    data?: T;
    error?: string;
    fields?: Record<string, string[]>;
}

export async function upsertMaterieel(input: unknown): Promise<ActionResult<{ id: number }>> {
    const parsed = MaterieelSchema.safeParse(input);
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
            .from('materieel')
            .update(rest)
            .eq('id', id)
            .select('id')
            .single();
        if (error) return { error: error.message };
        revalidatePath('/materieel');
        return { data: { id: data.id } };
    }

    const { data, error } = await supabase
        .from('materieel')
        .insert(rest)
        .select('id')
        .single();
    if (error) return { error: error.message };
    revalidatePath('/materieel');
    return { data: { id: data.id } };
}

export async function deleteMaterieel(id: number): Promise<ActionResult<{ ok: true }>> {
    const parsedId = z.coerce.number().int().positive().safeParse(id);
    if (!parsedId.success) return { error: 'validation' };

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    const { error } = await supabase.from('materieel').delete().eq('id', parsedId.data);
    if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('foreign key') || msg.includes('violates')) {
            return { error: 'item heeft nog gekoppelde data — eerst ontkoppelen' };
        }
        return { error: error.message };
    }
    revalidatePath('/materieel');
    return { data: { ok: true } };
}
