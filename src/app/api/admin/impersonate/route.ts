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

// GET — List all users with their orgs (for impersonation picker)
export async function GET(request: NextRequest) {
  void request;
  const user = await getPlatformAdmin();
  if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  const sb = createServiceSupabase();

  // Get all users with their org memberships
  const { data: members } = await sb
    .from('organization_members')
    .select('user_id, role, status, organization_id')
    .eq('status', 'active');

  // Get profiles
  const userIds = [...new Set((members || []).map((m: any) => m.user_id))];
  const { data: profiles } = await sb
    .from('profiles')
    .select('user_id, naam, email')
    .in('user_id', userIds);

  // Get org names
  const orgIds = [...new Set((members || []).map((m: any) => m.organization_id))];
  const { data: orgs } = await sb
    .from('organizations')
    .select('id, name')
    .in('id', orgIds);

  const orgMap: Record<string, string> = {};
  (orgs || []).forEach((o: any) => { orgMap[o.id] = o.name; });

  const profileMap: Record<string, any> = {};
  (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });

  const users = (members || []).map((m: any) => ({
    userId: m.user_id,
    naam: profileMap[m.user_id]?.naam || 'Onbekend',
    email: profileMap[m.user_id]?.email || '',
    role: m.role,
    orgId: m.organization_id,
    orgName: orgMap[m.organization_id] || 'Onbekend',
  }));

  return NextResponse.json({ users });
}

// POST — Generate a magic link for impersonation
export async function POST(request: NextRequest) {
  const admin = await getPlatformAdmin();
  if (!admin) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: 'userId is verplicht' }, { status: 400 });

  const sb = createServiceSupabase();

  // Get user email
  const { data: profile } = await sb
    .from('profiles')
    .select('email')
    .eq('user_id', userId)
    .single();

  if (!profile?.email) {
    return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 });
  }

  // Generate a magic link (OTP) for impersonation
  const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email: profile.email,
  });

  if (linkErr) {
    return NextResponse.json({ error: 'Link genereren mislukt: ' + linkErr.message }, { status: 500 });
  }

  // Extract the token from the link
  const actionLink = linkData?.properties?.action_link;

  if (!actionLink) {
    return NextResponse.json({ error: 'Geen link gegenereerd' }, { status: 500 });
  }

  // Parse the token from the action link and construct a local callback URL
  const url = new URL(actionLink);
  const token = url.searchParams.get('token') || url.hash?.split('access_token=')[1]?.split('&')[0];

  return NextResponse.json({
    success: true,
    email: profile.email,
    // Return the full action link — the admin opens this in a new tab
    loginUrl: actionLink,
  });
}
