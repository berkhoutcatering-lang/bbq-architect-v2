/**
 * P0.21 — Server Actions voor gerecht-CRUD.
 *
 * Hard rule 5: Zod + re-auth. Hard rule 2 (allergeen-cascade) hier ook
 * relevant: `allergens` zit BEWUST NIET in dit schema — AI mag de tag
 * suggereren via `/api/detect-allergens`, code schrijft alleen
 * `ingredient_allergens` / `component_allergens` join-rijen na review.
 *
 * Hard rule 3 (productie-hoeveelheden): `yield_personen` is een handmatige
 * input van de chef; nooit AI-derived. Schaal-knop in de UI gebruikt
 * `yield_personen × headcount` voor component-qty.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { GerechtSchema, type GerechtInput } from '@/lib/schemas/gerecht';

export type { GerechtInput };

export async function upsertGerecht(input: unknown): Promise<
  | { data: { id: string | number; naam: string } }
  | { error: string; fields?: Record<string, string[]> }
> {
  const parsed = GerechtSchema.safeParse(input);
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
    .from('gerechten')
    .upsert(parsed.data, { onConflict: 'id' })
    .select('id, naam')
    .single();

  if (error) return { error: error.message };

  revalidatePath('/gerechten');
  revalidatePath('/gerechten/menu-analyse');
  return { data: data! };
}

const DeleteSchema = z.union([z.string().uuid(), z.coerce.number().int()]);

export async function deleteGerecht(id: string | number): Promise<{ ok: true } | { error: string }> {
  const parsed = DeleteSchema.safeParse(id);
  if (!parsed.success) return { error: 'Ongeldige gerecht-id' };

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Niet ingelogd' };

  const { error } = await supabase.from('gerechten').delete().eq('id', parsed.data);
  if (error) return { error: error.message };

  revalidatePath('/gerechten');
  return { ok: true };
}

/**
 * Roll-up trigger: herbereken kostprijs van alle gerechten die een
 * specifiek component bevatten (gebruik na inventory-prijs-update).
 * Roept de bestaande `/api/gerechten/[id]/rollup` aan.
 */
export async function rollupGerechtCosts(gerechtIds: string[] | number[]): Promise<{ ok: true; updated: number } | { error: string }> {
  const parsed = z.array(z.union([z.string().uuid(), z.coerce.number().int()])).safeParse(gerechtIds);
  if (!parsed.success) return { error: 'Ongeldige gerecht-id-lijst' };

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Niet ingelogd' };

  /* Direct via RPC of inline SQL — voor nu simpel: trigger de rollup-route
     per gerecht. Een batch-RPC is een follow-up. */
  let updated = 0;
  for (const gid of parsed.data) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/gerechten/${gid}/rollup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) updated++;
    } catch {
      // Skip individueel falen, log voor de rest
    }
  }

  revalidatePath('/gerechten');
  return { ok: true, updated };
}
