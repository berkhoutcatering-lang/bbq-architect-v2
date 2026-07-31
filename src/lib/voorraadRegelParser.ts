/**
 * voorraadRegelParser — lees een handgeschreven voorraadlijst.
 *
 * Ontstaan omdat product-voor-product tikken niet werkt als je met een
 * kladblaadje in een vriezer staat. Je schrijft "11x pulled beef 500g" en
 * "40kg pulled pork" door elkaar; de app hoort dat te begrijpen.
 *
 * Wat de parser NIET doet: gokken en doorlopen. Elke regel krijgt een
 * `zeker`-vlag. Staat die op false, dan zet het scherm de regel apart met de
 * vraag erbij — want een verkeerd gelezen hoeveelheid wordt een absolute
 * voorraadstand, en die liegt daarna in elke bestelling en marge.
 *
 * Vormen die in de praktijk voorkomen (allemaal uit een echte lijst):
 *   11x pulled beef 500g            → 11 pakken van 500 g
 *   900 gram coppa ham              → 1 × 900 g
 *   1,6 kg bavette                  → 1 × 1,6 kg
 *   Carpaccio vlees 6200 gram       → naam vooraan, gewicht achteraan
 *   40kg pulled pork                → getal en eenheid aan elkaar
 *   33x zakje Knol a 85 gram        → "a" / "à" = per stuk
 *   34x canelle kruidenboter        → los aantal, geen gewicht → stuks
 *   185x30gram mini gehaktballetjes → aantal × gewicht aan elkaar geplakt
 *   13zakjes aardbij gel            → aantal en woord aan elkaar
 */

import { convertQty, unitFamily } from './unitPrice';

export interface GeparseerdeRegel {
    /** De regel zoals hij getypt is — blijft zichtbaar zodat je kunt vergelijken. */
    ruw: string;
    /** Aantal pakken / stuks. */
    aantal: number;
    /** Inhoud per pak in `eenheid`. null = los geteld (stuks). */
    inhoud: number | null;
    /** kg | g | liter | ml | stuks */
    eenheid: string;
    naam: string;
    /** false = de regel is niet goed gelezen; het scherm moet ernaar vragen. */
    zeker: boolean;
    /** Waaróm dit nagekeken moet worden, in gewone taal. */
    opmerking?: string;
    /**
     * Wél goed gelezen, maar er is een tweede legitieme lezing. "185 balletjes
     * van 30 gram" kan 5,55 kg zijn of 185 stuks; wat handig is hangt af van het
     * recept. Bewust géén `zeker: false`: als de helft van je lijst rood staat
     * klik je er doorheen en dan is de markering niets meer waard.
     */
    tip?: string;
}

/* Woorden die wel in de regel staan maar niets over de hoeveelheid zeggen.
   "zakje" en "zakjes" zijn verpakking, geen productnaam — maar ze zijn soms
   het enige dat er staat ("8x zakje gerookte bieten gel"), dus we strippen ze
   alleen als er daarna nog een naam overblijft. */
const VERPAKKINGSWOORDEN = ['zakje', 'zakjes', 'zak', 'zakken', 'pak', 'pakken', 'stuk', 'stuks', 'st', 'doos', 'dozen', 'bak', 'bakje', 'bakjes', 'pot', 'potje', 'potjes', 'fles', 'flessen', 'krat', 'kratten'];

/* Eenheden zoals ze in het echt geschreven worden → onze canonieke vorm. */
const EENHEID_SYNONIEMEN: Record<string, string> = {
    g: 'g', gr: 'g', gram: 'g', grammen: 'g',
    kg: 'kg', kilo: 'kg', kilos: 'kg', "kilo's": 'kg', kilogram: 'kg',
    ml: 'ml', milliliter: 'ml',
    l: 'liter', ltr: 'liter', liter: 'liter', liters: 'liter',
};

const EENHEID_PATROON = Object.keys(EENHEID_SYNONIEMEN).sort((a, b) => b.length - a.length).join('|');

/** "1,6" en "1.6" zijn allebei anderhalf-en-een-beetje. */
function getal(s: string): number {
    const n = parseFloat(String(s).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
}

function schoonNaam(s: string): string {
    let naam = s
        .replace(/\s+/g, ' ')
        .replace(/^[\s×x*,.\-–—]+/, '')
        .replace(/[\s,.\-–—]+$/, '')
        .trim();

    /* Verpakkingswoord vooraan weghalen, maar alleen als er een naam overblijft:
       "zakje Knol" → "Knol", maar "zakjes" alleen laat "zakjes" staan. */
    const woorden = naam.split(' ');
    while (woorden.length > 1 && VERPAKKINGSWOORDEN.includes(woorden[0].toLowerCase().replace(/[^a-z']/g, ''))) {
        woorden.shift();
    }
    naam = woorden.join(' ').trim();
    return naam;
}

/** Eerste letter groot, de rest laten zoals hij is (merknamen blijven heel). */
function nettNaam(s: string): string {
    const n = schoonNaam(s);
    if (!n) return '';
    return n.charAt(0).toUpperCase() + n.slice(1);
}

/**
 * Eén regel lezen. Geeft `null` als er niets bruikbaars in staat (lege regel,
 * los streepje, kopregel).
 */
export function parseerRegel(ruw: string): GeparseerdeRegel | null {
    const regel = String(ruw || '').trim();
    if (!regel || /^[-–—*•\s]+$/.test(regel)) return null;

    /* Werkkopie zonder opsommingstekens vooraan. */
    let rest = regel.replace(/^[-–—*•]\s*/, '').trim();
    if (!rest) return null;

    let aantal: number | null = null;
    let inhoud: number | null = null;
    let eenheid: string | null = null;
    let zeker = true;
    let opmerking: string | undefined;

    /* ── Vorm A: "11x pulled beef 500g" / "185x30gram ..." / "33x zakje Knol a 85 gram"
       Een telwoord met een expliciete x ervoor is een AANTAL, geen gewicht. */
    const metX = rest.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*[x×]\\s*(.*)$`, 'i'));
    if (metX) {
        aantal = getal(metX[1]);
        rest = metX[2].trim();
    }

    /* ── "13zakjes aardbij gel": getal plakt aan een verpakkingswoord. */
    if (aantal === null) {
        const metVerpakking = rest.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${VERPAKKINGSWOORDEN.join('|')})\\b\\s*(.*)$`, 'i'));
        if (metVerpakking) {
            aantal = getal(metVerpakking[1]);
            rest = metVerpakking[3].trim();
        }
    }

    /* ── Pakinhoud: "a 85 gram" / "à 85 gram" / "500g" / "6200 gram" / "1,6 kg".
       We zoeken het LAATSTE gewicht in de regel, want de naam kan zelf een
       getal bevatten ("mini brioche 40"). */
    const gewichtRegex = new RegExp(`(?:\\b[aà]\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(${EENHEID_PATROON})\\b`, 'gi');
    let match: RegExpExecArray | null;
    let laatste: { hoeveel: number; eenheid: string; start: number; eind: number } | null = null;
    while ((match = gewichtRegex.exec(rest)) !== null) {
        laatste = {
            hoeveel: getal(match[1]),
            eenheid: EENHEID_SYNONIEMEN[match[2].toLowerCase()] ?? match[2].toLowerCase(),
            start: match.index,
            eind: match.index + match[0].length,
        };
    }

    if (laatste) {
        inhoud = laatste.hoeveel;
        eenheid = laatste.eenheid;
        rest = (rest.slice(0, laatste.start) + ' ' + rest.slice(laatste.eind)).trim();
    }

    /* ── Vorm B: "95 mojnksballss" — een kaal getal vooraan zonder eenheid is
       een aantal stuks. */
    if (aantal === null) {
        const kaalGetal = rest.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);
        if (kaalGetal) {
            aantal = getal(kaalGetal[1]);
            rest = kaalGetal[2].trim();
        }
    }

    const naam = nettNaam(rest);
    if (!naam) return null;

    /* Blijft er een getal in de naam staan, dan hebben we iets NIET gelezen —
       "43x wortel 3per zakje a80 gram" houdt "3per zakje" over. Dat is geen
       smaakkwestie maar een misparse, en die moet je zien. Een merknaam met een
       cijfer (bv. "Beef Club 29") is de uitzondering die je in één tik wegtikt. */
    const restCijfer = /\d/.test(naam);

    /* ── Samenstellen ────────────────────────────────────────────────── */
    if (aantal === null && inhoud !== null) {
        /* "900 gram coppa ham" → één portie van 900 g. */
        aantal = 1;
    }
    if (aantal === null) {
        /* Alleen een naam, geen getal — dan weten we de hoeveelheid niet. */
        return {
            ruw: regel, aantal: 0, inhoud: null, eenheid: 'stuks', naam,
            zeker: false, opmerking: 'Geen aantal gevonden — hoeveel heb je hiervan?',
        };
    }
    if (inhoud === null) {
        /* "34x canelle kruidenboter" → 34 stuks, geen gewicht bekend. */
        return {
            ruw: regel, aantal, inhoud: null, eenheid: 'stuks', naam,
            zeker: !restCijfer,
            opmerking: restCijfer ? 'Er staat nog een getal in de naam — klopt de hoeveelheid?' : undefined,
        };
    }

    /* Gram/milliliter oprollen naar kilo/liter zodra het totaal daarom vraagt —
       "11 × 500 g" leest als 5,5 kg, niet als 5500 g. */
    let eind = { aantal, inhoud, eenheid: eenheid as string };
    if ((eind.eenheid === 'g' || eind.eenheid === 'ml') && eind.aantal * eind.inhoud >= 1000) {
        const groot = eind.eenheid === 'g' ? 'kg' : 'liter';
        const om = convertQty(eind.inhoud, eind.eenheid, groot);
        if (om !== null) eind = { aantal: eind.aantal, inhoud: Math.round(om * 1e6) / 1e6, eenheid: groot };
    }

    if (restCijfer) {
        zeker = false;
        opmerking = 'Er staat nog een getal in de naam — dat heb ik niet kunnen plaatsen.';
    }

    /* Aantal én gewicht samen laat twee lezingen toe. Bij bulk (11 × 500 g
       pulled beef) is gewicht vanzelfsprekend; bij veel kleine stuks (185 ×
       30 g balletjes) telt een kok in stuks. We kiezen gewicht en bieden de
       omschakeling aan — geen rode vlag, want de lezing is niet fóút. */
    let tip: string | undefined;
    if (metX && aantal > 1) {
        tip = `Of tel je dit in stuks? Dan wordt het ${aantal} stuks.`;
    }

    return { ruw: regel, aantal: eind.aantal, inhoud: eind.inhoud, eenheid: eind.eenheid, naam, zeker, opmerking, tip };
}

/** Hele lijst. Lege regels vallen weg, volgorde blijft. */
export function parseerLijst(tekst: string): GeparseerdeRegel[] {
    return String(tekst || '')
        .split('\n')
        .map(parseerRegel)
        .filter((r): r is GeparseerdeRegel => r !== null);
}

/** Wat komt er in de voorraad te staan? Zelfde som als de telkaart. */
export function regelTotaal(r: GeparseerdeRegel): number {
    const per = r.inhoud ?? 1;
    return Math.round(r.aantal * per * 1000) / 1000;
}

/** "11 × 0,5 kg = 5,5 kg" — of gewoon "34 stuks" als er geen pakmaat is. */
export function regelSom(r: GeparseerdeRegel): string {
    const n = (x: number) => String(Math.round(x * 1000) / 1000).replace('.', ',');
    if (r.inhoud === null) return `${n(r.aantal)} ${r.eenheid}`;
    return `${n(r.aantal)} × ${n(r.inhoud)} ${r.eenheid} = ${n(regelTotaal(r))} ${r.eenheid}`;
}

/** Eenheid omzetten zonder de getelde hoeveelheid te verliezen (kg ↔ stuks kan niet). */
export function wisselEenheid(r: GeparseerdeRegel, nieuw: string): GeparseerdeRegel {
    if (nieuw === r.eenheid) return r;
    /* Naar stuks: de pakmaat vervalt, het aantal blijft wat je geteld hebt. */
    if (nieuw === 'stuks') return { ...r, inhoud: null, eenheid: 'stuks', zeker: true, opmerking: undefined };
    if (r.inhoud === null || unitFamily(r.eenheid) === null) {
        return { ...r, eenheid: nieuw, inhoud: r.inhoud ?? 1, zeker: true, opmerking: undefined };
    }
    const om = convertQty(r.inhoud, r.eenheid, nieuw);
    if (om === null) return { ...r, eenheid: nieuw, zeker: true, opmerking: undefined };
    return { ...r, inhoud: Math.round(om * 1e6) / 1e6, eenheid: nieuw, zeker: true, opmerking: undefined };
}
