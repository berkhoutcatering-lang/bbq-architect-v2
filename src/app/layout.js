import './globals.css';
import Script from 'next/script';
import Sidebar from '@/components/Sidebar';
import ToastProvider from '@/components/Toast';
import ConfirmProvider from '@/components/ConfirmDialog';

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
      </head>
      <body>
        <ToastProvider>
          <ConfirmProvider>
            <div className="app-layout">
              <Sidebar />
              <main className="main-area">
                <div className="main-content">
                  {children}
                </div>
              </main>
            </div>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
