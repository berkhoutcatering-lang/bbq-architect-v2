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

/* ── createComponentFromMatch ──────────────────────────────────────────────
   "Maak component van dit Bidfood-product" vanuit de recept-uit-foto-flow.
   De matcher heeft de prijs al code-afgeleid (cents per base-eenheid); hier
   zetten we die om naar een nette pak-eenheid (per kg / per liter / per stuk)
   en slaan we 'm op als herbruikbare bought_in-component. Zo verschijnt het
   ingrediënt de volgende keer meteen in je bibliotheek. */
const CreateFromMatchSchema = z.object({
    name: z.string().min(1).max(120),
    cents_per_base_unit: z.number().positive(),
    base_unit: z.enum(['g', 'ml', 'stuk']),
    supplier: z.string().max(120).nullable().optional(),
    supplier_product_id: z.number().int().positive().nullable().optional(),
});

export async function createComponentFromMatchAction(input: unknown): Promise<ActionResult<{ id: number }>> {
    const parsed = CreateFromMatchSchema.safeParse(input);
    if (!parsed.success) return { error: 'Ongeldige component-data' };
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };
    const orgId = await getActiveOrgId(supabase, user.id);
    if (!orgId) return { error: 'Geen actieve organisatie' };

    const { cents_per_base_unit, base_unit } = parsed.data;
    // g/ml → per kg/liter (×1000) zodat base_cost_cents een heel getal blijft;
    // stuk → per stuk. base_quantity blijft 1 (kostprijs geldt per 1 pak-eenheid).
    const packUnit = base_unit === 'g' ? 'kg' : base_unit === 'ml' ? 'liter' : 'stuk';
    const factor = base_unit === 'stuk' ? 1 : 1000;
    const baseCostCents = Math.round(cents_per_base_unit * factor);
    if (baseCostCents <= 0) return { error: 'Kostprijs kon niet worden bepaald' };

    // RLS insert-klasse: organization_id ALTIJD expliciet meesturen ([[project_rls_insert_klasse]]).
    const { data, error } = await supabase
        .from('components')
        .insert({
            organization_id: orgId,
            name: parsed.data.name,
            type: 'bought_in',
            category: 'food',
            base_quantity: 1,
            base_unit: packUnit,
            base_cost_cents: baseCostCents,
            supplier_product_id: parsed.data.supplier_product_id ?? null,
            ai_suggested: true,
        })
        .select('id')
        .single();

    if (error) return { error: error.message };
    revalidatePath('/gerechten/componenten');
    return { data: { id: data.id as number } };
}
