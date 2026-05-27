'use client';

import { supabase } from './supabase';

/**
 * Verwijdert alle rijen met een `[DEMO]`-prefix in naam voor deze organization.
 * Gebruikt door /instellingen/data-export "Verwijder demo-data" knop.
 *
 * Note: de seed-kant draait nu via /api/onboarding/seed-demo (canonical).
 * De oude insertDemoData hier is verwijderd om dubbele seed-paden te vermijden.
 */
export async function removeDemoData(orgId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Geen Supabase client' };

  const { error: kError } = await supabase
    .from('klanten')
    .delete()
    .eq('organization_id', orgId)
    .like('naam', '[DEMO]%');
  if (kError) return { ok: false, error: `klanten: ${kError.message}` };

  const { error: gError } = await supabase
    .from('gerechten')
    .delete()
    .eq('organization_id', orgId)
    .like('naam', '[DEMO]%');
  if (gError) return { ok: false, error: `gerechten: ${gError.message}` };

  return { ok: true };
}
