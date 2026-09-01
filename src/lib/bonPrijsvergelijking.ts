/**
 * bonPrijsvergelijking — wat stond er op de lijst, en wat heb je betaald?
 *
 * Aanleiding, 2026-09-01. De prijzen in de app komen uit prijslijsten. Bij Beef
 * Club is dat deels de catalogus van de Belgische groothandel waar zij zelf
 * inkopen, en daar legt Beef Club een marge op. Hoeveel, dat staat nergens.
 * Zolang je dat niet weet is elke kostprijs een aanname.
 *
 * Je facturen weten het wel. Deze module legt de regels van een bon naast de
 * prijslijst van diezelfde leverancier en rekent het verschil uit. Niet om de
 * lijst te corrigeren — daar is een bon te weinig voor — maar om zichtbaar te
 * maken wáár lijst en werkelijkheid uit elkaar lopen, en hoe hard.
 *
 * De belangrijkste regel staat in `vergelijkbaar()`: we vergelijken alleen als
 * de eenheden dezelfde soort zijn. Op de Beef Club-factuur van 29 mei staat
 * "Beef Burger 100x80gr, €115,20 per stuks" naast een lijstprijs van €13,50 per
 * kilo. Dat is een doos van acht kilo tegenover een kiloprijs. Wie die twee
 * getallen deelt krijgt +753% en denkt dat hij een schandaal heeft gevonden.
 * Het is dezelfde pak-versus-eenheid-fout die deze codebase al drie keer eerder
 * heeft gemaakt; hier weigeren we hem gewoon.
 */

import { strictNorm, cleanBase, similarity } from './pricelistMatch';

/** Eén regel van een gescande bon. */
export interface BonRegel {
    naam: string;
    aantal?: number | null;
    unit?: string | null;
    /** Prijs per eenheid zoals op de bon. */
    prijs: number;
    totaal?: number | null;
}

/** Eén regel uit de prijslijst van dezelfde leverancier. */
export interface LijstRegel {
    product_naam: string;
    eenheid?: string | null;
    prijs: number;
    prijs_per_kg?: number | null;
}

export type VergelijkStand =
    | 'gelijk'            // binnen de ruis — lijst en factuur zeggen hetzelfde
    | 'duurder'           // je betaalde meer dan de lijst
    | 'goedkoper'         // je betaalde minder
    | 'geen-match'        // product niet teruggevonden in de lijst
    | 'eenheden-verschillen'; // wel gevonden, maar appels en peren

export interface Vergelijking {
    regel: BonRegel;
    stand: VergelijkStand;
    /** De gevonden lijstregel, als die er is. */
    lijstNaam?: string;
    lijstPrijs?: number;
    /** Verschil in procenten, alleen bij gelijk/duurder/goedkoper. */
    verschilPct?: number;
    /** Hoe zeker de naam-match is (0-1). */
    zekerheid?: number;
    toelichting: string;
}

export interface VergelijkingTotaal {
    regels: Vergelijking[];
    vergeleken: number;
    afwijkend: number;
    /** Gemiddelde afwijking over de vergeleken regels, of null bij geen enkele. */
    gemiddeldPct: number | null;
}

/** Binnen deze marge noemen we het gelijk — centen-afronding op een factuur. */
const RUIS_PCT = 0.5;

/** Hoe zeker een naam-match minstens moet zijn voor we hem gebruiken. */
const MIN_ZEKERHEID = 0.72;

type Familie = 'gewicht' | 'volume' | 'stuk';

/** Nederlandse notatie: 13,3 en niet 13.3. */
function pctNL(n: number): string {
    return n.toFixed(1).replace('.', ',');
}

function familie(eenheid: string | null | undefined): Familie | null {
    const e = String(eenheid ?? '').trim().toLowerCase();
    if (!e) return null;
    if (/^(kg|kilo|g|gram|gr)\b/.test(e)) return 'gewicht';
    if (/^(l|ltr|liter|ml)\b/.test(e)) return 'volume';
    if (/^(st|stuk|stuks|piece|doos|bak|zak|tray|pak)\b/.test(e)) return 'stuk';
    return null;
}

/**
 * Mogen deze twee prijzen naast elkaar? Alleen als beide eenheden bekend zijn
 * én tot dezelfde familie horen. Twijfel is nee: liever geen oordeel dan een
 * verzonnen percentage.
 */
export function vergelijkbaar(bonEenheid: string | null | undefined, lijstEenheid: string | null | undefined): boolean {
    const a = familie(bonEenheid);
    const b = familie(lijstEenheid);
    if (a == null || b == null) return false;
    return a === b;
}

/** Zoek de best passende lijstregel op naam. Null als niets goed genoeg past. */
export function zoekLijstregel(naam: string, lijst: LijstRegel[]): { regel: LijstRegel; zekerheid: number } | null {
    const doel = strictNorm(naam);
    if (!doel) return null;

    /* Exacte treffer op genormaliseerde naam gaat voor alles. */
    for (const r of lijst) {
        if (strictNorm(r.product_naam) === doel) return { regel: r, zekerheid: 1 };
    }

    let beste: LijstRegel | null = null;
    let besteScore = 0;
    const basis = cleanBase(naam);
    for (const r of lijst) {
        const score = similarity(basis, cleanBase(r.product_naam));
        if (score > besteScore) { besteScore = score; beste = r; }
    }
    if (beste && besteScore >= MIN_ZEKERHEID) return { regel: beste, zekerheid: besteScore };
    return null;
}

export function vergelijkBonregel(regel: BonRegel, lijst: LijstRegel[]): Vergelijking {
    const hit = zoekLijstregel(regel.naam, lijst);
    if (!hit) {
        return {
            regel,
            stand: 'geen-match',
            toelichting: 'Staat niet in de prijslijst van deze leverancier.',
        };
    }

    const lijstPrijs = Number(hit.regel.prijs_per_kg ?? hit.regel.prijs);
    if (!Number.isFinite(lijstPrijs) || lijstPrijs <= 0) {
        return {
            regel, stand: 'geen-match', lijstNaam: hit.regel.product_naam, zekerheid: hit.zekerheid,
            toelichting: 'Gevonden in de lijst, maar daar staat geen bruikbare prijs bij.',
        };
    }

    if (!vergelijkbaar(regel.unit, hit.regel.eenheid)) {
        return {
            regel,
            stand: 'eenheden-verschillen',
            lijstNaam: hit.regel.product_naam,
            lijstPrijs,
            zekerheid: hit.zekerheid,
            toelichting:
                `Bon rekent per ${regel.unit || 'onbekend'}, de lijst per ${hit.regel.eenheid || 'onbekend'}. `
                + 'Die twee getallen zeggen niets over elkaar, dus vergelijken we ze niet.',
        };
    }

    const pct = ((regel.prijs - lijstPrijs) / lijstPrijs) * 100;
    const stand: VergelijkStand =
        Math.abs(pct) <= RUIS_PCT ? 'gelijk' : pct > 0 ? 'duurder' : 'goedkoper';

    const toelichting =
        stand === 'gelijk'
            ? 'Factuur en prijslijst zeggen hetzelfde.'
            : stand === 'duurder'
                ? `${pctNL(pct)}% boven de lijstprijs — meestal de opslag van je leverancier.`
                : `${pctNL(Math.abs(pct))}% onder de lijstprijs.`;

    return {
        regel, stand, lijstNaam: hit.regel.product_naam, lijstPrijs,
        verschilPct: Math.round(pct * 10) / 10, zekerheid: hit.zekerheid, toelichting,
    };
}

/**
 * Alle regels van één bon tegen de lijst van die leverancier.
 *
 * `gemiddeldPct` is bewust alleen het gemiddelde over de régels die echt
 * vergeleken konden worden. Regels zonder match of met een andere eenheid
 * tellen niet als nul mee — dat zou een afwijking wegmiddelen die er is.
 */
export function vergelijkBon(regels: BonRegel[], lijst: LijstRegel[]): VergelijkingTotaal {
    const uit = regels.map((r) => vergelijkBonregel(r, lijst));
    const meetbaar = uit.filter((v) => v.verschilPct != null);
    const afwijkend = meetbaar.filter((v) => v.stand !== 'gelijk');
    return {
        regels: uit,
        vergeleken: meetbaar.length,
        afwijkend: afwijkend.length,
        gemiddeldPct: meetbaar.length > 0
            ? Math.round((meetbaar.reduce((s, v) => s + (v.verschilPct ?? 0), 0) / meetbaar.length) * 10) / 10
            : null,
    };
}
