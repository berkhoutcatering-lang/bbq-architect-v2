import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/login', '/signup', '/auth/callback', '/q/', '/invite', '/api/accept-offerte', '/api/public-offerte', '/api/billing/webhook', '/api/email/inbound', '/api/extension/', '/welkom', '/pricing', '/legal'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /offerte-editor is uitgefaseerd — redirect oude bookmarks naar /offertes
  // (route-directory zelf is verwijderd; deze redirect blijft tot we zeker weten
  //  dat geen externe links er meer naar wijzen).
  if (pathname.startsWith('/offerte-editor')) {
    return NextResponse.redirect(new URL('/offertes', request.url), 308);
  }

  // /gerechten/ingredienten was een gateway-pagina met 3 KPI-tiles die feitelijk
  // naar /voorraad linkte. KPI's zijn in S2.7 verhuisd naar /gerechten/insights;
  // de daadwerkelijke edit-flow zit in /voorraad. Redirect oude bookmarks.
  if (pathname.startsWith('/gerechten/ingredienten')) {
    return NextResponse.redirect(new URL('/voorraad', request.url), 308);
  }

  // /factuur-lezer was een hub-overzicht met 3 cards die naar bestaande pages
  // wezen — de echte scanner zit op /inkoop?tab=bonnen. In S3-deel-1 is de
  // scanner-tab top-tier gemaakt (multi-format, batch, drag-drop, paste,
  // camera). Redirect oude bookmarks rechtstreeks naar de bron.
  if (pathname.startsWith('/factuur-lezer')) {
    return NextResponse.redirect(new URL('/inkoop?tab=bonnen', request.url), 308);
  }

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
