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

const OfferteItemSchema = z.object({
  beschrijving: z.string().max(500),
  qty: z.coerce.number().nonnegative(),
  prijs: z.coerce.number().nonnegative(),
  /* Optionele BTW-categorie-hint voor downstream factuur-generatie.
     De daadwerkelijke rate komt uit BTW_RULES_2026 lookup. */
  btw_category: z.enum([
    'food_catering', 'food_takeaway', 'service_personnel',
    'alcohol', 'soft_drinks', 'transport', 'equipment_rental',
    'b2b_intra_eu_reverse', 'export_non_eu', 'exempt',
  ]).optional(),
});

const VasteKostenSchema = z.object({
  naam: z.string().max(200),
  bedrag: z.coerce.number(),
});

const OfferteSchema = z.object({
  id: z.union([z.string().uuid(), z.coerce.number().int()]).optional(),
  client_naam: z.string().min(1, 'Klantnaam is verplicht').max(200),
  klant_id: z.union([z.string().uuid(), z.coerce.number().int()]).nullable().optional(),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum moet YYYY-MM-DD zijn'),
  aantal_gasten: z.coerce.number().int().min(0).optional().default(0),
  basis_prijs_pp: z.coerce.number().nonnegative().optional().default(0),
  status: z.enum([
    'concept', 'verzonden', 'geaccepteerd', 'betaald', 'geannuleerd',
    'goedgekeurd', 'voltooid',
  ]).optional().default('concept'),
  items: z.array(OfferteItemSchema).optional().default([]),
  vaste_kosten: z.array(VasteKostenSchema).optional().default([]),
  /* menu_selectie kan drie shapes hebben — daarom unknown. Validatie van
     de inhoud gebeurt in calcOfferteMarge. */
  menu_selectie: z.unknown().optional(),
  notities: z.string().max(10_000).optional(),
  /* Open extra velden — `nummer`, `geldig_tot`, `accepted_at`, `client_email`
     etc. kunnen meekomen uit de form. Schema is liberal voor backwards-compat. */
}).passthrough();

export type OfferteInput = z.input<typeof OfferteSchema>;

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
