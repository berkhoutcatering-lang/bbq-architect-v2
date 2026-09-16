/**
 * Los label — "Suiker" op een doos, "Ui gesneden 16-09" op een bak.
 *
 * Bewust simpel en bewust los van voorraad: geen QR, geen partij, geen
 * hoeveelheid die ergens meetelt. Wat erop staat wordt wel bewaard op de
 * printjob (`label_data`), zodat je later nog ziet wat er geprint is.
 */

import type { LabelFormaat } from '../types';
import { label, lijn, pasTekst, tekst } from '../zpl';
import { datumKort, schaalVoor, type LabelTemplate, type RenderResultaat } from './index';

export interface LosLabelData {
    naam: string;
    datum: string;                 // ISO, meestal vandaag
    tht: string | null;            // ISO
    notitie: string | null;
    /** Wie het label maakte — alleen als bekend, nooit "onbekend" printen. */
    wie: string | null;
}

export const loslabel: LabelTemplate<LosLabelData> = {
    code: 'los',
    versie: 1,
    naam: 'Los label',
    minFormaat: { breedte_mm: 50, hoogte_mm: 25 },

    render(d: LosLabelData, formaat: LabelFormaat): RenderResultaat {
        const w: string[] = [];
        const sc = schaalVoor(formaat);
        const marge = sc.x(16);
        const breed = sc.breedte - marge * 2;
        const velden: string[] = [];

        const naam = d.naam.trim();
        const pas = pasTekst(naam, breed, sc.h(72), sc.h(28));
        if (!pas.past) w.push(`"${d.naam}" past niet op het label, ook niet op twee regels`);
        velden.push(tekst({ x: marge, y: sc.y(16), hoogte: pas.hoogte, breedte: breed, regels: pas.regels, uitlijning: 'L', tekst: naam }));
        let y = sc.y(16) + pas.hoogte * pas.regels + sc.y(12);

        velden.push(lijn(marge, y, breed, 2));
        y += sc.y(10);

        const regels: string[] = [];
        const datum = datumKort(d.datum);
        if (datum) regels.push(datum);
        const tht = datumKort(d.tht);
        if (tht) regels.push(`THT ${tht}`);
        velden.push(tekst({ x: marge, y, hoogte: sc.h(30), tekst: regels.join('   ') }));
        y += sc.h(30) + sc.y(8);

        if (d.notitie && d.notitie.trim()) {
            const n = d.notitie.trim();
            const pasN = pasTekst(n, breed, sc.h(24), sc.h(16), true);
            if (!pasN.past) w.push('Notitie past niet volledig op het label');
            velden.push(tekst({ x: marge, y, hoogte: pasN.hoogte, breedte: breed, regels: pasN.regels, tekst: n }));
            y += pasN.hoogte * pasN.regels + sc.y(6);
        }

        if (d.wie && d.wie.trim()) {
            velden.push(tekst({ x: marge, y: sc.hoogte - sc.h(18) - sc.y(8), hoogte: sc.h(18), tekst: d.wie.trim() }));
        }

        if (y > sc.hoogte - sc.y(4)) w.push('Label loopt over de onderrand');

        return { zpl: label({ breedte: sc.breedte, hoogte: sc.hoogte }, velden), waarschuwingen: w };
    },
};
