/**
 * Server Actions voor agenda-categorieën (custom kalender-types per organisatie).
 *
 * Hard rules:
 * - Zod-validatie op alle input (geen direct DB-binding).
 * - Re-auth INSIDE de action (middleware-auth alone = CVE).
 * - RLS doet de tenant-isolatie via `organization_id` policy; wij zoeken
 *   actief de org_id op uit `organization_members` ipv te vertrouwen op
 *   client-input. Voorkomt cross-tenant insert via geknutselde request.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Kleur moet een hex zijn (#RRGGBB)');

const CreateSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht').max(40),
    color: ColorSchema.default('#a78bfa'),
    icon: z.string().min(1).max(40).default('Calendar'),
    default_visible: z.boolean().default(true),
});

const UpdateSchema = CreateSchema.extend({
    id: z.string().uuid(),
});

const DeleteSchema = z.object({ id: z.string().uuid() });

type ActionResult<T> = { data: T } | { error: string; fields?: Record<string, string[]> };

/* Eigen helper: haal de actieve org_id van de huidige user op. Eén bron,
   zodat we niet client-input vertrouwen voor tenant-routing. */
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

export async function createAgendaCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = CreateSchema.safeParse(input);
    if (!parsed.success) {
        return {
            error: 'Validatie-fout',
            fields: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        };
    }
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    const orgId = await getActiveOrgId(supabase, user.id);
    if (!orgId) return { error: 'Geen actieve organisatie gevonden' };

    const { data, error } = await supabase
        .from('agenda_categories')
        .insert({
            organization_id: orgId,
            name: parsed.data.name,
            color: parsed.data.color,
            icon: parsed.data.icon,
            default_visible: parsed.data.default_visible,
            created_by: user.id,
        })
        .select('id')
        .single();

    if (error) {
        if (error.code === '23505') return { error: 'Er bestaat al een agenda met deze naam' };
        return { error: error.message };
    }

    revalidatePath('/agenda');
    return { data: { id: data!.id } };
}

export async function updateAgendaCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = UpdateSchema.safeParse(input);
    if (!parsed.success) {
        return {
            error: 'Validatie-fout',
            fields: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        };
    }
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    const { id, ...patch } = parsed.data;
    const { error } = await supabase
        .from('agenda_categories')
        .update(patch)
        .eq('id', id);

    if (error) {
        if (error.code === '23505') return { error: 'Er bestaat al een agenda met deze naam' };
        return { error: error.message };
    }

    revalidatePath('/agenda');
    return { data: { id } };
}

export async function deleteAgendaCategory(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = DeleteSchema.safeParse(input);
    if (!parsed.success) return { error: 'Ongeldige id' };

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    const { error } = await supabase
        .from('agenda_categories')
        .delete()
        .eq('id', parsed.data.id);

    if (error) return { error: error.message };

    revalidatePath('/agenda');
    return { data: { ok: true } };
}
