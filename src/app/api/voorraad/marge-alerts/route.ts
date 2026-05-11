/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { scanMargeAlerts } from '@/lib/dal/margeAlerts';

export const runtime = 'nodejs';

/**
 * GET  /api/voorraad/marge-alerts → lijst open alerts voor huidige org
 * POST /api/voorraad/marge-alerts → trigger scan (handmatig of vanuit cron)
 *
 * Pillar #4 — Marge-alert engine.
 */
export async function GET() {
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

    const { data: alerts } = await supabase
      .from('marge_alerts')
      .select(`
        id, inventory_id, leverancier_id, old_price, new_price, pct_change,
        affected_offertes, total_marge_impact_eur, status, detected_at, notes,
        inventory:inventory_id (naam, unit, categorie),
        leverancier:leverancier_id (naam, type)
      `)
      .eq('organization_id', orgId)
      .eq('status', 'open')
      .order('detected_at', { ascending: false })
      .limit(50);

    return NextResponse.json({ alerts: alerts || [] }, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=180' },
    });
  } catch (err: any) {
    console.error('[marge-alerts GET]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}

export async function POST(_req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen actieve organisatie' }, { status: 403 });

    const result = await scanMargeAlerts(supabase, orgId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[marge-alerts POST]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const body = await req.json() as { id: number; status?: 'acknowledged' | 'resolved' | 'dismissed'; notes?: string };
    if (!body.id) return NextResponse.json({ error: 'id is verplicht' }, { status: 400 });

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen actieve organisatie' }, { status: 403 });

    const updates: Record<string, unknown> = {};
    if (body.status) {
      updates.status = body.status;
      if (body.status === 'resolved' || body.status === 'dismissed') {
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by_user_id = user.id;
      }
    }
    if (typeof body.notes === 'string') updates.notes = body.notes;

    const { error } = await supabase
      .from('marge_alerts')
      .update(updates)
      .eq('id', body.id)
      .eq('organization_id', orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[marge-alerts PATCH]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}
