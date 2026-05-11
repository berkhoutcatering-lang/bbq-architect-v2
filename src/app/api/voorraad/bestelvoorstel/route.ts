/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { buildBestelvoorstel } from '@/lib/dal/bestelvoorstel';

export const runtime = 'nodejs';

/**
 * GET /api/voorraad/bestelvoorstel?window=14
 * ─────────────────────────────────────────
 * Wat moet ik bestellen voor de bevestigde events komende N dagen, per leverancier?
 * Math is deterministic — AI mag uitleggen (zie Sonnet endpoint later), niet rekenen.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen actieve organisatie' }, { status: 403 });

    const windowDays = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get('window')) || 14));
    const summary = await buildBestelvoorstel(supabase, orgId, windowDays);
    return NextResponse.json(summary, {
      headers: { 'Cache-Control': 'private, max-age=120, stale-while-revalidate=300' },
    });
  } catch (err: any) {
    console.error('[voorraad/bestelvoorstel]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}
