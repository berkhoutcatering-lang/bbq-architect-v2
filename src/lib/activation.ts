'use client';

/**
 * Activation-funnel tracking helpers.
 *
 * Flow:
 *   signup → /onboarding step 1 (company profile)
 *            → step 2 (demo data)
 *            → step 3 (first AI-offerte)
 *            → step 4 (module tour)
 *            → step 5 (integrations) → dashboard
 *
 * Target: 70% van signups stuurt eerste offerte binnen 60 min.
 * Query: `SELECT COUNT(DISTINCT organization_id) FROM activation_events WHERE event_type='first_quote_sent' ...`
 */

import { supabase } from '@/lib/supabase';

export type ActivationEventType =
  | 'signup_completed'
  | 'company_profile_saved'
  | 'demo_data_loaded'
  | 'demo_data_skipped'
  | 'first_quote_draft'
  | 'first_quote_sent'
  | 'module_tour_completed'
  | 'integrations_visited'
  | 'onboarding_completed';

/**
 * Log een activation-event (fire-and-forget — faalt nooit naar gebruiker).
 */
export async function logActivationEvent(
  orgId: string | null | undefined,
  eventType: ActivationEventType,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  if (!orgId || !supabase) return;
  try {
    await supabase.from('activation_events').insert({
      organization_id: orgId,
      event_type: eventType,
      metadata,
    });
  } catch (e) {
    console.warn('[activation] log failed:', (e as Error).message);
  }
}
