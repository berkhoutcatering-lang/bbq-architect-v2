/**
 * Server Actions — Cateraar-bouwer voor arrangementen ("Zelf offerte samenstellen").
 *
 * De cateraar bouwt hier de inhoud achter de publieke configurator: arrangement
 * → categorieën → max 3 niveaus (items + indicatieprijs pp). Het systeem bezit
 * de lay-out; de cateraar vult de slots.
 *
 * Hard rules (BBQ Architect):
 *  - Zod-validatie op alle input (geen directe DB-binding).
 *  - Re-auth INSIDE de action (middleware-auth alleen = CVE-magneet).
 *  - org_id actief opgezocht uit organization_members (niet uit client-input) →
 *    voorkomt cross-tenant writes. RLS (organization_id ∈ user_org_ids) is backstop.
 *  - indicatie_prijs_pp is door de cateraar ingesteld + aanpasbaar; NOOIT
 *    AI-afgeleid. De échte prijs blijft mensenwerk in de offerte.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

type ActionResult<T = unknown> = { data: T } | { error: string; fields?: Record<string, string[]> };

async function getActiveOrgId(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

async function auth() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, orgId: null as string | null, user: null };
  const orgId = await getActiveOrgId(supabase, user.id);
  return { supabase, orgId, user };
}

const orNull = (s?: string | null) => (s && String(s).length > 0 ? s : null);

/* ── Arrangement ───────────────────────────────────────────────────────────── */
const ArrangementSchema = z.object({
  id: z.string().uuid().optional(),
  naam: z.string().min(1, 'Geef het arrangement een naam').max(120),
  gasten_default: z.coerce.number().int().min(1).max(100000).default(50),
  min_gasten: z.coerce.number().int().min(1).max(100000).default(1),
  actief: z.boolean().default(true),
  publiek: z.boolean().default(true),
});

/* Starter-template (Sam's BBQ-voorbeeld) — voor een nieuwe cateraar die niet
   vanaf nul wil beginnen. 1-op-1 met de seed/v3-data. */
const TEMPLATE: Array<{ naam: string; icon: string; hint: string; niveaus: Array<{ naam: string; prijs: number; items: string[]; populair?: boolean }> }> = [
  { naam: 'Borrelhapjes', icon: 'sparkles', hint: 'Voor de ontvangst — terwijl de smoker op temperatuur komt.', niveaus: [
    { naam: 'Simpel', prijs: 4.5, items: ['Olijven, noten & zoutjes', 'Stokbrood met kruidenboter', '2 warme hapjes p.p.'] },
    { naam: 'Medium', prijs: 7.5, populair: true, items: ['4 warm & koud hapjes p.p.', 'Plank met kaas & worst', 'Gerookte makreel-dip', 'Bruschetta van het huis'] },
    { naam: 'Best-of', prijs: 11.5, items: ['6 chef-hapjes p.p.', 'Oester- & ceviche-bar', 'Gerookte zalm van de smoker', 'Luxe charcuterieplank', 'Warme bitterballen'] },
  ] },
  { naam: 'Hoofdgerecht', icon: 'flame', hint: 'Het hart van de BBQ — low & slow, langzaam gerookt.', niveaus: [
    { naam: 'Simpel', prijs: 13.5, items: ['Pulled pork van de smoker', 'Verse broodjes & coleslaw', '2 huisgemaakte sauzen'] },
    { naam: 'Medium', prijs: 19.5, populair: true, items: ['3 soorten low & slow vlees', 'Brisket, pulled pork & worst', 'Warme & koude salades', 'Gepofte aardappel met kruidenboter', 'Vega-optie: gegrilde halloumi'] },
    { naam: 'Best-of', prijs: 27.5, items: ['Chef aan de smoker, live', 'Beef short rib & tomahawk', 'Gerookte zalmzijde', 'Seizoensgroenten van de grill', 'Luxe salade-buffet', 'Vega-special op maat'] },
  ] },
  { naam: 'Dranken', icon: 'glass', hint: 'Onbeperkt schenken gedurende het event.', niveaus: [
    { naam: 'Simpel', prijs: 6, items: ['Frisdrank & water onbeperkt', 'Koffie & thee', 'Huiswijn & tapbier (3 uur)'] },
    { naam: 'Medium', prijs: 9.5, populair: true, items: ['Fris, water, sappen', 'Wijn, tapbier & speciaalbier', 'Koffie, thee & frisdrank (5 uur)', 'Welkomstdrankje bij aankomst'] },
    { naam: 'Best-of', prijs: 14.5, items: ['Volledig open bar', 'Wijnselectie & speciaalbieren', '2 signature cocktails', 'Barista-koffie & verse sappen', 'Eigen barman ter plaatse'] },
  ] },
  { naam: 'Dessert', icon: 'cake', hint: 'Zoete afsluiter — optioneel, maar geliefd.', niveaus: [
    { naam: 'Simpel', prijs: 3.5, items: ['Huisgemaakte brownie', 'Vers seizoensfruit'] },
    { naam: 'Medium', prijs: 6, populair: true, items: ['Dessertbar met 3 zoetigheden', 'Cheesecake & chocolademousse', 'Vers fruit & slagroom'] },
    { naam: 'Best-of', prijs: 9, items: ['Uitgebreide dessert-tafel', 'Gerookte ananas van de BBQ', 'Mini-patisserie & macarons', "S'mores-station bij het vuur"] },
  ] },
];

export async function createArrangement(input: unknown): Promise<ActionResult<{ id: string }>> {
  const Schema = z.object({ naam: z.string().min(1).max(120).default('BBQ Arrangement'), template: z.boolean().default(false) });
  const parsed = Schema.safeParse(input ?? {});
  if (!parsed.success) return { error: 'validation', fields: parsed.error.flatten().fieldErrors };

  const { supabase, orgId, user } = await auth();
  if (!user) return { error: 'unauthorized' };
  if (!orgId) return { error: 'Geen actieve organisatie gevonden' };

  /* volgorde = achteraan */
  const { count } = await supabase.from('arrangementen').select('id', { count: 'exact', head: true }).eq('organization_id', orgId);

  const { data: arr, error } = await supabase
    .from('arrangementen')
    .insert({ organization_id: orgId, naam: parsed.data.naam, gasten_default: 50, actief: true, publiek: true, volgorde: count ?? 0 })
    .select('id')
    .single();
  if (error || !arr) return { error: error?.message || 'Aanmaken mislukt' };

  if (parsed.data.template) {
    for (let ci = 0; ci < TEMPLATE.length; ci++) {
      const t = TEMPLATE[ci];
      const { data: cat } = await supabase
        .from('arrangement_categorieen')
        .insert({ arrangement_id: arr.id, organization_id: orgId, naam: t.naam, icon: t.icon, hint: t.hint, volgorde: ci })
        .select('id')
        .single();
      if (cat) {
        await supabase.from('categorie_niveaus').insert(
          t.niveaus.map((n, ni) => ({
            categorie_id: cat.id, organization_id: orgId, naam: n.naam,
            indicatie_prijs_pp: n.prijs, items: n.items, populair: !!n.populair, volgorde: ni,
          })),
        );
      }
    }
  }

  revalidatePath('/verkoop/arrangementen');
  return { data: { id: arr.id as string } };
}

export async function updateArrangement(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = ArrangementSchema.safeParse(input);
  if (!parsed.success) return { error: 'validation', fields: parsed.error.flatten().fieldErrors };
  if (!parsed.data.id) return { error: 'Geen arrangement-id' };

  const { supabase, orgId, user } = await auth();
  if (!user) return { error: 'unauthorized' };
  if (!orgId) return { error: 'Geen actieve organisatie gevonden' };

  const d = parsed.data;
  const { error } = await supabase
    .from('arrangementen')
    .update({ naam: d.naam, gasten_default: d.gasten_default, min_gasten: d.min_gasten, actief: d.actief, publiek: d.publiek })
    .eq('id', d.id)
    .eq('organization_id', orgId);
  if (error) return { error: error.message };
  revalidatePath('/verkoop/arrangementen');
  return { data: { id: d.id } };
}

export async function deleteArrangement(input: unknown): Promise<ActionResult<{ ok: true }>> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { error: 'validation' };
  const { supabase, orgId, user } = await auth();
  if (!user) return { error: 'unauthorized' };
  if (!orgId) return { error: 'Geen actieve organisatie gevonden' };

  const { error } = await supabase.from('arrangementen').delete().eq('id', parsed.data.id).eq('organization_id', orgId);
  if (error) return { error: error.message };
  revalidatePath('/verkoop/arrangementen');
  return { data: { ok: true } };
}

/* ── Categorie + niveaus (samen opgeslagen vanuit de drawer) ───────────────── */
const NiveauSchema = z.object({
  id: z.string().uuid().optional(),
  naam: z.string().min(1, 'Naam').max(60),
  indicatie_prijs_pp: z.coerce.number().min(0).max(100000),
  items: z.array(z.string().max(200)).max(20).default([]),
  populair: z.boolean().default(false),
});
const CategorieSchema = z.object({
  id: z.string().uuid().optional(),
  arrangement_id: z.string().uuid(),
  naam: z.string().min(1, 'Geef de categorie een naam').max(80),
  icon: z.string().max(40).default('utensils'),
  hint: z.string().max(300).optional().default(''),
  niveaus: z.array(NiveauSchema).min(1, 'Minstens één niveau').max(3),
});

export async function saveCategorie(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = CategorieSchema.safeParse(input);
  if (!parsed.success) return { error: 'validation', fields: parsed.error.flatten().fieldErrors };

  const { supabase, orgId, user } = await auth();
  if (!user) return { error: 'unauthorized' };
  if (!orgId) return { error: 'Geen actieve organisatie gevonden' };

  const d = parsed.data;

  /* Arrangement moet van deze org zijn. */
  const { data: arr } = await supabase
    .from('arrangementen').select('id').eq('id', d.arrangement_id).eq('organization_id', orgId).maybeSingle();
  if (!arr) return { error: 'Arrangement niet gevonden' };

  /* Categorie upsert. */
  let catId = d.id;
  if (catId) {
    const { error } = await supabase
      .from('arrangement_categorieen')
      .update({ naam: d.naam, icon: d.icon || 'utensils', hint: orNull(d.hint) })
      .eq('id', catId).eq('organization_id', orgId);
    if (error) return { error: error.message };
  } else {
    const { count } = await supabase
      .from('arrangement_categorieen').select('id', { count: 'exact', head: true }).eq('arrangement_id', d.arrangement_id);
    const { data: cat, error } = await supabase
      .from('arrangement_categorieen')
      .insert({ arrangement_id: d.arrangement_id, organization_id: orgId, naam: d.naam, icon: d.icon || 'utensils', hint: orNull(d.hint), volgorde: count ?? 0 })
      .select('id').single();
    if (error || !cat) return { error: error?.message || 'Opslaan mislukt' };
    catId = cat.id as string;
  }

  /* Niveaus normaliseren: max 3, exact één populair, volgorde = index. */
  let popSeen = false;
  const norm = d.niveaus.slice(0, 3).map((n, i) => {
    const populair = n.populair && !popSeen;
    if (populair) popSeen = true;
    return { ...n, populair, volgorde: i };
  });

  /* Bestaande niveaus ophalen → verwijder wat niet meer in de payload zit. */
  const { data: existing } = await supabase.from('categorie_niveaus').select('id').eq('categorie_id', catId);
  const incomingIds = new Set(norm.filter((n) => n.id).map((n) => n.id));
  const toDelete = (existing ?? []).map((e) => e.id as string).filter((id) => !incomingIds.has(id));
  if (toDelete.length) await supabase.from('categorie_niveaus').delete().in('id', toDelete);

  for (const n of norm) {
    const row = { naam: n.naam, indicatie_prijs_pp: n.indicatie_prijs_pp, items: n.items, populair: n.populair, volgorde: n.volgorde };
    if (n.id) {
      const { error } = await supabase.from('categorie_niveaus').update(row).eq('id', n.id).eq('organization_id', orgId);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from('categorie_niveaus').insert({ ...row, categorie_id: catId, organization_id: orgId });
      if (error) return { error: error.message };
    }
  }

  revalidatePath('/verkoop/arrangementen');
  return { data: { id: catId } };
}

export async function deleteCategorie(input: unknown): Promise<ActionResult<{ ok: true }>> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { error: 'validation' };
  const { supabase, orgId, user } = await auth();
  if (!user) return { error: 'unauthorized' };
  if (!orgId) return { error: 'Geen actieve organisatie gevonden' };

  const { error } = await supabase.from('arrangement_categorieen').delete().eq('id', parsed.data.id).eq('organization_id', orgId);
  if (error) return { error: error.message };
  revalidatePath('/verkoop/arrangementen');
  return { data: { ok: true } };
}

/** Verschuif een categorie omhoog/omlaag (wissel volgorde met de buur). */
export async function reorderCategorie(input: unknown): Promise<ActionResult<{ ok: true }>> {
  const parsed = z.object({ id: z.string().uuid(), direction: z.enum(['up', 'down']) }).safeParse(input);
  if (!parsed.success) return { error: 'validation' };
  const { supabase, orgId, user } = await auth();
  if (!user) return { error: 'unauthorized' };
  if (!orgId) return { error: 'Geen actieve organisatie gevonden' };

  const { data: cur } = await supabase
    .from('arrangement_categorieen').select('id, arrangement_id, volgorde')
    .eq('id', parsed.data.id).eq('organization_id', orgId).maybeSingle();
  if (!cur) return { error: 'Categorie niet gevonden' };

  const cmp = parsed.data.direction === 'up' ? 'lt' : 'gt';
  const order = parsed.data.direction === 'up' ? false : true;   // up → hoogste lager; down → laagste hoger
  const q = supabase
    .from('arrangement_categorieen').select('id, volgorde')
    .eq('arrangement_id', cur.arrangement_id);
  const { data: neighbour } = await (cmp === 'lt'
    ? q.lt('volgorde', cur.volgorde).order('volgorde', { ascending: order }).limit(1).maybeSingle()
    : q.gt('volgorde', cur.volgorde).order('volgorde', { ascending: order }).limit(1).maybeSingle());
  if (!neighbour) return { data: { ok: true } };   // al boven-/onderaan

  await supabase.from('arrangement_categorieen').update({ volgorde: neighbour.volgorde }).eq('id', cur.id);
  await supabase.from('arrangement_categorieen').update({ volgorde: cur.volgorde }).eq('id', neighbour.id);
  revalidatePath('/verkoop/arrangementen');
  return { data: { ok: true } };
}
