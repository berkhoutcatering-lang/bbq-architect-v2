/**
 * P0.14 — Server Actions voor offerte-CRUD.
 *
 * Hard rule 5 (BBQ Architect): Zod + re-auth in elke action. RLS doet
 * tenant-isolatie via `organization_id` policies.
 *
 * BTW (hard rule 1): NIET in dit schema — BTW-splits worden server-side
 * berekend uit `BTW_RULES_2026` op het moment van factureren, niet bij
 * offerte-opslag. AI mag een categorie suggereren via items[].btw_category.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { OfferteSchema } from '@/lib/schemas/offerte';

/* Geen `export type { OfferteInput }` — een 'use server' module mag alleen
   async functions exporteren, anders crasht de Turbopack server-actions-loader
   runtime. Importeer types direct uit @/lib/schemas/offerte. */

export async function upsertOfferte(input: unknown): Promise<
  | { data: { id: string | number; status: string } }
  | { error: string; fields?: Record<string, string[]> }
> {
  const parsed = OfferteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: 'Validatie-fout',
      fields: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Niet ingelogd' };

  const { data, error } = await supabase
    .from('offertes')
    .upsert(parsed.data, { onConflict: 'id' })
    .select('id, status')
    .single();

  if (error) return { error: error.message };

  revalidatePath('/offertes');
  return { data: data! };
}

const DeleteSchema = z.union([z.string().uuid(), z.coerce.number().int()]);

export async function deleteOfferte(id: string | number): Promise<{ ok: true } | { error: string }> {
  const parsed = DeleteSchema.safeParse(id);
  if (!parsed.success) return { error: 'Ongeldige offerte-id' };

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Niet ingelogd' };

  const { error } = await supabase.from('offertes').delete().eq('id', parsed.data);
  if (error) return { error: error.message };

  revalidatePath('/offertes');
  return { ok: true };
}

/**
 * Marker een offerte als verzonden + log activation event.
 * Gebruikt vanuit de mail-flow nadat de email succesvol verstuurd is.
 */
const MarkSentSchema = z.union([z.string().uuid(), z.coerce.number().int()]);

export async function markOfferteSent(id: string | number): Promise<{ ok: true } | { error: string }> {
  const parsed = MarkSentSchema.safeParse(id);
  if (!parsed.success) return { error: 'Ongeldige offerte-id' };

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Niet ingelogd' };

  const { error } = await supabase
    .from('offertes')
    .update({ status: 'verzonden', verzonden_op: new Date().toISOString() })
    .eq('id', parsed.data);

  if (error) return { error: error.message };

  // Fire-and-forget activation tracking
  await supabase.from('activation_events').insert({
    user_id: user.id,
    event_type: 'first_offerte_sent',
    metadata: { offerte_id: parsed.data },
  }).then(() => undefined, () => undefined);

  revalidatePath('/offertes');
  revalidatePath('/');
  return { ok: true };
}
