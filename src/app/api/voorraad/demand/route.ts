/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getInventoryWithDemand } from '@/lib/dal/inventoryDemand';

export const runtime = 'nodejs';

/**
 * GET /api/voorraad/demand?window=14
 * ─────────────────────────────────
 * Returnt event-aware voorraad-snapshot voor de EventSpine en bestelvoorstel.
 * Server-side RLS via createServerSupabase + expliciete org_id-check via
 * organization_members.
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

    const windowParam = req.nextUrl.searchParams.get('window');
    const windowDays = Math.min(60, Math.max(1, Number(windowParam) || 14));

    const summary = await getInventoryWithDemand(supabase, orgId, windowDays);
    return NextResponse.json(summary, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
    });
  } catch (err: any) {
    console.error('[voorraad/demand]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}
