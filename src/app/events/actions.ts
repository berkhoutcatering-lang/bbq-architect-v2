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
import { EventSchema, type EventInput } from '@/lib/schemas/event';

export type { EventInput };

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
