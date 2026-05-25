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
  // naar /voorraad linkte. Edit-flow zit in /voorraad. Bucket C (2026-05-25):
  // sidebar-link wijst nu direct naar /voorraad?context=menu (zie navigation.tsx).
  if (pathname.startsWith('/gerechten/ingredienten')) {
    return NextResponse.redirect(new URL('/voorraad?context=menu', request.url), 308);
  }

  // Bucket C (2026-05-25) — Menu & Recepten IA opschonen: 5 tabs → 3 (Gerechten /
  // Componenten / Analyse). De oude losse hubs zijn samengevoegd onder /analyse
  // met een view-toggle (?view=performance toont BCG-matrix, ?view=health toont
  // de insights-grid). Allergen-queue gaat via modal-flow op saveGerecht;
  // banner blijft als fallback. AI Bedenker + Pitmaster zijn modals.
  if (pathname === '/gerechten/menu-analyse' || pathname.startsWith('/gerechten/menu-analyse/')) {
    return NextResponse.redirect(new URL('/gerechten/analyse?view=performance', request.url), 308);
  }
  if (pathname === '/gerechten/insights' || pathname.startsWith('/gerechten/insights/')) {
    return NextResponse.redirect(new URL('/gerechten/analyse?view=health', request.url), 308);
  }
  if (pathname === '/gerechten/allergen-queue' || pathname.startsWith('/gerechten/allergen-queue/')) {
    return NextResponse.redirect(new URL('/gerechten?queue=allergens', request.url), 308);
  }
  if (pathname === '/gerechten/ai-pitmaster' || pathname.startsWith('/gerechten/ai-pitmaster/')) {
    return NextResponse.redirect(new URL('/gerechten?modal=pitmaster', request.url), 308);
  }
  if (pathname === '/bedenker' || pathname.startsWith('/bedenker/')) {
    return NextResponse.redirect(new URL('/gerechten?modal=bedenker', request.url), 308);
  }

  // /foto-archief was de oude "alle fotos" hub (gerecht-fotos + bonnen door
  // elkaar). In S3-deel-2 vervangen door /archief: dedicated boekhoud-
  // bonnenkistje met full-text search + filters + preview-modal.
  if (pathname.startsWith('/foto-archief')) {
    return NextResponse.redirect(new URL('/archief', request.url), 308);
  }

  // Skip public routes
  if (PUBLIC_ROUTES.some(function (route) { return pathname.startsWith(route); })) {
    return NextResponse.next();
  }

  // Skip /e2e-test/* paths wanneer NEXT_PUBLIC_E2E=1 — gebruikt door Playwright
  // visual-regression tests om templates renderen zonder auth/DB. De page-
  // handler zelf doet een tweede NEXT_PUBLIC_E2E-check + notFound() voor de
  // zekerheid; deze allow-list voorkomt alleen de redirect-naar-login.
  // (Folder heet `e2e-test` ipv `_test` want App Router negeert `_`-prefix
  // folders bij routing — private folder convention.)
  if (pathname.startsWith('/e2e-test/') && process.env.NEXT_PUBLIC_E2E === '1') {
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
