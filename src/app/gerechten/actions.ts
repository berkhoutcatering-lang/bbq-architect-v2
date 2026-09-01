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

/* ══════════════════════════════════════════════════════════════════════
   Stappenlijst met de hand bijwerken
   ══════════════════════════════════════════════════════════════════════
   Het gat dat golf 2 openliet. De ontleder haalt alleen uit een recept wat
   erin staat, en dat is precies goed — maar de gerookte bavette heeft een
   bereidingswijze van drie regels zonder één tijd, dus komt er geen handtijd
   uit en kan de planning het onderscheid tussen werken en wachten nergens op
   baseren. Dat moet je zelf kunnen invullen.

   Tot nu toe kon dat niet: `bewaarReceptStappen` nam alleen ontleder-uitvoer
   aan, en geen enkel scherm tóónde de opgeslagen stappen. De tabel werd buiten
   het schrijfpad en de planner door niets gelezen.

   Deze actie vervangt de hele lijst van één gerecht in één keer — bijwerken,
   toevoegen, verwijderen en van volgorde wisselen zijn dezelfde handeling. Dat
   is eenvoudiger dan vier acties die elkaar half overlappen, en het houdt
   `step_order` sluitend: de volgorde is de positie in de lijst die binnenkomt.

   Wat er NIET gebeurt: een lege duur invullen met een schatting. Leeg blijft
   leeg, en het kookbord zegt dan "duur onbekend".

   Let op bij verwijderen: `prep_tasks.recipe_step_id` staat op
   `on delete set null`, dus een geplande taak blijft bestaan en verliest
   alleen zijn verwijzing naar de stap. Bedoeld — een stap schrappen mag nooit
   werk van een lopend event weghalen. */

const StappenlijstRegelSchema = z.object({
    /* Bestaande stap → bijwerken. Nieuw → invoegen. */
    id: z.string().uuid().nullable().optional(),
    tekst: z.string().min(1).max(300),
    actie: z.string().max(40).nullable().optional(),
    prep_group: z.string().max(80).nullable().optional(),
    /* Een week is de bovengrens; alles daarboven is een typefout, geen recept. */
    duur_actief_min: z.coerce.number().int().min(0).max(10080).nullable().optional(),
    duur_passief_min: z.coerce.number().int().min(0).max(10080).nullable().optional(),
    plaats: z.enum(['thuis', 'bus', 'locatie']).default('thuis'),
    toezicht_nodig: z.boolean().optional().default(false),
});

const StappenlijstSchema = z.object({
    gerecht_id: z.string().uuid(),
    stappen: z.array(StappenlijstRegelSchema).max(200),
});

export async function bewaarStappenlijst(
    input: unknown
): Promise<
    | { data: { aantal: number; toegevoegd: number; verwijderd: number; actief_min: number; passief_min: number } }
    | { error: string; fields?: Record<string, string[]> }
> {
    const parsed = StappenlijstSchema.safeParse(input);
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

    const { data: gerecht } = await supabase
        .from('gerechten')
        .select('id')
        .eq('id', parsed.data.gerecht_id)
        .eq('organization_id', orgId)
        .maybeSingle();
    if (!gerecht) return { error: 'Gerecht niet gevonden' };

    /* Welke stappen liggen er nu? Nodig om te weten wat er weg mag en om te
       voorkomen dat een meegestuurde id van een ánder gerecht wordt bijgewerkt. */
    const { data: bestaand, error: leesErr } = await supabase
        .from('recipe_steps')
        .select('id')
        .eq('organization_id', orgId)
        .eq('gerecht_id', parsed.data.gerecht_id);
    if (leesErr) return { error: leesErr.message };
    const bestaandeIds = new Set((bestaand ?? []).map((r) => String(r.id)));

    const binnengekomen = parsed.data.stappen;
    for (const s of binnengekomen) {
        if (s.id && !bestaandeIds.has(s.id)) {
            return { error: 'Een van de stappen hoort niet bij dit gerecht' };
        }
    }

    const teVerwijderen = [...bestaandeIds].filter(
        (id) => !binnengekomen.some((s) => s.id === id),
    );
    if (teVerwijderen.length > 0) {
        const { error: wisErr } = await supabase
            .from('recipe_steps')
            .delete()
            .eq('organization_id', orgId)
            .eq('gerecht_id', parsed.data.gerecht_id)
            .in('id', teVerwijderen);
        if (wisErr) return { error: wisErr.message };
    }

    let toegevoegd = 0;
    for (const [index, s] of binnengekomen.entries()) {
        const velden = {
            step_order: index + 1,
            tekst: s.tekst,
            actie: s.actie ?? null,
            prep_group: leegIsNull(s.prep_group),
            duur_actief_min: s.duur_actief_min ?? null,
            duur_passief_min: s.duur_passief_min ?? null,
            plaats: s.plaats,
            toezicht_nodig: s.toezicht_nodig ?? false,
        };

        if (s.id) {
            const { error: updErr } = await supabase
                .from('recipe_steps')
                .update({ ...velden, updated_at: new Date().toISOString() })
                .eq('id', s.id)
                .eq('organization_id', orgId);
            if (updErr) return { error: updErr.message };
        } else {
            /* organization_id expliciet meesturen: de WITH CHECK-policy eist hem
               en zonder weigert de database de rij stilletjes. */
            const { error: insErr } = await supabase
                .from('recipe_steps')
                .insert({
                    ...velden,
                    organization_id: orgId,
                    gerecht_id: parsed.data.gerecht_id,
                    bron: 'handmatig',
                });
            if (insErr) return { error: insErr.message };
            toegevoegd++;
        }
    }

    revalidatePath('/gerechten/' + parsed.data.gerecht_id);

    return {
        data: {
            aantal: binnengekomen.length,
            toegevoegd,
            verwijderd: teVerwijderen.length,
            actief_min: binnengekomen.reduce((s, r) => s + (r.duur_actief_min ?? 0), 0),
            passief_min: binnengekomen.reduce((s, r) => s + (r.duur_passief_min ?? 0), 0),
        },
    };
}

/** Een leeggemaakt tekstveld is geen lege string maar geen waarde. */
function leegIsNull(v: string | null | undefined): string | null {
    const t = (v ?? '').trim();
    return t.length > 0 ? t : null;
}
