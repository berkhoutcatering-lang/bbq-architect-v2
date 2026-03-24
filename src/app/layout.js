import './globals.css';
import { Inter } from "next/font/google";
import Script from "next/script";
import Sidebar from "@/components/Sidebar";
import AiAssistant from "@/components/AiAssistant";

import ToastProvider from "@/components/Toast";
import ConfirmProvider from "@/components/ConfirmDialog";

export const metadata = {
  title: 'BBQ Architect — Hop & Bites',
  description: 'Beheer je BBQ catering events, recepten, facturen en meer.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
        <Script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js" strategy="beforeInteractive" />
        <Script src="https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js" strategy="beforeInteractive" />
        <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
        <script dangerouslySetInnerHTML={{ __html: `tailwind.config = { corePlugins: { preflight: false } };` }} />
      </head>
      <body>
        <ToastProvider>
          <ConfirmProvider>
            <div className="flex min-h-screen bg-[#08080a]">
              <Sidebar />
              <main className="ml-[260px] flex-1 flex flex-col min-h-screen relative overflow-hidden">
                <div className="flex-1 w-full">
                  {children}
                </div>
              </main>
              <AiAssistant />
            </div>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
