/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

// Platform admin check: user must be Admin of the first-created organization (platform owner)
// If PLATFORM_ADMIN_EMAILS is set, check against that list instead
async function getPlatformAdmin(request?: NextRequest) {
  void request; // available for future header-based checks
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return null;

  const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map(function (e) { return e.trim().toLowerCase(); }).filter(Boolean);

  // Only explicit platform admins can access — no fallback
  if (!adminEmails.includes((user.email || '').toLowerCase())) return null;
  return user;
}

// GET — List all organizations with member counts
export async function GET(request: NextRequest) {
  const user = await getPlatformAdmin(request);
  if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  const sb = createServiceSupabase();

  // Fetch all organizations
  const { data: orgs, error } = await sb
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch all active members to count per org
  const { data: allMembers } = await sb
    .from('organization_members')
    .select('organization_id, status');

  const memberCounts: Record<string, { active: number; invited: number }> = {};
  (allMembers || []).forEach(function (m: any) {
    if (!memberCounts[m.organization_id]) memberCounts[m.organization_id] = { active: 0, invited: 0 };
    if (m.status === 'active') memberCounts[m.organization_id].active++;
    if (m.status === 'invited') memberCounts[m.organization_id].invited++;
  });

  // Fetch pending invitations
  const { data: allInvitations } = await sb
    .from('invitations')
    .select('organization_id, email, role, token, expires_at, accepted_at, created_at')
    .is('accepted_at', null)
    .order('created_at', { ascending: false });

  const invitationsByOrg: Record<string, any[]> = {};
  (allInvitations || []).forEach(function (inv: any) {
    if (!invitationsByOrg[inv.organization_id]) invitationsByOrg[inv.organization_id] = [];
    invitationsByOrg[inv.organization_id].push(inv);
  });

  // Fetch data counts per org for key tables
  const tables = ['events', 'offertes', 'facturen', 'recepten'];
  const dataCounts: Record<string, Record<string, number>> = {};

  for (const table of tables) {
    const { data: rows } = await sb.from(table).select('organization_id');
    (rows || []).forEach(function (r: any) {
      if (!r.organization_id) return;
      if (!dataCounts[r.organization_id]) dataCounts[r.organization_id] = {};
      dataCounts[r.organization_id][table] = (dataCounts[r.organization_id][table] || 0) + 1;
    });
  }

  const result = (orgs || []).map(function (org: any) {
    return {
      ...org,
      members: memberCounts[org.id] || { active: 0, invited: 0 },
      invitations: invitationsByOrg[org.id] || [],
      data: dataCounts[org.id] || {},
    };
  });

  return NextResponse.json({ organizations: result, currentUser: user.email });
}

// POST — Create new organization + optionally invite admin
export async function POST(request: NextRequest) {
  const user = await getPlatformAdmin(request);
  if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  const body = await request.json();
  const { name, adminEmail, adminNaam, adminPassword, brandColor } = body;

  if (!name) return NextResponse.json({ error: 'Organisatienaam is verplicht' }, { status: 400 });

  const sb = createServiceSupabase();

  // Generate slug
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    + '-' + Math.random().toString(36).slice(2, 6);

  // Create organization
  const { data: org, error: orgErr } = await sb
    .from('organizations')
    .insert({ name, slug })
    .select()
    .single();

  if (orgErr) return NextResponse.json({ error: 'Organisatie aanmaken mislukt: ' + orgErr.message }, { status: 500 });

  // Create default settings
  await sb.from('settings').insert({
    organization_id: org.id,
    bedrijfsnaam: name,
    ondertitel: '',
    email: adminEmail || '',
    telefoon: '',
    adres: '',
    kvk: '',
    btw: '',
    iban: '',
    factuur_prefix: 'F',
    offerte_prefix: 'O',
    default_btw: 21,
    betaaltermijn: 14,
    offerte_geldig: 30,
    brand_primary: brandColor || '#9e781c',
  });

  let memberLinked = false;
  let userCreated = false;

  if (adminEmail) {
    // Check if user already exists in auth
    const { data: existingProfile } = await sb
      .from('profiles')
      .select('user_id, naam')
      .eq('email', adminEmail.toLowerCase())
      .limit(1)
      .single();

    if (existingProfile && existingProfile.user_id) {
      // User exists — directly link as Admin member
      await sb.from('organization_members').insert({
        organization_id: org.id,
        user_id: existingProfile.user_id,
        role: 'Admin',
        status: 'active',
        invited_by: user.id,
      });
      await sb.from('profiles').update({ organization_id: org.id }).eq('user_id', existingProfile.user_id);
      memberLinked = true;
    } else if (adminPassword) {
      // Create auth user + profile + membership in one go
      const { data: newUser, error: authErr } = await sb.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { name: adminNaam || adminEmail.split('@')[0] },
      });

      if (authErr) {
        return NextResponse.json({
          organization: org,
          error: 'Organisatie aangemaakt maar user aanmaken mislukt: ' + authErr.message,
        });
      }

      if (newUser?.user) {
        // Link as Admin member
        await sb.from('organization_members').insert({
          organization_id: org.id,
          user_id: newUser.user.id,
          role: 'Admin',
          status: 'active',
          invited_by: user.id,
        });

        // Update profile (trigger already created it)
        await sb.from('profiles').update({
          organization_id: org.id,
          naam: adminNaam || adminEmail.split('@')[0],
        }).eq('user_id', newUser.user.id);

        memberLinked = true;
        userCreated = true;
      }
    } else {
      // No password — create invitation token
      await sb.from('invitations').insert({
        organization_id: org.id,
        email: adminEmail,
        role: 'Admin',
        invited_by: user.id,
      });

      // Create placeholder profile
      if (adminNaam) {
        await sb.from('profiles').insert({
          naam: adminNaam,
          email: adminEmail,
          rol: 'Admin',
          status: 'invited',
          organization_id: org.id,
        });
      }
    }
  }

  return NextResponse.json({
    organization: org,
    memberLinked,
    userCreated,
    message: userCreated
      ? 'Organisatie aangemaakt, account aangemaakt en gekoppeld'
      : memberLinked
        ? 'Organisatie aangemaakt en admin gekoppeld'
        : 'Organisatie aangemaakt',
  });
}

// DELETE — Deactivate organization (soft delete: rename + disable members)
export async function DELETE(request: NextRequest) {
  const user = await getPlatformAdmin(request);
  if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  const { organizationId } = await request.json();
  if (!organizationId) return NextResponse.json({ error: 'organizationId is verplicht' }, { status: 400 });

  const sb = createServiceSupabase();

  // Deactivate all members
  await sb
    .from('organization_members')
    .update({ status: 'inactive' })
    .eq('organization_id', organizationId);

  // Mark org as deactivated by prefixing name
  const { data: org } = await sb
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .single();

  if (org && !org.name.startsWith('[INACTIEF] ')) {
    await sb
      .from('organizations')
      .update({ name: '[INACTIEF] ' + org.name })
      .eq('id', organizationId);
  }

  return NextResponse.json({ success: true, message: 'Organisatie gedeactiveerd' });
}
