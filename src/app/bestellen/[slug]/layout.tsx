/**
 * Lettertypen voor de bestelstroom, alleen op deze route geladen.
 *
 * Cinzel is de letter uit het logo en Archivo de lopende tekst; die twee zijn
 * nergens anders in de app nodig, dus ze horen niet in de root-layout waar elke
 * pagina ze zou meesjouwen. IBM Plex Mono komt wél uit de root-layout — die
 * staat daar al als --font-ibm-plex-mono.
 *
 * next/font haalt de bestanden bij de build op en serveert ze vanaf ons eigen
 * domein, dus geen bezoek aan fonts.googleapis.com voordat er iets op het
 * scherm staat.
 */

import { Cinzel, Archivo } from 'next/font/google';

const cinzel = Cinzel({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    variable: '--font-cinzel',
    display: 'swap',
});

const archivo = Archivo({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    variable: '--font-archivo',
    display: 'swap',
});

export const metadata = {
    title: 'Bestellen — De Eettocht',
};

export default function BestellenLayout({ children }: { children: React.ReactNode }) {
    return <div className={`${cinzel.variable} ${archivo.variable}`}>{children}</div>;
}
