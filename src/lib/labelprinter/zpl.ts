/**
 * ZPL-bouwstenen. Puur: geen DOM, geen netwerk, geen printer.
 *
 * Drie regels die uit `boxLabel.ts` zijn overgenomen omdat ze daar al bewezen
 * zijn op een thermische printer:
 *
 *   1. Maten in millimeters en dpi, nooit in vaste dots. `mmNaarDots` is de
 *      enige plek waar omgerekend wordt.
 *   2. Lijnen en letters, geen gevulde vlakken (één bit per punt).
 *   3. Nooit afkappen. Een productnaam die niet past krimpt eerst, en gaat
 *      daarna over twee regels. Pas als dat ook niet past, wordt het gemeld.
 *
 * Tekstbreedte in ZPL is niet exact te meten zonder de printer; we werken met
 * een tabel van gemiddelde tekenbreedtes voor lettertype 0 (Zebra's
 * schaalbare "Swiss 721"). Die tabel is ruim genomen: liever een letter
 * kleiner dan een letter buiten het label.
 */

import { STATUS_OFFLINE, type PrinterStatus } from './types';

export interface Dots {
    breedte: number;
    hoogte: number;
}

export function mmNaarDots(mm: number, dpi: number): number {
    return Math.round((mm * dpi) / 25.4);
}

export function formaatInDots(f: { breedte_mm: number; hoogte_mm: number; dpi: number }): Dots {
    return { breedte: mmNaarDots(f.breedte_mm, f.dpi), hoogte: mmNaarDots(f.hoogte_mm, f.dpi) };
}

/**
 * `^`, `~` en `\` zijn stuurtekens in ZPL. Met `^FH\` mag je ze als hex
 * schrijven (`\5E`, `\7E`, `\5C`). Alle velden gaan door deze functie; de
 * printer krijgt dus nooit per ongeluk een commando uit een productnaam.
 * Nieuwe regels worden spaties: een regelovergang stuur je met ^FB, niet met
 * een teken in de tekst.
 */
export function zplEscape(tekst: string): string {
    return glyfenVeilig(tekst)
        .replace(/\\/g, '\\5C')
        .replace(/\^/g, '\\5E')
        .replace(/~/g, '\\7E')
        .replace(/[\r\n]+/g, ' ');
}

/* Tekens die het ingebouwde lettertype 0 niet kent, komen als een leeg vak
   uit de printer. Een bewaaradvies "≤ -18 °C" wordt dan "  -18 °C" — precies
   het soort stille fout dat op een zak in de vriezer niemand opvalt. Daarom
   vooraf vertalen naar woorden die er wél staan. */
const GLYFEN: Array<[RegExp, string]> = [
    [/≤\s*/g, 'max. '],
    [/≥\s*/g, 'min. '],
    [/≈\s*/g, 'ca. '],
    [/[\u2013\u2014]/g, '-'],
    [/[\u2018\u2019]/g, "'"],
    [/[\u201C\u201D]/g, '"'],
    [/\u2026/g, '...'],
];

export function glyfenVeilig(tekst: string): string {
    let uit = tekst;
    for (const [re, naar] of GLYFEN) uit = uit.replace(re, naar);
    return uit;
}

/* Gemiddelde tekenbreedte als fractie van de letterhoogte voor lettertype 0.
   Gemeten ruim: hoofdletters en cijfers 0,64, kleine letters 0,52, smalle
   tekens 0,30, brede 0,88. Accenten (é, ø, ß) tellen als hun basisletter. */
const SMAL = new Set(['i', 'l', 'j', 't', 'f', 'r', 'I', '.', ',', ':', ';', "'", '!', '|', ' ', '(', ')', '-']);
const BREED = new Set(['m', 'w', 'M', 'W', '@', '%']);

export function tekenBreedte(teken: string, hoogte: number): number {
    if (SMAL.has(teken)) return hoogte * 0.30;
    if (BREED.has(teken)) return hoogte * 0.88;
    if (/[A-Z0-9À-ÖØ-Þ]/.test(teken)) return hoogte * 0.64;
    return hoogte * 0.52;
}

export function tekstBreedte(tekst: string, hoogte: number): number {
    let som = 0;
    for (const teken of tekst) som += tekenBreedte(teken, hoogte);
    return Math.ceil(som);
}

export interface PasResultaat {
    hoogte: number;
    regels: 1 | 2;
    past: boolean;
}

/**
 * Zoek de grootste letterhoogte waarop `tekst` in `breedte` past. Eerst op één
 * regel krimpen tot `minHoogte`, dan op twee regels (ZPL ^FB breekt zelf op
 * spaties) opnieuw vanaf `maxHoogte`. Past het op twee regels ook niet op de
 * kleinste maat, dan `past=false` — de aanroeper beslist (melden, nooit
 * stilletjes afkappen).
 */
export function pasTekst(tekst: string, breedte: number, maxHoogte: number, minHoogte: number, tweeRegels = true): PasResultaat {
    for (let h = maxHoogte; h >= minHoogte; h -= 2) {
        if (tekstBreedte(tekst, h) <= breedte) return { hoogte: h, regels: 1, past: true };
    }
    if (tweeRegels) {
        for (let h = maxHoogte; h >= minHoogte; h -= 2) {
            /* Twee regels: de langste helft na een spatiebreuk moet passen.
               Benadering: de helft van de totale breedte plus het langste woord. */
            const woorden = tekst.split(' ');
            const langsteWoord = Math.max(...woorden.map((w) => tekstBreedte(w, h)));
            const helft = Math.ceil(tekstBreedte(tekst, h) / 2);
            if (langsteWoord <= breedte && helft + tekstBreedte(' ', h) <= breedte) {
                return { hoogte: h, regels: 2, past: true };
            }
        }
    }
    return { hoogte: minHoogte, regels: tweeRegels ? 2 : 1, past: false };
}

/* ── Commando-bouwers ────────────────────────────────────────────────────── */

export interface TekstOpties {
    x: number;
    y: number;
    hoogte: number;
    /** Breedte van het tekstvak; met `regels` wordt het een ^FB-blok. */
    breedte?: number;
    regels?: number;
    uitlijning?: 'L' | 'C' | 'R';
    tekst: string;
}

/** Eén tekstveld in lettertype 0. Breedte van de letter = hoogte × 0,9 (leesbaar op 203 dpi). */
export function tekst(o: TekstOpties): string {
    const w = Math.round(o.hoogte * 0.9);
    const blok = o.breedte != null
        ? `^FB${o.breedte},${o.regels ?? 1},0,${o.uitlijning ?? 'L'},0`
        : '';
    return `^FO${o.x},${o.y}^A0N,${o.hoogte},${w}${blok}^FH\\^FD${zplEscape(o.tekst)}^FS`;
}

/** Horizontale lijn van `dikte` dots. */
export function lijn(x: number, y: number, breedte: number, dikte = 2): string {
    return `^FO${x},${y}^GB${breedte},${dikte},${dikte}^FS`;
}

/** Kader (alleen rand, geen vulling — regel 2). */
export function kader(x: number, y: number, breedte: number, hoogte: number, dikte = 2): string {
    return `^FO${x},${y}^GB${breedte},${hoogte},${dikte}^FS`;
}

/**
 * QR-code. `vergroting` = dots per module (2–10). Foutcorrectie M is de
 * middenweg voor een label dat nat en koud wordt: meer zou de code groter
 * maken dan het label toelaat. De inhoud is een URL of token, nooit de
 * volledige data — het systeem lost de code op.
 */
export function qr(x: number, y: number, inhoud: string, vergroting: number): string {
    const v = Math.max(2, Math.min(10, Math.round(vergroting)));
    return `^FO${x},${y}^BQN,2,${v}^FH\\^FDMA,${zplEscape(inhoud)}^FS`;
}

/**
 * Schat de zijde (in dots) van een QR-code voor `inhoud` bij `vergroting`.
 * Versie uit de lengte (alfanumeriek/bytes, foutcorrectie M): grof maar ruim.
 */
export function qrZijde(inhoud: string, vergroting: number): number {
    const n = inhoud.length;
    const versie = n <= 14 ? 1 : n <= 26 ? 2 : n <= 42 ? 3 : n <= 62 ? 4 : n <= 84 ? 5 : n <= 106 ? 6 : n <= 122 ? 7 : 8;
    const modules = 17 + versie * 4;
    return modules * vergroting;
}

/** Kies de grootste vergroting waarbij de QR in `maxZijde` dots past (min 2). */
export function qrVergrotingVoor(inhoud: string, maxZijde: number): number {
    for (let v = 8; v >= 2; v--) if (qrZijde(inhoud, v) <= maxZijde) return v;
    return 2;
}

/**
 * Eén label = één ^XA…^XZ-blok. ^CI28 zet UTF-8 aan (accenten), ^PW/^LL de
 * maat, ^LH de oorsprong, ^PQ1 precies één exemplaar. Kopieën maken we nooit
 * met ^PQn: elk label heeft eigen inhoud (unit 007/012).
 */
export function label(dots: Dots, velden: string[], opties: { doorlopend?: boolean } = {}): string {
    /* ^MNY = gestanste labels met tussenruimte (de sensor zoekt de gap);
       ^MNN = doorlopend materiaal, dan bepaalt ^LL de lengte. */
    const media = opties.doorlopend ? '^MNN' : '^MNY';
    return `^XA^CI28^PW${dots.breedte}^LL${dots.hoogte}^LH0,0${media}${velden.join('')}^PQ1^XZ`;
}

/** Meerdere labels als één stroom naar de printer. */
export function stroom(labels: string[]): string {
    return labels.join('\n');
}

/* ── Status (~HQES) ──────────────────────────────────────────────────────── */

/**
 * `~HQES` geeft iets als:
 *
 *   PRINTER STATUS
 *    ERRORS:         1 00000000 00000005
 *    WARNINGS:       0 00000000 00000000
 *
 * De laatste 8 hex-tekens van ERRORS: bit 0 = papier op, bit 2 = klep open,
 * bit 3 = snijder, bit 4/5/7 = temperatuur/printkop. Bij WARNINGS zit in bit
 * 0 "kalibreren nodig" en in bit 3 "pauze". Alleen wat we zeker weten wordt
 * vertaald; de rest blijft in `ruw`.
 */
export function parseHqes(antwoord: string): PrinterStatus {
    const fouten = /ERRORS:\s*(\d)\s+([0-9A-Fa-f]{8})\s+([0-9A-Fa-f]{8})/.exec(antwoord);
    const waarsch = /WARNINGS:\s*(\d)\s+([0-9A-Fa-f]{8})\s+([0-9A-Fa-f]{8})/.exec(antwoord);
    if (!fouten) return { ...STATUS_OFFLINE, ruw: antwoord, omschrijving: 'Onbegrijpelijk statusantwoord' };

    const foutVlag = fouten[1] === '1';
    const foutBits = parseInt(fouten[3], 16);
    const waarschVlag = waarsch ? waarsch[1] === '1' : false;
    const waarschBits = waarsch ? parseInt(waarsch[3], 16) : 0;

    const papierOp = (foutBits & 0x1) !== 0;
    const klepOpen = (foutBits & 0x4) !== 0;
    const pauze = (waarschBits & 0x8) !== 0;

    let omschrijving = 'Gereed';
    if (papierOp) omschrijving = 'Labels op';
    else if (klepOpen) omschrijving = 'Klep open';
    else if (foutVlag) omschrijving = 'Printer meldt een fout';
    else if (pauze) omschrijving = 'Printer staat op pauze';
    else if (waarschVlag) omschrijving = 'Gereed (waarschuwing)';

    return { online: true, papierOp, klepOpen, pauze, fout: foutVlag, waarschuwing: waarschVlag, omschrijving, ruw: antwoord };
}

export const HQES = '~HQES';
