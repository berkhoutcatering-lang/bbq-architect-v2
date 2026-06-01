/**
 * Server Actions voor lead-CRUD (Lead Funnel, operator-kant).
 *
 * Hard rules (BBQ Architect):
 *  - Zod-validatie op alle input (geen directe DB-binding).
 *  - Re-auth INSIDE de action (middleware-auth alleen = CVE).
 *  - org_id actief opgezocht uit organization_members (niet uit client-input)
 *    → voorkomt cross-tenant insert. RLS is de backstop.
 *
 * De PUBLIEKE lead-insert loopt NIET hier maar via /api/public-lead-form
 * (service-role). Deze actions zijn voor handmatig toevoegen + opvolgen.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

const LEAD_STATUSES = ['nieuw', 'in_gesprek', 'offerte', 'gewonnen', 'verloren'] as const;

const LeadSchema = z.object({
  id: z.coerce.number().int().optional(),
  naam: z.string().min(1, 'Naam is verplicht').max(200),
  email: z.string().email('Ongeldig e-mailadres').or(z.literal('')).optional().default(''),
  telefoon: z.string().max(50).optional().default(''),
  event_datum: z.string().max(20).optional().default(''),
  gasten: z.coerce.number().int().min(0).max(100000).optional(),
  locatie: z.string().max(300).optional().default(''),
  event_type: z.string().max(100).optional().default(''),
  budget_indicatie: z.string().max(100).optional().default(''),
  bericht: z.string().max(5000).optional().default(''),
  client_naam: z.string().max(200).optional().default(''),
  status: z.enum(LEAD_STATUSES).optional(),
  follow_up_at: z.string().max(40).optional().nullable(),
});

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

const orNull = (s?: string | null) => (s && String(s).length > 0 ? s : null);

export async function upsertLead(input: unknown): Promise<ActionResult<{ id: number }>> {
  const parsed = LeadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'validation', fields: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized' };

  const d = parsed.data;
  const row = {
    naam: d.naam,
    email: orNull(d.email),
    telefoon: orNull(d.telefoon),
    event_datum: orNull(d.event_datum),
    gasten: d.gasten ?? null,
    locatie: orNull(d.locatie),
    event_type: orNull(d.event_type),
    budget_indicatie: orNull(d.budget_indicatie),
    bericht: orNull(d.bericht),
    client_naam: orNull(d.client_naam) || d.naam,
    ...(d.status ? { status: d.status } : {}),
    follow_up_at: orNull(d.follow_up_at),
  };

  if (d.id) {
    const { data, error } = await supabase.from('leads').update(row).eq('id', d.id).select('id').single();
    if (error) return { error: error.message };
    revalidatePath('/verkoop/leads');
    return { data: { id: data.id as number } };
  }

  const orgId = await getActiveOrgId(supabase, user.id);
  if (!orgId) return { error: 'Geen actieve organisatie gevonden' };

  const { data, error } = await supabase
    .from('leads')
    .insert({ ...row, organization_id: orgId, source: 'manual', status: d.status || 'nieuw' })
    .select('id')
    .single();
  if (error) return { error: error.message };
  revalidatePath('/verkoop/leads');
  return { data: { id: data.id as number } };
}

const StatusSchema = z.object({
  id: z.coerce.number().int(),
  status: z.enum(LEAD_STATUSES),
});

/** Snelle status-wijziging (kanban-kolom / dropdown). RLS scope't naar org. */
export async function updateLeadStatus(input: unknown): Promise<ActionResult<{ ok: true }>> {
  const parsed = StatusSchema.safeParse(input);
  if (!parsed.success) return { error: 'validation' };

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized' };

  const { error } = await supabase.from('leads').update({ status: parsed.data.status }).eq('id', parsed.data.id);
  if (error) return { error: error.message };
  revalidatePath('/verkoop/leads');
  return { data: { ok: true } };
}

/** Sla het AI-gegenereerde concept-menu op de lead op (ai_concept jsonb). */
export async function saveLeadConcept(leadId: number, concept: unknown): Promise<ActionResult<{ ok: true }>> {
  const parsedId = z.coerce.number().int().safeParse(leadId);
  if (!parsedId.success) return { error: 'validation' };

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized' };

  const { error } = await supabase.from('leads').update({ ai_concept: concept ?? null }).eq('id', parsedId.data);
  if (error) return { error: error.message };
  revalidatePath('/verkoop/leads');
  return { data: { ok: true } };
}

/** Koppel een lead aan de offerte die eruit voortkwam + zet status op 'offerte'. */
export async function linkLeadToOfferte(leadId: number, offerteId: number): Promise<ActionResult<{ ok: true }>> {
  const parsed = z.object({ leadId: z.coerce.number().int(), offerteId: z.coerce.number().int() }).safeParse({ leadId, offerteId });
  if (!parsed.success) return { error: 'validation' };

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized' };

  const { error } = await supabase
    .from('leads')
    .update({ offerte_id: parsed.data.offerteId, status: 'offerte' })
    .eq('id', parsed.data.leadId);
  if (error) return { error: error.message };
  revalidatePath('/verkoop/leads');
  return { data: { ok: true } };
}

export async function deleteLead(id: number): Promise<ActionResult<{ ok: true }>> {
  const parsed = z.coerce.number().int().safeParse(id);
  if (!parsed.success) return { error: 'validation' };

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized' };

  const { error } = await supabase.from('leads').delete().eq('id', parsed.data);
  if (error) return { error: error.message };
  revalidatePath('/verkoop/leads');
  return { data: { ok: true } };
}
