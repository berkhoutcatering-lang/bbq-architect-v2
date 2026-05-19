import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';
import { exchangeCodeForToken, listAdministrations, getMoneybirdConfig } from '@/lib/moneybird';

export const runtime = 'nodejs';

/**
 * GET /api/integrations/moneybird/callback
 *
 * OAuth-callback. Wisselt `code` om voor access-token, slaat op in
 * organizations.feature_flags.moneybird.
 */
export async function GET(request: NextRequest) {
  if (!getMoneybirdConfig()) {
    return NextResponse.redirect(new URL('/instellingen/integraties?error=mb_not_configured', request.url));
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const cookieState = request.cookies.get('mb_oauth_state')?.value;

  if (!code || !state || state !== cookieState) {
    return NextResponse.redirect(new URL('/instellingen/integraties?error=mb_state_mismatch', request.url));
  }

  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const tokenRes = await exchangeCodeForToken(code);
  if ('error' in tokenRes) {
    return NextResponse.redirect(new URL(`/instellingen/integraties?error=${encodeURIComponent(tokenRes.error)}`, request.url));
  }

  // Lijst van administrations ophalen om er één te kiezen (eerste = default)
  const admins = await listAdministrations(tokenRes.access_token);
  const adminId = Array.isArray(admins) && admins[0]?.id ? admins[0].id : null;

  // Vind org via membership van user
  const sb = createServiceSupabase();
  const { data: membership } = await sb
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .maybeSingle();

  if (!membership) {
    return NextResponse.redirect(new URL('/instellingen/integraties?error=no_org', request.url));
  }

  // Lees huidige feature_flags en merge moneybird-config
  const { data: org } = await sb
    .from('organizations')
    .select('feature_flags')
    .eq('id', membership.organization_id)
    .single();

  const ff = (org?.feature_flags || {}) as Record<string, unknown>;
  /* P0.12 — sla expires_at expliciet op zodat getValidMoneybirdToken
     weet wanneer hij moet refreshen. Moneybird geeft expires_in (seconden),
     wij rekenen het om naar absoluut tijdstip. Fallback 30 dagen als
     Moneybird geen expires_in stuurt. */
  const lifetimeMs = (tokenRes.expires_in ?? 30 * 24 * 60 * 60) * 1000;
  ff.moneybird = {
    access_token: tokenRes.access_token,
    refresh_token: tokenRes.refresh_token || null,
    administration_id: adminId,
    expires_at: new Date(Date.now() + lifetimeMs).toISOString(),
    connected_at: new Date().toISOString(),
  };

  await sb
    .from('organizations')
    .update({ feature_flags: ff })
    .eq('id', membership.organization_id);

  const res = NextResponse.redirect(new URL('/instellingen/integraties?moneybird=connected', request.url));
  res.cookies.delete('mb_oauth_state');
  return res;
}
