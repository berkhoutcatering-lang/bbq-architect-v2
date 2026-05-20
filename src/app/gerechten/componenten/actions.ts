/**
 * Server Actions voor component_folders + components.folder_id move.
 *
 * Zelfde hard rules als alle andere actions: Zod-valideer input, re-auth
 * inside action, RLS doet tenant-isolatie via organization_id policies.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

const CreateFolderSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht').max(60),
    parent_id: z.string().uuid().nullable().optional(),
    icon: z.string().min(1).max(40).default('Folder'),
    color: z.string().max(20).nullable().optional(),
});

const UpdateFolderSchema = CreateFolderSchema.extend({
    id: z.string().uuid(),
});

const DeleteFolderSchema = z.object({ id: z.string().uuid() });

const MoveComponentsSchema = z.object({
    component_ids: z.array(z.number().int().positive()).min(1).max(500),
    folder_id: z.string().uuid().nullable(),
});

type ActionResult<T> = { data: T } | { error: string; fields?: Record<string, string[]> };

async function getActiveOrgId(supabase: Awaited<ReturnType<typeof createServerSupabase>>, userId: string): Promise<string | null> {
    const { data } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    return data?.organization_id ?? null;
}

export async function createComponentFolder(input: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = CreateFolderSchema.safeParse(input);
    if (!parsed.success) {
        return { error: 'Validatie-fout', fields: parsed.error.flatten().fieldErrors as Record<string, string[]> };
    }
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };
    const orgId = await getActiveOrgId(supabase, user.id);
    if (!orgId) return { error: 'Geen actieve organisatie' };

    const { data, error } = await supabase
        .from('component_folders')
        .insert({
            organization_id: orgId,
            parent_id: parsed.data.parent_id ?? null,
            name: parsed.data.name,
            icon: parsed.data.icon,
            color: parsed.data.color ?? null,
            created_by: user.id,
        })
        .select('id')
        .single();
    if (error) {
        if (error.code === '23505') return { error: 'Er bestaat al een map met deze naam in dit niveau' };
        return { error: error.message };
    }
    revalidatePath('/gerechten/componenten');
    return { data: { id: data!.id } };
}

export async function updateComponentFolder(input: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = UpdateFolderSchema.safeParse(input);
    if (!parsed.success) {
        return { error: 'Validatie-fout', fields: parsed.error.flatten().fieldErrors as Record<string, string[]> };
    }
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    const { id, ...patch } = parsed.data;
    /* Voorkom een cycle: een folder mag niet z'n eigen voorouder als parent krijgen.
       Simpele check op zichzelf — diepere cycle-detectie laten we aan ON DELETE
       CASCADE bij verwijdering en aan de UI die geen self-reference toont. */
    if (patch.parent_id === id) {
        return { error: 'Een map kan niet zichzelf als parent hebben' };
    }
    const { error } = await supabase
        .from('component_folders')
        .update({
            name: patch.name,
            parent_id: patch.parent_id ?? null,
            icon: patch.icon,
            color: patch.color ?? null,
        })
        .eq('id', id);
    if (error) {
        if (error.code === '23505') return { error: 'Er bestaat al een map met deze naam in dit niveau' };
        return { error: error.message };
    }
    revalidatePath('/gerechten/componenten');
    return { data: { id } };
}

export async function deleteComponentFolder(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = DeleteFolderSchema.safeParse(input);
    if (!parsed.success) return { error: 'Ongeldige id' };
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    /* CASCADE-effect: sub-folders worden mee verwijderd; componenten in deze
       folder vallen terug naar root via ON DELETE SET NULL op components.folder_id. */
    const { error } = await supabase
        .from('component_folders')
        .delete()
        .eq('id', parsed.data.id);
    if (error) return { error: error.message };
    revalidatePath('/gerechten/componenten');
    return { data: { ok: true } };
}

export async function moveComponentsToFolder(input: unknown): Promise<ActionResult<{ moved: number }>> {
    const parsed = MoveComponentsSchema.safeParse(input);
    if (!parsed.success) {
        return { error: 'Validatie-fout', fields: parsed.error.flatten().fieldErrors as Record<string, string[]> };
    }
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };
    const orgId = await getActiveOrgId(supabase, user.id);
    if (!orgId) return { error: 'Geen actieve organisatie' };

    /* Update alleen componenten die behoren tot deze org — extra defense
       in depth bovenop RLS, ook al doet RLS al het werk. PostgREST count
       gaat via dezelfde call met head: true; we doen 'm los om de TS-signature
       hier eenvoudig te houden. */
    const { error, data } = await supabase
        .from('components')
        .update({ folder_id: parsed.data.folder_id })
        .in('id', parsed.data.component_ids)
        .eq('organization_id', orgId)
        .select('id');

    if (error) return { error: error.message };
    revalidatePath('/gerechten/componenten');
    return { data: { moved: data?.length ?? 0 } };
}
