// Sprint 2-deel-3 C8 — Server Action voor KvK lookup met per-tenant cache.
//
// Hard rule 5 (BBQ Architect): Zod-validatie + re-auth IN action body.
// Returnt cached resultaat als query < 30 dagen oud is, anders fetcht en cachet.

'use server';

import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase-server';
import { searchKvk, type KvkSearchOutput } from '@/lib/kvk';

const InputSchema = z.object({
  q: z.string().min(3, 'Minimaal 3 tekens').max(100),
});

type Result =
  | { ok: true; data: KvkSearchOutput; cached: boolean }
  | { ok: false; error: string };

const CACHE_TTL_DAYS = 30;

export async function lookupKvk(input: unknown): Promise<Result> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Ongeldige invoer' };
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Niet ingelogd' };

  // Re-auth + resolve org (defensief — naast RLS) voor cache-isolation
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1);
  const orgId = memberships?.[0]?.organization_id;
  if (!orgId) return { ok: false, error: 'Geen organisatie' };

  const queryKey = parsed.data.q.toLowerCase().trim();
  const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Cache hit?
  const { data: cached } = await supabase
    .from('org_kvk_cache')
    .select('data, source, fetched_at')
    .eq('organization_id', orgId)
    .eq('query_key', queryKey)
    .gte('fetched_at', cutoff)
    .maybeSingle();

  if (cached) {
    return {
      ok: true,
      cached: true,
      data: { source: cached.source as 'kvk_official' | 'openkvk', results: (cached.data as { results: KvkSearchOutput['results'] }).results ?? [] },
    };
  }

  // Cache miss → fetch
  let fresh: KvkSearchOutput;
  try {
    fresh = await searchKvk(queryKey);
  } catch (err) {
    return { ok: false, error: `KvK lookup faalde: ${(err as Error).message}` };
  }

  // Write to cache (upsert om race-conditions te voorkomen)
  await supabase
    .from('org_kvk_cache')
    .upsert({
      organization_id: orgId,
      query_key: queryKey,
      data: { results: fresh.results },
      source: fresh.source,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,query_key' });

  return { ok: true, cached: false, data: fresh };
}
