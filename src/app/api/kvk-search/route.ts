// Sprint 2-deel-3 C8 — Lightweight test-endpoint voor de KvK wizard.
//
// Roept searchKvk() rechtstreeks aan zonder cache-laag. Productie lookups
// gaan via de lookupKvk Server Action (die wel cachet).
//
// Auth: vereist een ingelogde user. Doet GEEN org-resolve omdat dit een
// test-call is — die data komt niet bij multi-tenant assets.

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { searchKvk } from '@/lib/kvk';

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  if (q.length < 3) {
    return NextResponse.json({ error: 'Minimaal 3 tekens' }, { status: 400 });
  }
  if (q.length > 100) {
    return NextResponse.json({ error: 'Maximaal 100 tekens' }, { status: 400 });
  }

  try {
    const result = await searchKvk(q);
    return NextResponse.json({
      source: result.source,
      hits: result.results.length,
      results: result.results,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST hits dezelfde flow — voor de wizard test-button.
export async function POST() {
  // Test-call: zoek naar "hopbites" om te valideren dat KvK API key werkt.
  // Geen body nodig.
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }

  try {
    const result = await searchKvk('hopbites');
    if (result.results.length === 0) {
      return NextResponse.json({
        error: `Geen resultaten via ${result.source}. ${result.source === 'openkvk'
          ? 'Voeg KVK_API_KEY toe voor de officiële API.'
          : 'API-key werkt maar geen test-bedrijf gevonden.'}`,
      }, { status: 502 });
    }
    return NextResponse.json({
      message: `Test geslaagd — ${result.results.length} resultaat${result.results.length > 1 ? 'ten' : ''} via ${result.source === 'kvk_official' ? 'officiële KvK API' : 'OpenKvK fallback'}.`,
      source: result.source,
      sample: result.results[0],
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
