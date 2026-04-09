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

// POST — Send inactivity alert email to org admin
export async function POST(request: NextRequest) {
  const user = await getPlatformAdmin();
  if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  const { orgId, orgName, daysInactive } = await request.json();
  if (!orgId) return NextResponse.json({ error: 'orgId is verplicht' }, { status: 400 });

  const sb = createServiceSupabase();

  // Find admin members of the org
  const { data: adminMembers } = await sb
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('role', 'Admin')
    .eq('status', 'active');

  if (!adminMembers || adminMembers.length === 0) {
    return NextResponse.json({ error: 'Geen admin gevonden voor deze organisatie' }, { status: 404 });
  }

  // Get admin emails from profiles
  const userIds = adminMembers.map((m: any) => m.user_id);
  const { data: profiles } = await sb
    .from('profiles')
    .select('email, naam')
    .in('user_id', userIds);

  const emails = (profiles || []).map((p: any) => p.email).filter(Boolean);

  if (emails.length === 0) {
    return NextResponse.json({ error: 'Geen email adressen gevonden' }, { status: 404 });
  }

  // Send email via the existing send-email endpoint
  const emailBody = `
    <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #c4a35a, #8b6914); line-height: 48px; color: white; font-size: 20px;">🔥</div>
      </div>
      <h2 style="font-size: 20px; font-weight: 700; text-align: center; margin-bottom: 8px;">We missen je!</h2>
      <p style="color: #666; text-align: center; margin-bottom: 24px;">
        Het is al <strong>${daysInactive} dagen</strong> geleden dat er activiteit was in <strong>${orgName || 'je organisatie'}</strong>.
      </p>
      <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="margin: 0 0 12px; font-weight: 600;">Wat je kunt doen:</p>
        <ul style="margin: 0; padding-left: 20px; color: #555;">
          <li>Log in en bekijk je agenda</li>
          <li>Maak een offerte voor je volgende event</li>
          <li>Nodig een teamlid uit</li>
        </ul>
      </div>
      <div style="text-align: center;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.bbqarchitect.nl'}"
           style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #c4a35a, #8b6914); color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Ga naar BBQ Architect
        </a>
      </div>
      <p style="color: #999; font-size: 12px; text-align: center; margin-top: 24px;">
        Je ontvangt deze email omdat je admin bent van ${orgName || 'een organisatie'} in BBQ Architect.
      </p>
    </div>
  `;

  // Try to send via the send-email API (uses Resend)
  try {
    const sendRes = await fetch(new URL('/api/send-email', request.url).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        to: emails[0],
        subject: `We missen je in BBQ Architect — ${daysInactive} dagen inactief`,
        html: emailBody,
      }),
    });

    if (!sendRes.ok) {
      return NextResponse.json({
        warning: 'Email kon niet verzonden worden (Resend niet geconfigureerd?)',
        targetEmails: emails,
      });
    }

    return NextResponse.json({
      success: true,
      sentTo: emails[0],
      message: 'Alert email verzonden naar ' + emails[0],
    });
  } catch {
    return NextResponse.json({
      warning: 'Email service niet beschikbaar',
      targetEmails: emails,
    });
  }
}
