import './globals.css';
import React from 'react';
import { cookies } from 'next/headers';
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
    <html lang="nl" data-theme-mode={preset.mode} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: initialTheme }} />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
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
      </body>
    </html>
  );
}
