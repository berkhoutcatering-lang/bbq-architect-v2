import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { buildAuthorizeUrl, getMoneybirdConfig } from '@/lib/moneybird';
import { randomBytes } from 'node:crypto';

export const runtime = 'nodejs';

/**
 * GET /api/integrations/moneybird/connect
 *
 * Start OAuth-flow. Genereert een random `state`, slaat die op in cookie,
 * redirect naar Moneybird's authorize-endpoint.
 */
export async function GET(request: NextRequest) {
  if (!getMoneybirdConfig()) {
    return NextResponse.json({
      error: 'Moneybird-integratie nog niet geconfigureerd',
      hint: 'Stel MONEYBIRD_CLIENT_ID, MONEYBIRD_CLIENT_SECRET en MONEYBIRD_REDIRECT_URI in — zie docs/execution-playbook.md §G',
    }, { status: 503 });
  }

  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const state = randomBytes(16).toString('hex');
  const url = buildAuthorizeUrl(state);

  const res = NextResponse.redirect(url);
  res.cookies.set('mb_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600, // 10 min
    path: '/',
  });
  return res;
}
