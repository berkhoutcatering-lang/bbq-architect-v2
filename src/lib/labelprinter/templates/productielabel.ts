/**
 * Intern productielabel — op elke zak, bak of pot uit een productiepartij.
 *
 *   PULLED PORK                 ┌────────┐
 *   1,00 kg                     │  QR    │
 *   Gemaakt  16-09-2026         │        │
 *   THT      30-09-2026         └────────┘
 *   Batch PP-20260916-01 · 007/012
 *   Bewaren: ≤ -18 °C
 *   Allergenen: gluten, soja
 *
 * Alles komt uit de partij (fase 1); de template verzint niets. Ontbreekt een
 * regel (geen THT, geen bewaaradvies), dan valt die regel weg — nooit een
 * lege of geraden waarde.
 */

import type { LabelFormaat } from '../types';
import { label, lijn, pasTekst, qr, qrVergrotingVoor, qrZijde, tekst } from '../zpl';
import { datumKort, schaalVoor, type LabelTemplate, type RenderResultaat } from './index';

export interface ProductielabelData {
    naam: string;
    /** Al opgemaakt, bv. "1,00 kg" — de template rekent niet met eenheden. */
    inhoud: string;
    productiedatum: string;          // ISO
    tht: string | null;              // ISO
    partijnummer: string;
    unitNr: number;
    unitTotaal: number;
    /** Letterlijke tekst van het component, bv. "≤ -18 °C". */
    bewaaradvies: string | null;
    allergenen: string[];
    /** Volledige URL die het systeem oplost naar deze eenheid. */
    qrUrl: string;
    /** Unieke code van de eenheid, bv. PP-20260916-01-007. */
    eenheidCode: string;
}

export function unitTekst(nr: number, totaal: number): string {
    const b = String(totaal).length;
    return `${String(nr).padStart(b, '0')}/${String(totaal).padStart(b, '0')}`;
}

export const productielabel: LabelTemplate<ProductielabelData> = {
    code: 'productie',
    versie: 1,
    naam: 'Productielabel (intern)',
    minFormaat: { breedte_mm: 50, hoogte_mm: 30 },

    render(d: ProductielabelData, formaat: LabelFormaat): RenderResultaat {
        const w = [] as string[];
        const sc = schaalVoor(formaat);
        const velden: string[] = [];
        const marge = sc.x(14);

        /* QR rechts; zo groot als het vak toelaat. */
        const qrVak = sc.x(150);
        const verg = qrVergrotingVoor(d.qrUrl, qrVak);
        const qrZ = qrZijde(d.qrUrl, verg);
        const qrX = sc.breedte - marge - qrZ;
        const qrY = sc.y(12);
        velden.push(qr(qrX, qrY, d.qrUrl, verg));

        /* Tekstkolom links van de QR. */
        const kolom = qrX - marge * 2;

        /* Naam: groot, krimpt, dan twee regels, nooit afgekapt. */
        const naam = d.naam.trim().toUpperCase();
        const pas = pasTekst(naam, kolom, sc.h(44), sc.h(22));
        if (!pas.past) w.push(`Naam "${d.naam}" past niet op het label, ook niet op twee regels`);
        velden.push(tekst({ x: marge, y: sc.y(10), hoogte: pas.hoogte, breedte: kolom, regels: pas.regels, tekst: naam }));
        let y = sc.y(10) + pas.hoogte * pas.regels + sc.y(8);

        velden.push(tekst({ x: marge, y, hoogte: sc.h(36), tekst: d.inhoud }));
        y += sc.h(36) + sc.y(10);

        const gemaakt = datumKort(d.productiedatum);
        if (gemaakt) {
            velden.push(tekst({ x: marge, y, hoogte: sc.h(22), tekst: `Gemaakt ${gemaakt}` }));
            y += sc.h(22) + sc.y(4);
        }
        const tht = datumKort(d.tht);
        if (tht) {
            velden.push(tekst({ x: marge, y, hoogte: sc.h(28), tekst: `THT ${tht}` }));
            y += sc.h(28) + sc.y(6);
        }

        /* Onder de QR loopt de tekst over de volle breedte. */
        const ondergrens = Math.max(y, qrY + qrZ + sc.y(8));
        y = ondergrens;
        velden.push(lijn(marge, y, sc.breedte - marge * 2, 2));
        y += sc.y(6);

        const batch = `Batch ${d.partijnummer} · ${unitTekst(d.unitNr, d.unitTotaal)}`;
        const pasB = pasTekst(batch, sc.breedte - marge * 2, sc.h(22), sc.h(16), false);
        velden.push(tekst({ x: marge, y, hoogte: pasB.hoogte, tekst: batch }));
        y += pasB.hoogte + sc.y(4);

        if (d.bewaaradvies && d.bewaaradvies.trim()) {
            const bew = `Bewaren: ${d.bewaaradvies.trim()}`;
            const pasW = pasTekst(bew, sc.breedte - marge * 2, sc.h(22), sc.h(16), false);
            velden.push(tekst({ x: marge, y, hoogte: pasW.hoogte, tekst: bew }));
            y += pasW.hoogte + sc.y(4);
        }

        if (d.allergenen.length > 0) {
            const al = `Allergenen: ${d.allergenen.join(', ')}`;
            const pasA = pasTekst(al, sc.breedte - marge * 2, sc.h(20), sc.h(14), true);
            if (!pasA.past) w.push('Allergenenregel past niet volledig op het label');
            velden.push(tekst({ x: marge, y, hoogte: pasA.hoogte, breedte: sc.breedte - marge * 2, regels: pasA.regels, tekst: al }));
            y += pasA.hoogte * pasA.regels;
        }

        if (y > sc.hoogte - sc.y(4)) w.push('Label loopt over de onderrand; kies een groter label of minder regels');

        return { zpl: label({ breedte: sc.breedte, hoogte: sc.hoogte }, velden), waarschuwingen: w };
    },
};
