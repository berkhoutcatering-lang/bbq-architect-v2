'use client';

/**
 * Een getekend canvas (doossticker, HACCP-sticker) als ZPL-afbeelding.
 *
 * De bestaande canvas-stickers blijven zoals ze zijn — ze zijn ontworpen
 * met de regels voor thermisch printen (lijnen en letters, geen vlakken).
 * Hier wordt zo'n canvas 1-bit gemaakt en als ^GFA in één ^XA…^XZ-blok
 * gezet, passend op het label van de gekozen printer. Zo hoeft er geen
 * tweede ontwerp in ZPL te bestaan.
 *
 * Browser-only (canvas). De server bewaart de ZPL op de job zoals bij
 * elke andere printopdracht.
 */

import type { LabelFormaat } from './types';
import { formaatInDots } from './zpl';

export interface AfbeeldingOpties {
    /** Grens voor zwart (0–255). Thermisch print is één bit: lager = meer zwart. */
    drempel?: number;
    /** Label van gestanste rol (default) of doorlopend materiaal. */
    doorlopend?: boolean;
}

/**
 * Tekent `bron` passend en gecentreerd op een wit vlak ter grootte van het
 * label en geeft het ZPL-blok terug.
 */
export function canvasNaarLabelZpl(bron: HTMLCanvasElement, formaat: LabelFormaat, opties: AfbeeldingOpties = {}): string {
    const dots = formaatInDots(formaat);
    const drempel = opties.drempel ?? 160;

    const doek = document.createElement('canvas');
    doek.width = dots.breedte;
    doek.height = dots.hoogte;
    const ctx = doek.getContext('2d');
    if (!ctx) throw new Error('Canvas niet beschikbaar');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, doek.width, doek.height);

    const schaal = Math.min(dots.breedte / bron.width, dots.hoogte / bron.height, 1);
    const w = Math.round(bron.width * schaal);
    const h = Math.round(bron.height * schaal);
    ctx.imageSmoothingEnabled = schaal < 1;
    ctx.drawImage(bron, Math.floor((dots.breedte - w) / 2), Math.floor((dots.hoogte - h) / 2), w, h);

    const beeld = ctx.getImageData(0, 0, doek.width, doek.height).data;
    const bytesPerRij = Math.ceil(doek.width / 8);
    const totaal = bytesPerRij * doek.height;
    const hex: string[] = new Array(totaal);
    let k = 0;
    for (let y = 0; y < doek.height; y++) {
        for (let bx = 0; bx < bytesPerRij; bx++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
                const x = bx * 8 + bit;
                if (x >= doek.width) continue;
                const i = (y * doek.width + x) * 4;
                /* Alpha meenemen: transparant = wit. */
                const a = beeld[i + 3] / 255;
                const lum = (0.299 * beeld[i] + 0.587 * beeld[i + 1] + 0.114 * beeld[i + 2]) * a + 255 * (1 - a);
                if (lum < drempel) byte |= 0x80 >> bit;
            }
            hex[k++] = byte.toString(16).padStart(2, '0').toUpperCase();
        }
    }

    const media = opties.doorlopend ? '^MNN' : '^MNY';
    return `^XA^PW${dots.breedte}^LL${dots.hoogte}^LH0,0${media}^FO0,0^GFA,${totaal},${totaal},${bytesPerRij},${hex.join('')}^FS^PQ1^XZ`;
}
