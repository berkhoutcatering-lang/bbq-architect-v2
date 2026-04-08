import './globals.css';
import React from 'react';
import Script from "next/script";
import Sidebar from "@/components/Sidebar";
import AiAssistant from "@/components/AiAssistant";
import ToastProvider from "@/components/Toast";
import ConfirmProvider from "@/components/ConfirmDialog";
import { AppProvider } from "@/lib/AppContext";
import GlobalToast from "@/components/GlobalToast";
import Breadcrumbs from "@/components/Breadcrumbs";
import CommandPalette from "@/components/CommandPalette";
import OnboardingWizard from "@/components/OnboardingWizard";
import BottomNav from "@/components/BottomNav";

export const metadata = {
  title: 'BBQ Architect — Hop & Bites',
  description: 'Beheer je BBQ catering events, recepten, facturen en meer.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
        <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
        <script dangerouslySetInnerHTML={{ __html: `tailwind.config = { corePlugins: { preflight: false } };` }} />
      </head>
      <body>
        <AppProvider>
          <ToastProvider>
            <ConfirmProvider>
              <a href="#main-content" className="sr-only">
                Ga naar hoofdinhoud
              </a>
              <div className="flex min-h-screen bg-[var(--bg)]">
                <Sidebar />
                <main className="flex-1 flex flex-col min-h-screen relative overflow-hidden" role="main">
                  <Breadcrumbs />
                  <div id="main-content" className="flex-1 w-full">
                    {children}
                  </div>
                </main>
                <AiAssistant />
              </div>
              <BottomNav />
              <GlobalToast />
              <CommandPalette />
              <OnboardingWizard />
            </ConfirmProvider>
          </ToastProvider>
        </AppProvider>
      </body>
    </html>
  );
}
