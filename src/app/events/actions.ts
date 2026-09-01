/**
 * P0.7 — Server Actions voor event-CRUD.
 *
 * Hard rule 5 (BBQ Architect): Server Actions ALTIJD met Zod-validatie EN
 * re-auth INSIDE de action — middleware-auth alleen is een CVE-magnet
 * (OWASP A01 Broken Access Control).
 *
 * RLS doet de tenant-isolatie via `organization_id` policies; wij hoeven dat
 * niet expliciet te checken in deze actions, zolang we het user-scoped
 * client gebruiken (geen service-role).
 *
 * Bedrading: gebruik vanuit `<EventEditor>` met `useTransition`:
 *
 *   import { upsertEvent } from '@/app/events/actions';
 *   const [pending, startTransition] = useTransition();
 *   function onSave(formData: FormData) {
 *     startTransition(async () => {
 *       const result = await upsertEvent(Object.fromEntries(formData));
 *       if (result.error) toast.error(result.error);
 *       else toast.success('Event opgeslagen');
 *     });
 *   }
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { applyConsumption } from '@/lib/dal/stockMutation';
import { EVENT_STATUS_INVOER } from '@/lib/statuses';

/* Schema is bewust ruimhartig — legacy events kennen statussen als
   'completed' en 'confirmed' (Engelse vorm) naast de NL-vorm. We
   accepteren beide zodat upsertEvent ook bestaande rijen kan updaten.
   De lijst zelf staat in statuses.ts naast EVENT_STATUS, met een test die
   afdwingt dat er geen status buiten valt. */
const EventSchema = z.object({
  id: z.union([z.string().uuid(), z.coerce.number().int()]).optional(),
  name: z.string().min(1, 'Naam is verplicht').max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum moet YYYY-MM-DD zijn'),
  guests: z.coerce.number().int().min(0).max(10_000),
  ppp: z.coerce.number().nonnegative().optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  client_naam: z.string().min(1, 'Klantnaam is verplicht').max(200).optional().nullable(),
  client_email: z.string().email().or(z.literal('')).optional().nullable(),
  client_telefoon: z.string().max(50).optional().nullable(),
  type: z.string().max(50).optional().nullable(),
  status: z.enum(EVENT_STATUS_INVOER).optional().default('concept'),
  /* Open velden voor menu, prep, notities — backend valideert deeper als nodig. */
  menu: z.unknown().optional(),
  menu_selectie: z.unknown().optional(),
  notities: z.string().max(10_000).optional().nullable(),
  organization_id: z.string().uuid().optional(),
}).passthrough();

export type EventInput = z.input<typeof EventSchema>;

export async function upsertEvent(input: unknown): Promise<
  | { data: { id: string; name: string; date: string } }
  | { error: string; fields?: Record<string, string[]> }
> {
  const parsed = EventSchema.safeParse(input);
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
    .from('events')
    .upsert(parsed.data, { onConflict: 'id' })
    .select('id, name, date')
    .single();

  if (error) return { error: error.message };

  revalidatePath('/agenda');
  revalidatePath('/events');
  if (data?.id) revalidatePath(`/events/${data.id}/hub`);
  return { data: data! };
}

/* ─── completeEventConsumption ─────────────────────────────────────
   Boekt het verbruik van een event ÉÉN keer op de voorraad, ongeacht via
   welke knop het event afgerond wordt (EventEditor, reflectie, service).

   Idempotency via events.inventory_drained_at als slot: één atomaire
   "update ... where inventory_drained_at is null" claimt het event. Wint deze
   call de claim (rij terug) → boek het hele menu af. Anders → al geboekt
   (bijv. service-mode heeft de mise al per gang afgetrokken) → no-op.

   Zo kan verbruik nooit 0× (reflectie boekte voorheen niets) of 2× (serve +
   afronden) tellen — precies het getal waar de bestellijst op leunt. */
export async function completeEventConsumption(
  eventId: number | string,
): Promise<{ ok: true; skipped?: boolean; drained?: number; results?: unknown[] } | { error: string }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Niet ingelogd' };

  const { data: mem } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
  if (!mem?.organization_id) return { error: 'Geen actieve organisatie' };
  const orgId = mem.organization_id;

  /* Claim het event met één atomaire update-where-null. */
  const { data: claimed, error: claimErr } = await supabase
    .from('events')
    .update({ inventory_drained_at: new Date().toISOString() })
    .eq('id', eventId).eq('organization_id', orgId).is('inventory_drained_at', null)
    .select('id, menu, guests')
    .maybeSingle();
  if (claimErr) return { error: claimErr.message };
  if (!claimed) return { ok: true, skipped: true };  // al geboekt via een ander pad

  const menuIds: unknown[] = Array.isArray(claimed.menu) ? claimed.menu : [];
  const guests = Number(claimed.guests) || 0;
  if (menuIds.length === 0 || guests <= 0) return { ok: true, drained: 0 };

  const { data: recepten } = await supabase
    .from('recepten')
    .select('id, naam, ingredienten, porties')
    .eq('organization_id', orgId)
    .in('id', menuIds as (number | string)[]);

  const lines: Array<{ name: string; qty: number; unit: string | null; note: string }> = [];
  for (const r of (recepten || []) as Array<{ naam?: string; ingredienten?: unknown; porties?: number }>) {
    let ingredienten: Array<{ naam?: string; hoeveelheid?: unknown; eenheid?: string }> = [];
    if (Array.isArray(r.ingredienten)) ingredienten = r.ingredienten as typeof ingredienten;
    else if (typeof r.ingredienten === 'string') {
      try { ingredienten = JSON.parse(r.ingredienten); } catch { ingredienten = []; }
    }
    const porties = Number(r.porties) || 1;
    const multiplier = guests / porties;
    for (const ing of ingredienten) {
      const qty = (parseFloat(String(ing?.hoeveelheid)) || 0) * multiplier;
      if (!ing?.naam || qty <= 0) continue;
      const unit = ing.eenheid === 'gram' ? 'g' : (ing.eenheid ?? null);
      lines.push({ name: String(ing.naam), qty, unit, note: `Event afgerond: ${r.naam ?? ''}` });
    }
  }
  if (lines.length === 0) return { ok: true, drained: 0 };

  const { results, posted } = await applyConsumption(supabase, orgId, lines, { defaultNote: 'Event afgerond' });
  revalidatePath('/voorraad');
  return { ok: true, drained: posted, results };
}

const DeleteSchema = z.string().uuid();

export async function deleteEvent(id: string): Promise<{ ok: true } | { error: string }> {
  const parsed = DeleteSchema.safeParse(id);
  if (!parsed.success) return { error: 'Ongeldige event-id' };

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Niet ingelogd' };

  const { error } = await supabase.from('events').delete().eq('id', parsed.data);
  if (error) return { error: error.message };

  revalidatePath('/agenda');
  revalidatePath('/events');
  return { ok: true };
}
