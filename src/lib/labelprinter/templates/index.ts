/**
 * Labeltemplates. Elke template heeft een code en een versie; die twee staan
 * op elke printjob, zodat een herprint van volgend jaar nog weet welke opmaak
 * op de zak zat. Verander je een template inhoudelijk, dan hoog je `versie` op.
 *
 * Een template rendert naar ZPL en geeft waarschuwingen terug (bv. "naam
 * paste niet op twee regels"). Waarschuwingen blokkeren niet — het label wordt
 * geprint — maar ze komen wél op de printjob en in de UI.
 */

import type { LabelFormaat } from '../types';
import { formaatInDots } from '../zpl';

export interface RenderResultaat {
    zpl: string;
    waarschuwingen: string[];
}

export interface LabelTemplate<D> {
    code: string;
    versie: number;
    naam: string;
    /** Kleinste label waarop deze template leesbaar is. */
    minFormaat: { breedte_mm: number; hoogte_mm: number };
    render(data: D, formaat: LabelFormaat): RenderResultaat;
}

/** "16-09-2026" uit "2026-09-16". Geen tijdzone: een DATE heeft geen tijd. */
export function datumKort(iso: string | null | undefined): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * Schaal ten opzichte van het 60 × 40 mm-label: alle posities in een template
 * staan in "dots op 60×40 @ 203 dpi" en worden hiermee naar het echte formaat
 * gebracht. Een groter label krijgt dus grotere letters, niet meer witruimte.
 */
export interface Schaal {
    breedte: number;
    hoogte: number;
    s: number;       // uniforme schaal (min van x/y) — voor letterhoogtes
    x(v: number): number;
    y(v: number): number;
    h(v: number): number;
}

export function schaalVoor(formaat: LabelFormaat): Schaal {
    const dots = formaatInDots(formaat);
    const sx = dots.breedte / 480;
    const sy = dots.hoogte / 320;
    const s = Math.min(sx, sy);
    return {
        breedte: dots.breedte,
        hoogte: dots.hoogte,
        s,
        x: (v) => Math.round(v * sx),
        y: (v) => Math.round(v * sy),
        h: (v) => Math.max(10, Math.round(v * s)),
    };
}

export function pastOp<D>(template: LabelTemplate<D>, formaat: LabelFormaat): boolean {
    return formaat.breedte_mm >= template.minFormaat.breedte_mm && formaat.hoogte_mm >= template.minFormaat.hoogte_mm;
}
