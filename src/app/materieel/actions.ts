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
import { MaterieelSchema } from '@/lib/schemas/materieel';

/* Geen `export type { MaterieelInput }` — een 'use server' module mag alleen
   async functions exporteren, anders crasht de Turbopack server-actions-loader
   runtime. Importeer types direct uit @/lib/schemas/materieel. */

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

    /* RLS-fix 2026-06-12: WITH CHECK op `materieel` eist organization_id —
       zonder dit veld weigert de database elke nieuwe rij stilletjes. */
    const { data: mem } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!mem?.organization_id) return { error: 'geen actieve organisatie gevonden' };

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
        .insert({ ...rest, organization_id: mem.organization_id })
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
