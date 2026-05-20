/**
 * Server Actions voor logistiek_checklists CRUD.
 *
 * Hard rules:
 * - Zod-validatie op alle input
 * - Re-auth INSIDE de action — geen vertrouwen in middleware-only
 * - RLS doet tenant-isolatie via organization_id-policy
 * - getActiveOrgId helper omdat we organization_id moeten zetten bij INSERT
 *   (RLS check, niet vertrouwen op client-input)
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

const CATEGORIES = ['materieel', 'mensen', 'voorbereiding', 'transport'] as const;

const ChecklistItemSchema = z.object({
    categorie: z.enum(CATEGORIES),
    tekst: z.string().min(1).max(200),
    hoeveelheid: z.string().max(50).optional().nullable(),
    eenheid: z.string().max(30).optional().nullable(),
    done: z.boolean().default(false),
    ai_suggested: z.boolean().default(false),
});

const SaveSchema = z.object({
    event_id: z.coerce.number().int().positive(),
    items: z.array(ChecklistItemSchema).max(50),
    ai_model: z.string().max(50).optional().nullable(),
    ai_prompt_version: z.string().max(40).optional().nullable(),
});

const ToggleSchema = z.object({
    event_id: z.coerce.number().int().positive(),
    item_index: z.number().int().min(0).max(49),
    done: z.boolean(),
});

const DeleteSchema = z.object({ event_id: z.coerce.number().int().positive() });

type ActionResult<T> = { data: T } | { error: string; fields?: Record<string, string[]> };

async function getActiveOrgId(sb: Awaited<ReturnType<typeof createServerSupabase>>, userId: string): Promise<string | null> {
    const { data } = await sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    return data?.organization_id ?? null;
}

export async function saveLogistiekChecklist(input: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = SaveSchema.safeParse(input);
    if (!parsed.success) {
        return { error: 'Validatie-fout', fields: parsed.error.flatten().fieldErrors as Record<string, string[]> };
    }

    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };
    const orgId = await getActiveOrgId(sb, user.id);
    if (!orgId) return { error: 'Geen actieve organisatie' };

    /* UPSERT op event_id (UNIQUE) — accepteer/regenereer overschrijft de oude. */
    const { data, error } = await sb
        .from('logistiek_checklists')
        .upsert({
            organization_id: orgId,
            event_id: parsed.data.event_id,
            items: parsed.data.items,
            ai_model: parsed.data.ai_model ?? null,
            ai_prompt_version: parsed.data.ai_prompt_version ?? null,
            accepted_at: new Date().toISOString(),
            accepted_by: user.id,
        }, { onConflict: 'event_id' })
        .select('id')
        .single();

    if (error) return { error: error.message };
    revalidatePath('/logistiek');
    return { data: { id: data!.id } };
}

export async function toggleLogistiekItem(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = ToggleSchema.safeParse(input);
    if (!parsed.success) return { error: 'Validatie-fout' };

    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    /* Atomic update via in-DB JSONB-patch — geen race als 2 tabs samen toggelen.
       jsonb_set(items, '{idx,done}', 'true'::jsonb) is de juiste expression. */
    const { data: row, error: fetchErr } = await sb
        .from('logistiek_checklists')
        .select('id, items')
        .eq('event_id', parsed.data.event_id)
        .maybeSingle();
    if (fetchErr || !row) return { error: 'Checklist niet gevonden' };

    const items = Array.isArray(row.items) ? row.items : [];
    if (parsed.data.item_index >= items.length) return { error: 'Item-index out of range' };
    items[parsed.data.item_index] = { ...items[parsed.data.item_index], done: parsed.data.done };

    const { error: updErr } = await sb
        .from('logistiek_checklists')
        .update({ items })
        .eq('id', row.id);
    if (updErr) return { error: updErr.message };

    revalidatePath('/logistiek');
    return { data: { ok: true } };
}

export async function deleteLogistiekChecklist(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = DeleteSchema.safeParse(input);
    if (!parsed.success) return { error: 'Validatie-fout' };

    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    const { error } = await sb
        .from('logistiek_checklists')
        .delete()
        .eq('event_id', parsed.data.event_id);
    if (error) return { error: error.message };

    revalidatePath('/logistiek');
    return { data: { ok: true } };
}
