'use client';

import { supabase } from './supabase';

/**
 * Laadt een starter-set demo-data in de huidige organization.
 * Gebruikt door de onboarding-flow (DataStep).
 * Idempotent via een simpele metadata-check: als er al demo-klanten zijn, slaat het over.
 */
export async function insertDemoData(orgId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Geen Supabase client beschikbaar' };

  const { data: existing } = await supabase
    .from('klanten')
    .select('id')
    .eq('organization_id', orgId)
    .eq('email', 'demo-tuinvereniging@bbqarchitect.nl')
    .limit(1);

  if (existing && existing.length > 0) {
    return { ok: true };
  }

  const klanten = [
    {
      naam: '[DEMO] Tuinvereniging De Lelie',
      email: 'demo-tuinvereniging@bbqarchitect.nl',
      telefoon: '06-12345678',
      organization_id: orgId,
    },
    {
      naam: '[DEMO] Bedrijf BV',
      email: 'demo-bedrijf@bbqarchitect.nl',
      telefoon: '06-87654321',
      organization_id: orgId,
    },
    {
      naam: '[DEMO] Familie De Vries',
      email: 'demo-familie@bbqarchitect.nl',
      telefoon: '06-11223344',
      organization_id: orgId,
    },
  ];

  const gerechten = [
    { naam: '[DEMO] Pulled Pork', categorie: 'hoofd', prijs_per_portie: 8.5, organization_id: orgId },
    { naam: '[DEMO] Gegrilde Kip', categorie: 'hoofd', prijs_per_portie: 7.0, organization_id: orgId },
    { naam: '[DEMO] Halloumi-spies', categorie: 'hoofd', prijs_per_portie: 7.5, organization_id: orgId },
    { naam: '[DEMO] Coleslaw', categorie: 'salade', prijs_per_portie: 2.5, organization_id: orgId },
    { naam: '[DEMO] Aardappelsalade', categorie: 'salade', prijs_per_portie: 2.5, organization_id: orgId },
  ];

  const { error: kError } = await supabase.from('klanten').insert(klanten);
  if (kError) return { ok: false, error: `klanten: ${kError.message}` };

  const { error: gError } = await supabase.from('gerechten').insert(gerechten);
  if (gError) return { ok: false, error: `gerechten: ${gError.message}` };

  return { ok: true };
}

/**
 * Verwijdert alle rijen met een `[DEMO]`-prefix in naam voor deze organization.
 * Kan gebruikt worden door een "Verwijder demo-data" knop in Instellingen.
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
