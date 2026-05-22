// Sprint 2-deel-3 C8 — KvK status. Altijd configured=true want OpenKvK
// werkt als gratis fallback wanneer KVK_API_KEY ontbreekt.

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const hasOfficial = !!process.env.KVK_API_KEY;
  return NextResponse.json({
    configured: true, // OpenKvK fallback altijd beschikbaar
    source: hasOfficial ? 'kvk_official' : 'openkvk',
    upgrade_available: !hasOfficial,
  });
}
