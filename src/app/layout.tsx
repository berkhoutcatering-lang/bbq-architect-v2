import './globals.css';
import React from 'react';
import { AuthProvider } from "@/lib/AuthContext";
import { OrgProvider } from "@/lib/OrgContext";
import ToastProvider from "@/components/Toast";
import ConfirmProvider from "@/components/ConfirmDialog";
import GlobalToast from "@/components/GlobalToast";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import AppShell from "@/components/AppShell";
import ThemeProvider from "@/components/ThemeProvider";

import type { Viewport } from 'next';

export const metadata = {
  title: 'BBQ Architect — Hop & Bites',
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
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
              </ConfirmProvider>
            </ToastProvider>
          </OrgProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
