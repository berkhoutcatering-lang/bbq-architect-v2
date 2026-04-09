import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

// POST — Log an onboarding milestone
export async function POST(request: NextRequest) {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }

  const body = await request.json();
  const { milestone, organizationId, metadata } = body;

  if (!milestone || !organizationId) {
    return NextResponse.json({ error: 'milestone en organizationId zijn verplicht' }, { status: 400 });
  }

  const sb = createServiceSupabase();

  // Check if milestone already exists for this org (idempotent)
  const { data: existing } = await sb
    .from('onboarding_events')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('milestone', milestone)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ success: true, alreadyLogged: true });
  }

  await sb.from('onboarding_events').insert({
    organization_id: organizationId,
    user_id: user.id,
    milestone,
    metadata: metadata || {},
  });

  return NextResponse.json({ success: true, alreadyLogged: false });
}

// GET — Fetch onboarding milestones for an org
export async function GET(request: NextRequest) {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get('orgId');
  if (!orgId) {
    return NextResponse.json({ error: 'orgId parameter is verplicht' }, { status: 400 });
  }

  const sb = createServiceSupabase();

  const { data: events } = await sb
    .from('onboarding_events')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at');

  const allMilestones = [
    'first_login',
    'settings_configured',
    'first_recipe',
    'first_event',
    'first_offerte',
    'first_factuur',
    'first_team_invite',
  ];

  const completedMilestones = new Set((events || []).map(e => e.milestone));
  const progress = Math.round((completedMilestones.size / allMilestones.length) * 100);

  // Compute TTFV: time from org creation to first meaningful milestone
  let ttfvMinutes: number | null = null;
  if (events && events.length > 0) {
    const firstValueMilestones = ['first_recipe', 'first_event', 'first_offerte'];
    const firstValue = events.find(e => firstValueMilestones.includes(e.milestone));
    if (firstValue) {
      const { data: org } = await sb.from('organizations').select('created_at').eq('id', orgId).single();
      if (org) {
        ttfvMinutes = Math.round((new Date(firstValue.created_at).getTime() - new Date(org.created_at).getTime()) / 60000);
      }
    }
  }

  return NextResponse.json({
    events: events || [],
    completedMilestones: Array.from(completedMilestones),
    totalMilestones: allMilestones.length,
    progress,
    ttfvMinutes,
  });
}
