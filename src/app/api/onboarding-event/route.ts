import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';
import { withTenantAuth } from '@/lib/withTenantAuth';

// POST — Log an onboarding milestone
export const POST = withTenantAuth(async function POST(request: NextRequest, ctx) {
  const body = await request.json();
  const { milestone, metadata } = body;

  if (!milestone) {
    return NextResponse.json({ error: 'milestone is verplicht' }, { status: 400 });
  }

  const sb = createServiceSupabase();

  // Check if milestone already exists for this org (idempotent)
  const { data: existing } = await sb
    .from('onboarding_events')
    .select('id')
    .eq('organization_id', ctx.orgId)
    .eq('milestone', milestone)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ success: true, alreadyLogged: true });
  }

  await sb.from('onboarding_events').insert({
    organization_id: ctx.orgId,
    user_id: ctx.userId,
    milestone,
    metadata: metadata || {},
  });

  return NextResponse.json({ success: true, alreadyLogged: false });
});

// GET — Fetch onboarding milestones for an org
export const GET = withTenantAuth(async function GET(_request: NextRequest, ctx) {
  const sb = createServiceSupabase();

  const { data: events } = await sb
    .from('onboarding_events')
    .select('*')
    .eq('organization_id', ctx.orgId)
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
      const { data: org } = await sb.from('organizations').select('created_at').eq('id', ctx.orgId).single();
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
});
