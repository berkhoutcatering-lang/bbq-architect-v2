import './globals.css';
import React from 'react';
import Script from "next/script";
import { AuthProvider } from "@/lib/AuthContext";
import { OrgProvider } from "@/lib/OrgContext";
import ToastProvider from "@/components/Toast";
import ConfirmProvider from "@/components/ConfirmDialog";
import GlobalToast from "@/components/GlobalToast";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import AppShell from "@/components/AppShell";

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
  themeColor: '#c4a35a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
        <script dangerouslySetInnerHTML={{ __html: `tailwind.config = { corePlugins: { preflight: false } };` }} />
      </head>
      <body>
        <AuthProvider>
          <OrgProvider>
            <ToastProvider>
              <ConfirmProvider>
                <AppShell>
                  {children}
                </AppShell>
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
