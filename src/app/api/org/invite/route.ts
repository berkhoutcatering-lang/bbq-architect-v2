import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

// POST /api/org/invite — Invite a user to the organization
export async function POST(request: NextRequest) {
  try {
    const authSb = await createServerSupabase();
    const { data: { user } } = await authSb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    const { email, role, organizationId } = await request.json();
    if (!email || !organizationId) {
      return NextResponse.json({ error: 'email en organizationId zijn verplicht' }, { status: 400 });
    }

    // Verify caller is Admin of this org
    const { data: membership } = await authSb
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (!membership || membership.role !== 'Admin') {
      return NextResponse.json({ error: 'Alleen admins kunnen uitnodigen' }, { status: 403 });
    }

    const sb = createServiceSupabase();

    // Check if already a member
    const { data: existing } = await sb
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('user_id', (await sb.from('profiles').select('user_id').eq('email', email).single()).data?.user_id || '')
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Gebruiker is al lid' }, { status: 409 });
    }

    // Create invitation
    const { data: invite, error: invErr } = await sb
      .from('invitations')
      .insert({
        organization_id: organizationId,
        email,
        role: role || 'Medewerker',
        invited_by: user.id,
      })
      .select()
      .single();

    if (invErr) {
      return NextResponse.json({ error: invErr.message }, { status: 500 });
    }

    return NextResponse.json({ invitation: invite });
  } catch (err) {
    console.error('Invite error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
