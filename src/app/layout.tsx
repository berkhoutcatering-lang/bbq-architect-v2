import './globals.css';
import { DM_Sans, Outfit, IBM_Plex_Mono, Playfair_Display, Oswald } from 'next/font/google';
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
 * next/font haalt de bestanden bij de build op en serveert ze vanaf ons eigen
 * domein, met `display: swap` zodat tekst meteen leesbaar is. Elke familie
 * levert een CSS-variabele die globals.css gebruikt.
 *
 * Inter stond er ook bij maar werd nergens gebruikt — die is vervallen.
 * De .ttf's in public/fonts/menukaart/ staan hier los van: die zijn voor de
 * menukaart-PDF's aan de serverkant (zie lib/menukaart/pdf-shared.ts).
 */
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});
const outfit = Outfit({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700'],
  variable: '--font-outfit',
  display: 'swap',
});
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-playfair',
  display: 'swap',
});
const oswald = Oswald({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-oswald',
  display: 'swap',
});

const fontVariables = [dmSans, outfit, ibmPlexMono, playfair, oswald]
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
