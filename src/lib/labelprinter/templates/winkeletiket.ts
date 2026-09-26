/**
 * Winkel-etiket — op elk pakket en elke schaal van een webshop-order
 * (Sinterklaas 2026, blok S7).
 *
 *   ★ SINTERKLAAS                          ┌────────┐
 *   JAN JANSEN                             │  QR    │
 *   HB-2026-0042 · 2/3                     │        │
 *   Bierpakket € 35                        └────────┘
 *   vr 4 dec · 16:00–18:00
 *   ──────────────────────────────────────────────
 *   18+ · reeds betaald € 2,50 · rest € 32,50
 *
 * Alles komt uit de order; de template verzint niets. Zonder QR-basis-URL in
 * de instellingen valt de QR weg. De labelmaat komt van de printer
 * (/instellingen/printers) — daarmee is het formaat configureerbaar.
 */

import type { LabelFormaat } from '../types';
import { label, lijn, pasTekst, qr, qrVergrotingVoor, qrZijde, tekst } from '../zpl';
import { schaalVoor, type LabelTemplate, type RenderResultaat } from './index';
import type { WinkelEtiketData } from '@/lib/winkel/productie';

export const winkeletiket: LabelTemplate<WinkelEtiketData> = {
    code: 'winkel',
    versie: 1,
    naam: 'Winkel-etiket (pakket / schaal)',
    minFormaat: { breedte_mm: 50, hoogte_mm: 30 },

    render(d: WinkelEtiketData, formaat: LabelFormaat): RenderResultaat {
        const w: string[] = [];
        const sc = schaalVoor(formaat);
        const velden: string[] = [];
        const marge = sc.x(14);
        const breed = sc.breedte - marge * 2;

        /* QR rechts, als er een URL is. */
        let kolom = breed;
        let qrOnder = 0;
        if (d.qrUrl) {
            const qrVak = sc.x(140);
            const verg = qrVergrotingVoor(d.qrUrl, qrVak);
            const qrZ = qrZijde(d.qrUrl, verg);
            const qrX = sc.breedte - marge - qrZ;
            velden.push(qr(qrX, sc.y(10), d.qrUrl, verg));
            kolom = qrX - marge * 2;
            qrOnder = sc.y(10) + qrZ;
        }

        /* Sinterklaas-opmaak: een kleine kop, het feest zit in de sticker. */
        let y = sc.y(8);
        velden.push(tekst({ x: marge, y, hoogte: sc.h(18), tekst: '* SINTERKLAAS *' }));
        y += sc.h(18) + sc.y(6);

        /* Klantnaam: groot, krimpt, twee regels, nooit afgekapt. */
        const naam = d.klantnaam.trim().toUpperCase();
        const pas = pasTekst(naam, kolom, sc.h(40), sc.h(22));
        if (!pas.past) w.push(`Naam "${d.klantnaam}" past niet op het label, ook niet op twee regels`);
        velden.push(tekst({ x: marge, y, hoogte: pas.hoogte, breedte: kolom, regels: pas.regels, tekst: naam }));
        y += pas.hoogte * pas.regels + sc.y(6);

        velden.push(tekst({ x: marge, y, hoogte: sc.h(26), tekst: `${d.ordernummer} · ${d.volgnr}` }));
        y += sc.h(26) + sc.y(6);

        const art = pasTekst(d.artikel, kolom, sc.h(26), sc.h(16));
        if (!art.past) w.push('Artikelnaam past niet volledig op het label');
        velden.push(tekst({ x: marge, y, hoogte: art.hoogte, breedte: kolom, regels: art.regels, tekst: d.artikel }));
        y += art.hoogte * art.regels + sc.y(4);

        if (d.moment) {
            velden.push(tekst({ x: marge, y, hoogte: sc.h(22), tekst: d.moment }));
            y += sc.h(22) + sc.y(6);
        }

        /* Onder de QR loopt de tekst over de volle breedte. */
        y = Math.max(y, qrOnder + sc.y(6));
        const voet: string[] = [];
        if (d.alcohol) voet.push('18+');
        if (d.rest) voet.push(d.rest);
        if (voet.length) {
            velden.push(lijn(marge, y, breed, 2));
            y += sc.y(6);
            const v = voet.join(' · ');
            const pasV = pasTekst(v, breed, sc.h(24), sc.h(16), false);
            velden.push(tekst({ x: marge, y, hoogte: pasV.hoogte, tekst: v }));
            y += pasV.hoogte;
        }

        if (y > sc.hoogte - sc.y(4)) w.push('Label loopt over de onderrand; kies een groter label');

        return { zpl: label({ breedte: sc.breedte, hoogte: sc.hoogte }, velden), waarschuwingen: w };
    },
};
