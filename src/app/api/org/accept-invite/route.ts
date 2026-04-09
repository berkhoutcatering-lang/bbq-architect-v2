import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const authSb = await createServerSupabase();
    const { data: { user } } = await authSb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    const { token } = await request.json();
    if (!token) {
      return NextResponse.json({ error: 'Token is verplicht' }, { status: 400 });
    }

    const sb = createServiceSupabase();

    // Find invitation
    const { data: invite, error: invErr } = await sb
      .from('invitations')
      .select('*')
      .eq('token', token)
      .is('accepted_at', null)
      .single();

    if (invErr || !invite) {
      return NextResponse.json({ error: 'Uitnodiging niet gevonden of al gebruikt' }, { status: 404 });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Uitnodiging is verlopen' }, { status: 410 });
    }

    // Create membership
    const { error: memberErr } = await sb
      .from('organization_members')
      .insert({
        organization_id: invite.organization_id,
        user_id: user.id,
        role: invite.role,
        status: 'active',
        invited_by: invite.invited_by,
      });

    if (memberErr) {
      if (memberErr.code === '23505') {
        return NextResponse.json({ error: 'Je bent al lid van deze organisatie' }, { status: 409 });
      }
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }

    // Mark invitation as accepted
    await sb
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id);

    // Update profile with org
    await sb
      .from('profiles')
      .update({ organization_id: invite.organization_id })
      .eq('user_id', user.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Accept invite error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
