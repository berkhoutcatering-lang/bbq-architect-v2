import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/login', '/signup', '/auth/callback', '/q/', '/invite', '/api/accept-offerte', '/api/webhooks', '/api/billing/webhook', '/api/email/inbound', '/api/extension/', '/welkom', '/pricing', '/legal'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public routes
  if (PUBLIC_ROUTES.some(function (route) { return pathname.startsWith(route); })) {
    return NextResponse.next();
  }

  // Skip static assets
  if (pathname.startsWith('/_next') || pathname.startsWith('/icons') || pathname === '/manifest.json' || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(function ({ name, value }) {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(function ({ name, value, options }) {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // getUser() valideert tegen de Auth-server (netwerkcall). Bij wifi-loss willen
  // we niet uitloggen — val terug op getSession() zodat een geldige cookie-sessie
  // (en dus een actief offline-event) blijft werken tot de cookie echt verloopt.
  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      const { data: sessionData } = await supabase.auth.getSession();
      user = sessionData.session?.user ?? null;
    } else {
      user = data.user;
    }
  } catch {
    const { data: sessionData } = await supabase.auth.getSession();
    user = sessionData.session?.user ?? null;
  }

  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)',
  ],
};
