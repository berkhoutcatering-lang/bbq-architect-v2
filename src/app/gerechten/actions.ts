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
import { GerechtSchema } from '@/lib/schemas/gerecht';

/* Geen `export type { GerechtInput }` — een 'use server' module mag alleen
   async functions exporteren, anders crasht de Turbopack server-actions-loader
   runtime. Importeer types direct uit @/lib/schemas/gerecht. */

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
  /* Bucket C (2026-05-25): /menu-analyse + /insights samengevoegd onder /analyse. */
  revalidatePath('/gerechten/analyse');
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

/* ══════════════════════════════════════════════════════════════════════
   Receptuur-ontleding uitvoeren
   ══════════════════════════════════════════════════════════════════════
   Hoort hier en niet in de goedkeur-lade: die lade legt vast dát je tekent,
   maar wat er dan moet gebeuren verschilt per soort voorstel. Zou de lade ook
   uitvoeren, dan moest hij elke agent kennen.

   Wordt aangeroepen ná bevestigVoorstel(), met de payload die daaruit komt.
   Vervangt de bestaande stappen van dit gerecht in één keer: een halve
   ontleding naast een oude is erger dan geen. */

const OntledingStapSchema = z.object({
    step_order: z.coerce.number().int().min(1),
    tekst: z.string().min(1).max(300),
    actie: z.string().max(40).nullable().optional(),
    prep_group: z.string().max(80).nullable().optional(),
    duur_actief_min: z.coerce.number().min(0).nullable().optional(),
    duur_passief_min: z.coerce.number().min(0).nullable().optional(),
    plaats: z.enum(['thuis', 'bus', 'locatie']).default('thuis'),
    toezicht_nodig: z.boolean().optional().default(false),
    station: z.string().max(80).nullable().optional(),
    apparaat: z.string().max(80).nullable().optional(),
    techniek_slug: z.string().max(60).nullable().optional(),
    temp_doel_c: z.coerce.number().nullable().optional(),
    ingredient_ref: z.string().max(200).nullable().optional(),
    hoeveelheid: z.coerce.number().min(0).nullable().optional(),
    eenheid: z.string().max(20).nullable().optional(),
});

const OntledingSchema = z.object({
    gerecht_id: z.string().uuid(),
    stappen: z.array(OntledingStapSchema).min(1).max(200),
});

export async function bewaarReceptStappen(
    input: unknown
): Promise<
  | { data: { aantal: number; actief_min: number; passief_min: number } }
  | { error: string; fields?: Record<string, string[]> }
> {
    const parsed = OntledingSchema.safeParse(input);
    if (!parsed.success) {
        return { error: 'Validatie-fout', fields: parsed.error.flatten().fieldErrors as Record<string, string[]> };
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    const { data: mem } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!mem?.organization_id) return { error: 'Geen actieve organisatie gevonden' };
    const orgId = mem.organization_id as string;

    /* Hoort dit gerecht wel bij deze organisatie? RLS dekt het af, maar een
       expliciete check geeft een begrijpelijke fout in plaats van nul rijen. */
    const { data: gerecht } = await supabase
        .from('gerechten')
        .select('id')
        .eq('id', parsed.data.gerecht_id)
        .eq('organization_id', orgId)
        .maybeSingle();
    if (!gerecht) return { error: 'Gerecht niet gevonden' };

    const { error: wisErr } = await supabase
        .from('recipe_steps')
        .delete()
        .eq('organization_id', orgId)
        .eq('gerecht_id', parsed.data.gerecht_id);
    if (wisErr) return { error: wisErr.message };

    /* organization_id expliciet meesturen: de WITH CHECK-policy eist hem en
       zonder weigert de database elke rij stilletjes. */
    const rijen = parsed.data.stappen.map((s) => ({
        organization_id: orgId,
        gerecht_id: parsed.data.gerecht_id,
        step_order: s.step_order,
        tekst: s.tekst,
        actie: s.actie ?? null,
        prep_group: s.prep_group ?? null,
        duur_actief_min: s.duur_actief_min ?? null,
        duur_passief_min: s.duur_passief_min ?? null,
        plaats: s.plaats,
        toezicht_nodig: s.toezicht_nodig ?? false,
        station: s.station ?? null,
        apparaat: s.apparaat ?? null,
        techniek_slug: s.techniek_slug ?? null,
        temp_doel_c: s.temp_doel_c ?? null,
        ingredient_ref: s.ingredient_ref ?? null,
        hoeveelheid: s.hoeveelheid ?? null,
        eenheid: s.eenheid ?? null,
        bron: 'ontleder',
    }));

    const { error } = await supabase.from('recipe_steps').insert(rijen);
    if (error) return { error: error.message };

    revalidatePath('/gerechten/' + parsed.data.gerecht_id);
    revalidatePath('/gerechten');

    return {
        data: {
            aantal: rijen.length,
            actief_min: rijen.reduce((s, r) => s + (r.duur_actief_min ?? 0), 0),
            passief_min: rijen.reduce((s, r) => s + (r.duur_passief_min ?? 0), 0),
        },
    };
}
