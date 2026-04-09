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

// GET — Check for inactive organizations (>7 days no activity)
export async function GET(request: NextRequest) {
  void request;
  const user = await getPlatformAdmin();
  if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  const sb = createServiceSupabase();

  // Fetch all active organizations
  const { data: orgs } = await sb
    .from('organizations')
    .select('id, name, created_at')
    .not('name', 'like', '[INACTIEF]%');

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ alerts: [] });
  }

  const orgIds = orgs.map((o: any) => o.id);

  // Fetch last activity per org
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

  // Also check for data creation (events, offertes, facturen) as fallback activity
  for (const table of ['events', 'offertes', 'facturen']) {
    const { data: rows } = await sb
      .from(table)
      .select('organization_id, created_at')
      .in('organization_id', orgIds)
      .order('created_at', { ascending: false })
      .limit(200);

    (rows || []).forEach((r: any) => {
      if (!lastActivity[r.organization_id] || r.created_at > lastActivity[r.organization_id]) {
        lastActivity[r.organization_id] = r.created_at;
      }
    });
  }

  const now = Date.now();
  const alerts = orgs
    .map((org: any) => {
      const last = lastActivity[org.id] || org.created_at;
      const daysInactive = Math.floor((now - new Date(last).getTime()) / 86400000);

      if (daysInactive < 7) return null;

      let severity: 'warning' | 'critical' | 'churned' = 'warning';
      if (daysInactive > 30) severity = 'churned';
      else if (daysInactive > 14) severity = 'critical';

      return {
        orgId: org.id,
        orgName: org.name,
        daysInactive,
        lastActivity: last,
        severity,
        message: daysInactive > 30
          ? org.name + ' is al ' + daysInactive + ' dagen inactief — churn-risico'
          : daysInactive > 14
            ? org.name + ' is ' + daysInactive + ' dagen inactief — neem contact op'
            : org.name + ' is ' + daysInactive + ' dagen inactief — houd in de gaten',
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.daysInactive - a.daysInactive);

  return NextResponse.json({ alerts, checkedAt: new Date().toISOString() });
}
