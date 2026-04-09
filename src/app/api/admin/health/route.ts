/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

async function getPlatformAdmin() {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return null;

  const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (!adminEmails.includes((user.email || '').toLowerCase())) return null;
  return user;
}

// GET — Compute health scores for all organizations
export async function GET(request: NextRequest) {
  void request;
  const user = await getPlatformAdmin();
  if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  const sb = createServiceSupabase();

  // Fetch all active organizations
  const { data: orgs } = await sb
    .from('organizations')
    .select('id, name, created_at')
    .not('name', 'like', '[INACTIEF]%')
    .order('created_at');

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ healthScores: [] });
  }

  const orgIds = orgs.map((o: any) => o.id);

  // Fetch data counts per org
  const tables = ['events', 'offertes', 'facturen', 'recepten', 'gerechten', 'klanten'];
  const dataCounts: Record<string, Record<string, number>> = {};

  for (const table of tables) {
    const { data: rows } = await sb.from(table).select('organization_id').in('organization_id', orgIds);
    (rows || []).forEach((r: any) => {
      if (!dataCounts[r.organization_id]) dataCounts[r.organization_id] = {};
      dataCounts[r.organization_id][table] = (dataCounts[r.organization_id][table] || 0) + 1;
    });
  }

  // Fetch member counts per org
  const { data: allMembers } = await sb
    .from('organization_members')
    .select('organization_id, status')
    .in('organization_id', orgIds)
    .eq('status', 'active');

  const memberCounts: Record<string, number> = {};
  (allMembers || []).forEach((m: any) => {
    memberCounts[m.organization_id] = (memberCounts[m.organization_id] || 0) + 1;
  });

  // Fetch last activity per org (most recent row in activity_log or fallback to data)
  const { data: activityRows } = await sb
    .from('activity_log')
    .select('organization_id, created_at')
    .in('organization_id', orgIds)
    .order('created_at', { ascending: false })
    .limit(500);

  const lastActivity: Record<string, string> = {};
  (activityRows || []).forEach((a: any) => {
    if (!lastActivity[a.organization_id]) {
      lastActivity[a.organization_id] = a.created_at;
    }
  });

  // Fetch onboarding milestones per org
  const { data: onboardingRows } = await sb
    .from('onboarding_events')
    .select('organization_id, milestone')
    .in('organization_id', orgIds);

  const milestones: Record<string, Set<string>> = {};
  (onboardingRows || []).forEach((o: any) => {
    if (!milestones[o.organization_id]) milestones[o.organization_id] = new Set();
    milestones[o.organization_id].add(o.milestone);
  });

  // Compute health scores
  const now = Date.now();
  const healthScores = orgs.map((org: any) => {
    const data = dataCounts[org.id] || {};
    const members = memberCounts[org.id] || 0;
    const lastAct = lastActivity[org.id] || org.created_at;
    const daysSinceActivity = Math.floor((now - new Date(lastAct).getTime()) / 86400000);
    const orgMilestones = milestones[org.id] || new Set();

    // Activity score (0-100): based on recency
    let activity = 100;
    if (daysSinceActivity > 30) activity = 0;
    else if (daysSinceActivity > 14) activity = 20;
    else if (daysSinceActivity > 7) activity = 50;
    else if (daysSinceActivity > 3) activity = 75;
    else if (daysSinceActivity > 1) activity = 90;

    // Data richness (0-100): based on content volume
    const totalData = Object.values(data).reduce((s, v) => s + v, 0);
    let dataRichness = Math.min(100, Math.round((totalData / 20) * 100));
    // Bonus for variety
    const tablesUsed = Object.keys(data).length;
    if (tablesUsed >= 4) dataRichness = Math.min(100, dataRichness + 15);

    // Adoption (0-100): based on milestones and feature usage
    const allMilestones = ['first_login', 'settings_configured', 'first_recipe', 'first_event', 'first_offerte', 'first_factuur', 'first_team_invite'];
    const adoptionPct = allMilestones.length > 0
      ? Math.round((orgMilestones.size / allMilestones.length) * 100)
      : (tablesUsed >= 3 ? 60 : tablesUsed >= 1 ? 30 : 0);

    // Team size (0-100)
    let teamScore = 0;
    if (members >= 5) teamScore = 100;
    else if (members >= 3) teamScore = 80;
    else if (members >= 2) teamScore = 60;
    else if (members >= 1) teamScore = 40;

    // Overall (weighted average)
    const overall = Math.round(
      activity * 0.35 +
      dataRichness * 0.30 +
      adoptionPct * 0.20 +
      teamScore * 0.15
    );

    // Status
    let status: string = 'healthy';
    if (overall < 20 || daysSinceActivity > 30) status = 'churned';
    else if (overall < 40 || daysSinceActivity > 14) status = 'critical';
    else if (overall < 60 || daysSinceActivity > 7) status = 'at-risk';

    return {
      orgId: org.id,
      orgName: org.name,
      overall,
      activity,
      dataRichness,
      adoption: adoptionPct,
      teamSize: teamScore,
      lastActivity: lastAct,
      daysInactive: daysSinceActivity,
      status,
      memberCount: members,
      dataCount: totalData,
    };
  });

  return NextResponse.json({ healthScores });
}
