import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

/**
 * Lettertypen voor de publieke offerte-portal.
 *
 * portal.css begon met een `@import url('https://fonts.googleapis.com/...')`
 * voor Geist + Geist Mono. Zo'n import in een stylesheet is blokkerend: de
 * browser haalt eerst fonts.googleapis.com op en dán fonts.gstatic.com,
 * vóórdat de klant iets van de offerte ziet. Juist op deze pagina — de enige
 * die je klanten te zien krijgen — telt dat eerste beeld het zwaarst.
 *
 * next/font haalt de bestanden bij de build op en serveert ze van ons eigen
 * domein. portal.css gebruikt nu de variabelen die hieronder gezet worden.
 */
const geist = Geist({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-geist',
  display: 'swap',
});
const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export default function QuotePortalLayout({ children }: { children: ReactNode }) {
  return <div className={geist.variable + ' ' + geistMono.variable}>{children}</div>;
}
