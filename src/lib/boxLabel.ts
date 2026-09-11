/**
 * De sticker onderop de doos — het rekenwerk, zonder canvas.
 * Plan: docs/bestelstroom-bouwplan.md §8.
 *
 * Alles hier is puur en meet niets zelf: de opmaakfuncties krijgen een
 * meetfunctie mee. Zo is het passend maken van een lange naam te testen zonder
 * browser, en dat is precies het stuk waar het misgaat als niemand kijkt.
 *
 * Twee regels lopen erdoorheen:
 *
 *   • **Nooit afkappen.** Een naam die niet past, krimpt en gaat daarna over
 *     meer regels. Afkappen betekent dat iemand bij het afhalen de verkeerde
 *     doos meeneemt.
 *
 *   • **Niet weten is niet hetzelfde als niets.** Een onderdeel zonder
 *     allergenenveld is onbekend en zegt dat; een leeg lijstje betekent "wij
 *     hebben gekeken en er zit niets in". Die twee door elkaar halen is het
 *     gevaarlijkste wat een allergenensticker kan doen.
 */

import { formatteerAfhaalmoment, houdbaarTot } from './bestelstroom';

export interface SnapshotOnderdeel {
    naam: string;
    bewaren?: string | null;
    allergenen?: string[] | null;
    houdbaarheid_dagen?: number | null;
    soort?: string | null;
    per?: string | null;
    aantal_per_persoon?: number | null;
}

export interface DoosSnapshot {
    gekoppeld_op?: string | null;
    stops?: Array<{ naam?: string | null }> | null;
    onderdelen?: SnapshotOnderdeel[] | null;
}

export interface StickerInvoer {
    naam: string;
    personen: number;
    dozen: number;
    /** YYYY-MM-DD */
    afhaaldatum: string;
    startTijd?: string | null;
    snapshot?: DoosSnapshot | null;
}

export interface StickerRegel {
    naam: string;
    /** YYYY-MM-DD, of null als de houdbaarheid onbekend is. */
    houdbaarTot: string | null;
    bewaren: string | null;
}

export interface StickerGegevens {
    naam: string;
    aantal: string;
    moment: string | null;
    onderdelen: StickerRegel[];
    allergenen: {
        /** Wat er zeker in zit, ontdubbeld en op alfabet. */
        lijst: string[];
        /** Onderdelen waarvan we het niet weten. Leeg is goed nieuws. */
        onbekendVoor: string[];
    };
    haltes: string[];
}

/**
 * Zet een bestelling plus haar snapshot om in wat er op de sticker komt.
 *
 * Ontbreekt de snapshot — de koppeling is nog niet gelukt — dan komt er een
 * sticker met naam, aantal en moment en verder niets. Geen lege kopjes waar
 * informatie hoort te staan.
 */
export function stickerGegevens(inv: StickerInvoer): StickerGegevens {
    const onderdelen = inv.snapshot?.onderdelen ?? [];

    const regels: StickerRegel[] = onderdelen.map((o) => ({
        naam: o.naam,
        houdbaarTot: houdbaarTot(inv.afhaaldatum, o.houdbaarheid_dagen),
        bewaren: o.bewaren ?? null,
    }));

    const zeker = new Set<string>();
    const onbekendVoor: string[] = [];
    for (const o of onderdelen) {
        /* Let op het verschil: `[]` is "gekeken, niets gevonden";
           `undefined`/`null` is "niet geleverd". */
        if (!Array.isArray(o.allergenen)) { onbekendVoor.push(o.naam); continue; }
        for (const a of o.allergenen) {
            const schoon = String(a).trim().toLowerCase();
            if (schoon) zeker.add(schoon);
        }
    }

    return {
        naam: inv.naam,
        aantal: `${inv.personen} ${inv.personen === 1 ? 'persoon' : 'personen'} · ${inv.dozen === 1 ? 'één doos' : `${inv.dozen} dozen`}`,
        moment: formatteerAfhaalmoment(inv.afhaaldatum, inv.startTijd),
        onderdelen: regels,
        allergenen: {
            lijst: Array.from(zeker).sort((a, b) => a.localeCompare(b, 'nl')),
            onbekendVoor,
        },
        haltes: (inv.snapshot?.stops ?? [])
            .map((s) => (s?.naam ?? '').trim())
            .filter(Boolean),
    };
}

/* ── Passend maken ────────────────────────────────────────────────────────── */

export interface PasOpties {
    /** Breedte van de sticker in dezelfde eenheid als `meet` teruggeeft. */
    maxBreedte: number;
    maxPt: number;
    minPt: number;
    /** Hoe breed is deze tekst op deze lettergrootte? Canvas of test. */
    meet: (tekst: string, pt: number) => number;
}

export interface PasResultaat {
    regels: string[];
    pt: number;
    /** Paste niet eens op de kleinste maat over meerdere regels. */
    krap: boolean;
}

/**
 * Maakt een naam passend: eerst krimpen, dan pas over meer regels. Kapt nooit
 * af — "Van der Meer-Hendriksen" moet leesbaar op de doos staan, want anders
 * pakt iemand de verkeerde.
 *
 * Breken mag op een spatie en ná een koppelteken; dat laatste is precies wat
 * dubbele achternamen nodig hebben.
 */
export function pasNaamIn(naam: string, o: PasOpties): PasResultaat {
    const schoon = (naam ?? '').trim().replace(/\s+/g, ' ');
    if (!schoon) return { regels: [], pt: o.maxPt, krap: false };

    /* Eén regel, zo groot mogelijk. */
    for (let pt = o.maxPt; pt >= o.minPt; pt--) {
        if (o.meet(schoon, pt) <= o.maxBreedte) return { regels: [schoon], pt, krap: false };
    }

    /* Past niet op één regel, ook niet klein. Meer regels dan, en opnieuw zo
       groot mogelijk — twee grote regels lezen beter dan één minuscule. */
    const stukken = breekpunten(schoon);
    for (let pt = o.maxPt; pt >= o.minPt; pt--) {
        const regels = verdeel(stukken, pt, o);
        if (regels && regels.every((r) => o.meet(r, pt) <= o.maxBreedte)) {
            return { regels, pt, krap: false };
        }
    }

    /* Zelfs op de kleinste maat te krap. Dan liever te klein dan afgekapt: de
       aanroeper mag hier een waarschuwing van maken, maar er verdwijnt geen
       letter. */
    const regels = verdeel(stukken, o.minPt, o) ?? [schoon];
    return { regels, pt: o.minPt, krap: true };
}

/** Woorden, en koppeltekens als extra breekpunt (het streepje blijft staan). */
function breekpunten(tekst: string): string[] {
    const uit: string[] = [];
    for (const woord of tekst.split(' ')) {
        const delen = woord.split(/(?<=-)/);   // breekt ná het streepje
        uit.push(...delen.filter(Boolean));
    }
    return uit;
}

/** Grijpt zoveel stukken per regel als passen. Geeft null als één enkel stuk
    al te breed is — dan heeft verder verdelen geen zin op deze maat. */
function verdeel(stukken: string[], pt: number, o: PasOpties): string[] | null {
    const regels: string[] = [];
    let huidig = '';

    for (const stuk of stukken) {
        if (o.meet(stuk, pt) > o.maxBreedte && !huidig) return null;
        const kandidaat = huidig ? plak(huidig, stuk) : stuk;
        if (o.meet(kandidaat, pt) <= o.maxBreedte) {
            huidig = kandidaat;
        } else {
            regels.push(huidig);
            huidig = stuk;
        }
    }
    if (huidig) regels.push(huidig);
    return regels.length ? regels : null;
}

/** Na een koppelteken komt geen spatie; tussen woorden wel. */
function plak(links: string, rechts: string): string {
    return links.endsWith('-') ? links + rechts : `${links} ${rechts}`;
}

/**
 * Controle die de belofte hard maakt: wat je uit `pasNaamIn` terugkrijgt, is
 * letter voor letter de naam die erin ging. Gebruikt door de tests en door de
 * renderer als laatste zekering vóór het printen.
 */
export function isVolledig(origineel: string, regels: string[]): boolean {
    const kaal = (s: string) => s.replace(/[\s]/g, '');
    return kaal(regels.join('')) === kaal((origineel ?? '').trim());
}

/* ── Pixels ───────────────────────────────────────────────────────────────── */

/**
 * Millimeters naar pixels op de resolutie van de doelprinter.
 *
 * Dit is de reden dat dpi een parameter is en geen constante: renderen op een
 * vaste maat en daarna schalen geeft rafelige letters op een thermische
 * printer. 4 × 6 inch is 812 × 1218 px op 203 dpi en 1200 × 1800 px op 300 dpi.
 */
export function mmNaarPx(mm: number, dpi: number): number {
    return Math.round((mm / 25.4) * dpi);
}
