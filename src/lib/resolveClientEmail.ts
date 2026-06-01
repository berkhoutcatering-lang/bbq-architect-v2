/* Resolve het e-mailadres van een klant voor offerte/factuur/betaling-mails.
   ──────────────────────────────────────────────────────────────────────
   Realiteit van het datamodel (2026-06): het klant-e-mailadres kan op drie
   plekken leven, in volgorde van betrouwbaarheid:
     1. offertes.client_email   (nieuw veld, door wizard ingevuld)
     2. klanten.email           (gematcht op naam — fragiel maar bruikbaar)
     3. events.client_email     (gevuld bij sommige sync-paden)
   Deze helper checkt ze in volgorde en geeft de eerste geldige terug.

   Best-effort: geeft null als nergens een geldig adres staat. Callers
   skippen de mail dan (geen crash, geen lege mail). */

import type { SupabaseClient } from '@supabase/supabase-js';

function isValidEmail(email: string | null | undefined): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export interface ResolveEmailInput {
  orgId?: string | null;
  clientNaam?: string | null;
  clientEmail?: string | null;   // direct van offerte indien al bekend
  offerteId?: number | null;
  eventId?: number | null;
}

export async function resolveClientEmail(
  supabase: SupabaseClient,
  input: ResolveEmailInput,
): Promise<string | null> {
  // 1. Direct meegegeven (offerte.client_email)
  if (isValidEmail(input.clientEmail)) return input.clientEmail;

  // 2. klanten-tabel op naam (binnen org)
  if (input.clientNaam && input.orgId) {
    try {
      const { data } = await supabase
        .from('klanten')
        .select('email')
        .eq('organization_id', input.orgId)
        .ilike('naam', input.clientNaam.trim())
        .limit(1);
      const email = data && data[0] ? (data[0] as { email?: string }).email : null;
      if (isValidEmail(email)) return email;
    } catch {
      /* klanten-lookup faalt → door naar volgende bron */
    }
  }

  // 3. events.client_email (via offerte_id of direct event_id)
  try {
    let q = supabase.from('events').select('client_email').limit(1);
    if (input.eventId) {
      q = q.eq('id', input.eventId);
    } else if (input.offerteId) {
      q = q.eq('offerte_id', input.offerteId);
    } else {
      return null;
    }
    const { data } = await q;
    const email = data && data[0] ? (data[0] as { client_email?: string }).client_email : null;
    if (isValidEmail(email)) return email;
  } catch {
    /* events-lookup faalt → geen email */
  }

  return null;
}
