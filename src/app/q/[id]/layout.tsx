import localFont from 'next/font/local';
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
 * De bestanden staan in public/fonts/web/ en komen van ons eigen domein.
 * portal.css gebruikt de variabelen die hieronder gezet worden. Zie
 * app/layout.tsx voor waarom de hoofdletter en een regel per gewicht.
 */
const Geist = localFont({
  src: [
    { path: '../../../../public/fonts/web/geist.woff2', weight: '300', style: 'normal' },
    { path: '../../../../public/fonts/web/geist.woff2', weight: '400', style: 'normal' },
    { path: '../../../../public/fonts/web/geist.woff2', weight: '500', style: 'normal' },
    { path: '../../../../public/fonts/web/geist.woff2', weight: '600', style: 'normal' },
    { path: '../../../../public/fonts/web/geist.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-geist',
  display: 'swap',
});
const geistMono = localFont({
  src: [
    { path: '../../../../public/fonts/web/geist-mono.woff2', weight: '400', style: 'normal' },
    { path: '../../../../public/fonts/web/geist-mono.woff2', weight: '500', style: 'normal' },
    { path: '../../../../public/fonts/web/geist-mono.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-geist-mono',
  display: 'swap',
});

export default function QuotePortalLayout({ children }: { children: ReactNode }) {
  return <div className={Geist.variable + ' ' + geistMono.variable}>{children}</div>;
}
