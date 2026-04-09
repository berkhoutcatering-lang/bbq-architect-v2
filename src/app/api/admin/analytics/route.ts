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

// GET — Usage analytics: activity per day, per org, feature adoption
export async function GET(request: NextRequest) {
  void request;
  const user = await getPlatformAdmin();
  if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  const sb = createServiceSupabase();

  // Activity per day (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: activityRows } = await sb
    .from('activity_log')
    .select('organization_id, action, created_at')
    .gte('created_at', thirtyDaysAgo)
    .order('created_at');

  // Aggregate by day
  const dailyActivity: Record<string, number> = {};
  const orgDailyActivity: Record<string, Record<string, number>> = {};
  const pageVisits: Record<string, number> = {};

  (activityRows || []).forEach((row: any) => {
    const day = row.created_at.slice(0, 10);
    dailyActivity[day] = (dailyActivity[day] || 0) + 1;

    if (!orgDailyActivity[row.organization_id]) orgDailyActivity[row.organization_id] = {};
    orgDailyActivity[row.organization_id][day] = (orgDailyActivity[row.organization_id][day] || 0) + 1;
  });

  // Page visit breakdown from activity_log
  const { data: pageRows } = await sb
    .from('activity_log')
    .select('page')
    .eq('action', 'page_visit')
    .gte('created_at', thirtyDaysAgo);

  (pageRows || []).forEach((row: any) => {
    if (row.page) {
      const section = '/' + (row.page.split('/')[1] || 'home');
      pageVisits[section] = (pageVisits[section] || 0) + 1;
    }
  });

  // Org names
  const { data: orgs } = await sb.from('organizations').select('id, name').not('name', 'like', '[INACTIEF]%');
  const orgNames: Record<string, string> = {};
  (orgs || []).forEach((o: any) => { orgNames[o.id] = o.name; });

  // Build daily chart data (last 30 days)
  const chartData = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const day = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
    chartData.push({ date: day, label, total: dailyActivity[day] || 0 });
  }

  // Per-org totals
  const orgTotals = Object.entries(orgDailyActivity).map(([orgId, days]) => ({
    orgId,
    orgName: orgNames[orgId] || orgId.slice(0, 8),
    totalActions: Object.values(days).reduce((s, v) => s + v, 0),
  })).sort((a, b) => b.totalActions - a.totalActions);

  // Top pages
  const topPages = Object.entries(pageVisits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([page, count]) => ({ page, count }));

  return NextResponse.json({
    chartData,
    orgTotals,
    topPages,
    totalActions: Object.values(dailyActivity).reduce((s, v) => s + v, 0),
    activeOrgs: orgTotals.filter(o => o.totalActions > 0).length,
  });
}
