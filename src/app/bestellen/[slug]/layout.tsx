/**
 * Lettertypen voor de bestelstroom, alleen op deze route geladen.
 *
 * Cinzel is de letter uit het logo en Archivo de lopende tekst; die twee zijn
 * nergens anders in de app nodig, dus ze horen niet in de root-layout waar elke
 * pagina ze zou meesjouwen. IBM Plex Mono komt wél uit de root-layout — die
 * staat daar al als --font-ibm-plex-mono.
 *
 * De bestanden staan in public/fonts/web/ en komen van ons eigen domein, dus
 * geen bezoek aan fonts.googleapis.com voordat er iets op het scherm staat. Zie
 * app/layout.tsx voor waarom de hoofdletters en een regel per gewicht.
 */

import localFont from 'next/font/local';

const Cinzel = localFont({
    src: [
        { path: '../../../../public/fonts/web/cinzel.woff2', weight: '400', style: 'normal' },
        { path: '../../../../public/fonts/web/cinzel.woff2', weight: '500', style: 'normal' },
        { path: '../../../../public/fonts/web/cinzel.woff2', weight: '600', style: 'normal' },
        { path: '../../../../public/fonts/web/cinzel.woff2', weight: '700', style: 'normal' },
    ],
    variable: '--font-cinzel',
    display: 'swap',
    adjustFontFallback: 'Times New Roman',
});

const Archivo = localFont({
    src: [
        { path: '../../../../public/fonts/web/archivo.woff2', weight: '400', style: 'normal' },
        { path: '../../../../public/fonts/web/archivo.woff2', weight: '500', style: 'normal' },
        { path: '../../../../public/fonts/web/archivo.woff2', weight: '600', style: 'normal' },
        { path: '../../../../public/fonts/web/archivo.woff2', weight: '700', style: 'normal' },
    ],
    variable: '--font-archivo',
    display: 'swap',
});

export const metadata = {
    title: 'Bestellen — De Eettocht',
};

export default function BestellenLayout({ children }: { children: React.ReactNode }) {
    return <div className={`${Cinzel.variable} ${Archivo.variable}`}>{children}</div>;
}
