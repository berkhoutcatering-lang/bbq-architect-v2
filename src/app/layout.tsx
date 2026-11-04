import './globals.css';
import localFont from 'next/font/local';
import React from 'react';
import { cookies } from 'next/headers';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { AuthProvider } from "@/lib/AuthContext";
import { OrgProvider } from "@/lib/OrgContext";
import ToastProvider from "@/components/Toast";
import ConfirmProvider from "@/components/ConfirmDialog";
import GlobalToast from "@/components/GlobalToast";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import InstallPrompt from "@/components/InstallPrompt";
import AppShell from "@/components/AppShell";
import ThemeProvider from "@/components/ThemeProvider";
import { THEMES, DEFAULT_PRESET_ID } from "@/lib/themes";
import { themeCssVarsBlock } from "@/lib/themeTokens";

import type { Viewport } from 'next';

/**
 * Lettertypen via next/font in plaats van vijf @import-regels bovenaan
 * globals.css. Die imports lieten de browser eerst fonts.googleapis.com en
 * daarna fonts.gstatic.com bevragen vóórdat er íets op het scherm kwam — een
 * geserialiseerde DNS + TLS + fetch vóór het eerste beeld.
 *
 * De bestanden staan in public/fonts/web/, niet via next/font/google: dat
 * haalde ze bij elke build bij Google op, en een los antwoord zonder
 * bestandsextensie liet de build willekeurig stuklopen (next.js #99114). Zo
 * hangt de build niet meer van Google af. Elke familie levert een CSS-variabele
 * die globals.css gebruikt, met `display: swap` zodat tekst meteen leesbaar is.
 *
 * De familienaam moet gelijk blijven aan de echte naam: tientallen schermen en
 * de menukaart-previews schrijven letterlijk `fontFamily: 'Outfit, sans-serif'`
 * en vallen anders stil terug op een systeemletter. De build neemt die naam van
 * de constante, dus `Outfit` en `Oswald` heten bewust met een hoofdletter — niet
 * hernoemen. Namen met een spatie kunnen dat niet; daarvoor staat er een tweede
 * `...Naam`-regel op hetzelfde bestand. Die alleen, zonder de eerste, kan niet:
 * dan wijst de CSS-variabele naar een familie die niet bestaat.
 *
 * Per gewicht een eigen regel, ook als het hetzelfde variabele bestand is: zo
 * blijven tussengewichten op het dichtstbijzijnde gewicht vallen, net als eerst.
 *
 * Inter stond er ook bij maar werd nergens gebruikt — die is vervallen.
 * De .ttf's in public/fonts/menukaart/ staan hier los van: die zijn voor de
 * menukaart-PDF's aan de serverkant (zie lib/menukaart/pdf-shared.ts).
 */
const dmSans = localFont({
  src: [
    { path: '../../public/fonts/web/dm-sans.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/web/dm-sans.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/web/dm-sans.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/web/dm-sans.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-dm-sans',
  display: 'swap',
});
const dmSansNaam = localFont({
  src: [
    { path: '../../public/fonts/web/dm-sans.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/web/dm-sans.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/web/dm-sans.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/web/dm-sans.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-dm-sans-naam',
  display: 'swap',
  declarations: [{ prop: 'font-family', value: "'DM Sans'" }],
});
const Outfit = localFont({
  src: [
    { path: '../../public/fonts/web/outfit.woff2', weight: '200', style: 'normal' },
    { path: '../../public/fonts/web/outfit.woff2', weight: '300', style: 'normal' },
    { path: '../../public/fonts/web/outfit.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/web/outfit.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/web/outfit.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/web/outfit.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-outfit',
  display: 'swap',
});
const ibmPlexMono = localFont({
  src: [
    { path: '../../public/fonts/web/ibm-plex-mono-400.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/web/ibm-plex-mono-500.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/web/ibm-plex-mono-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});
const ibmPlexMonoNaam = localFont({
  src: [
    { path: '../../public/fonts/web/ibm-plex-mono-400.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/web/ibm-plex-mono-500.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/web/ibm-plex-mono-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-ibm-plex-mono-naam',
  display: 'swap',
  declarations: [{ prop: 'font-family', value: "'IBM Plex Mono'" }],
});
const playfair = localFont({
  src: [
    { path: '../../public/fonts/web/playfair-display.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/web/playfair-display.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/web/playfair-display.woff2', weight: '700', style: 'normal' },
    { path: '../../public/fonts/web/playfair-display.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-playfair',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});
const playfairNaam = localFont({
  src: [
    { path: '../../public/fonts/web/playfair-display.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/web/playfair-display.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/web/playfair-display.woff2', weight: '700', style: 'normal' },
    { path: '../../public/fonts/web/playfair-display.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-playfair-naam',
  display: 'swap',
  declarations: [{ prop: 'font-family', value: "'Playfair Display'" }],
});
const Oswald = localFont({
  src: [
    { path: '../../public/fonts/web/oswald.woff2', weight: '300', style: 'normal' },
    { path: '../../public/fonts/web/oswald.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/web/oswald.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/web/oswald.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-oswald',
  display: 'swap',
});

const fontVariables = [dmSans, dmSansNaam, Outfit, ibmPlexMono, ibmPlexMonoNaam, playfair, playfairNaam, Oswald]
  .map(f => f.variable)
  .join(' ');

export const metadata = {
  title: 'BBQ Architect',
  description: 'Beheer je BBQ catering events, recepten, facturen en meer.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent' as const,
    title: 'BBQ Architect',
  },
};

export const viewport: Viewport = {
  themeColor: '#c4a35a', // Keep as hex — viewport meta requires static value
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Note: NO maximumScale or userScalable=false — pinch-zoom must work (WCAG 2.2 SC 1.4.4)
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the persisted preset id from cookie (written by ThemeProvider after
  // hydration) and inject the matching :root vars in <head>. This eliminates
  // the FOUC where /financien (and every other page) flashed the default
  // dark theme before ThemeProvider could overwrite it on mount.
  //
  // Tenants on custom hex (no exact preset match) get no cookie and fall
  // back to the default preset for first paint — ThemeProvider then writes
  // their real brand_* values on hydration. Brief flash, acceptable for v1.
  const cookieStore = await cookies();
  const presetId = cookieStore.get('theme-preset-id')?.value ?? DEFAULT_PRESET_ID;
  const preset = THEMES.find(t => t.id === presetId) ?? THEMES[0];
  const initialTheme = themeCssVarsBlock(preset);

  return (
    <html lang="nl" data-theme-mode={preset.mode} className={fontVariables} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: initialTheme }} />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
        {/* NuqsAdapter wrapt het hele tree zodat useQueryState() in client
            components werkt (URL-state-management voor o.a. /archief filters). */}
        <NuqsAdapter>
          <AuthProvider>
            <OrgProvider>
              <ToastProvider>
                <ConfirmProvider>
                  <ThemeProvider>
                    <AppShell>
                      {children}
                    </AppShell>
                  </ThemeProvider>
                  <GlobalToast />
                  <ServiceWorkerRegistrar />
                  <InstallPrompt />
                </ConfirmProvider>
              </ToastProvider>
            </OrgProvider>
          </AuthProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
