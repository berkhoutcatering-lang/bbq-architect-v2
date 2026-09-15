/**
 * Een recept van iemand anders omzetten naar jouw spullen.
 *
 * Een kookboek beschrijft "een BBQ voor indirect grillen" of "een BBQ met
 * deksel op 110 °C". Dat is geen apparaat maar een **bereidingswijze**. Welk
 * toestel dat wordt hangt af van wat er in de loods staat, en dat verschilt
 * per bedrijf. Deze module maakt van de bereidingswijze een echt apparaat.
 *
 * Bij Hop & Bites:
 *   indirect / low-and-slow / roken  →  Yoder YS1500s pelletgrill
 *   direct grillen / hoog vuur       →  Yoder 24×48 houtskoolgrill
 *
 * Twee dingen die daarbij vervallen of veranderen, en die de ontleder moet
 * weten omdat ze anders als zinloze stap in de planning belanden:
 *
 *   - "Rookhout op de kolen" bestaat niet op een pelletgrill: die maakt zijn
 *     eigen rook. Die stap gaat eruit, niet als taak van nul minuten erin.
 *   - "Blijf bij het vuur" geldt bij houtskool wél en bij pellets niet — de
 *     ACS-controller houdt zelf temperatuur. Dat scheelt een bewaakte stap,
 *     en een bewaakte stap is een gat dat je niet kunt vullen.
 *
 * Geen taalmodel hier. De ontleder stelt voor, deze tabel vertaalt, en de kok
 * keurt goed.
 */

/** Hoe het boek het beschrijft. */
export type Bereidingswijze =
    /** Deksel dicht, vuur naast het vlees, lage temperatuur. */
    | 'indirect'
    /** Vlam eronder, hoog vuur, kort. */
    | 'direct'
    /** Roken bij lage temperatuur, uren. */
    | 'roken'
    /** Op de vlakke plaat. */
    | 'plancha'
    /** Pan op het vuur. Een pannetje is geen oven. */
    | 'fornuis'
    /** Oven, combisteamer, kookketel — een gesloten warme kast. */
    | 'oven';

export interface ApparaatKeuze {
    /** Welk apparaat dit wordt. `null` = niet vast te stellen, dan vraagt de ontleder het. */
    materieelId: number | null;
    naam: string | null;
    /** Vervalt de stap "rookhout toevoegen"? */
    rookhoutVervalt: boolean;
    /** Moet de kok bij het vuur blijven? */
    toezichtNodig: boolean;
    /** In mensentaal, voor in de goedkeur-lade. */
    reden: string;
}

/**
 * De inrichting van één keuken. Bewust data en geen logica: bij een andere
 * tenant staan hier andere apparaten, en dan hoeft er geen regel code om.
 */
export interface KeukenInrichting {
    /** Toestel voor indirect, low-and-slow en roken. */
    smokerId?: number | null;
    smokerNaam?: string | null;
    /** Maakt dit toestel zijn eigen rook? Dan vervalt het rookhout. */
    smokerMaaktEigenRook?: boolean;
    /** Houdt dit toestel zelf temperatuur? Dan hoeft er niemand bij te blijven. */
    smokerRegeltZelf?: boolean;

    /** Toestel voor direct grillen op hoog vuur. */
    grillId?: number | null;
    grillNaam?: string | null;
    grillMaaktEigenRook?: boolean;
    grillRegeltZelf?: boolean;
}

/** Hop & Bites, 8 september 2026. Twee Yoders, allebei op de aanhanger. */
export const HOP_EN_BITES: KeukenInrichting = {
    smokerId: 21,
    smokerNaam: 'Yoder Smokers YS1500s pelletgrill',
    /* Pellets maken hun eigen rook, en de ACS-controller houdt temperatuur. */
    smokerMaaktEigenRook: true,
    smokerRegeltZelf: true,

    grillId: 1,
    grillNaam: 'Yoder Smokers 24×48 houtskoolgrill',
    /* Houtskool: rookhout voeg je zelf toe, en het vuur regelt zichzelf niet. */
    grillMaaktEigenRook: false,
    grillRegeltZelf: false,
};

export function kiesApparaat(
    wijze: Bereidingswijze,
    inrichting: KeukenInrichting = HOP_EN_BITES,
): ApparaatKeuze {
    switch (wijze) {
        case 'indirect':
        case 'roken':
            if (inrichting.smokerId == null) {
                return onbekend('geen smoker in het materieel — welk toestel wordt dit?');
            }
            return {
                materieelId: inrichting.smokerId,
                naam: inrichting.smokerNaam ?? null,
                rookhoutVervalt: inrichting.smokerMaaktEigenRook === true,
                toezichtNodig: inrichting.smokerRegeltZelf !== true,
                reden: inrichting.smokerMaaktEigenRook
                    ? `${wijze === 'roken' ? 'Roken' : 'Indirect'} gaat op de ${inrichting.smokerNaam}. Die maakt zijn eigen rook, dus het rookhout uit het recept vervalt.`
                    : `${wijze === 'roken' ? 'Roken' : 'Indirect'} gaat op de ${inrichting.smokerNaam}.`,
            };

        case 'direct':
        case 'plancha':
            if (inrichting.grillId == null) {
                return onbekend('geen grill in het materieel — welk toestel wordt dit?');
            }
            return {
                materieelId: inrichting.grillId,
                naam: inrichting.grillNaam ?? null,
                rookhoutVervalt: inrichting.grillMaaktEigenRook === true,
                toezichtNodig: inrichting.grillRegeltZelf !== true,
                reden: `Grillen gaat op de ${inrichting.grillNaam}.${
                    inrichting.grillRegeltZelf !== true ? ' Houtskool regelt zichzelf niet, dus hier blijf je bij.' : ''
                }`,
            };

        case 'fornuis':
        case 'oven':
            /* Binnenwerk wijst de planner toe op grond van de kunde; welk
               toestel dat is hangt af van wat er vrij staat. */
            return onbekend(wijze === 'fornuis' ? 'pan op het vuur' : 'oven of steamer');

        default:
            return onbekend('niet vast te stellen — kies zelf het toestel');
    }
}

/**
 * Leidt de bereidingswijze af uit de tekst van een recept.
 *
 * Bewust conservatief: bij twijfel `null`, en dan vraagt de ontleder het.
 * Een verkeerd geraden toestel is erger dan een vraag, want het verschuift de
 * hele tijdlijn zonder dat iemand het merkt.
 */
export function leesBereidingswijze(tekst: string): Bereidingswijze | null {
    /* "Vloeibare rook", "rookaroma" en "rooksmaak" zijn ingrediënten, geen
       bereidingswijze: een saus met vloeibare rook staat gewoon op de inductie. */
    const t = tekst.toLowerCase().replace(/vloeibare\s+rook|rook(aroma|smaak|zout|poeder)/g, ' ');

    if (/\b(rook|roken|smoke|smoker|low.and.slow)\b/.test(t)) return 'roken';
    if (/indirect/.test(t)) return 'indirect';
    if (/\bplancha\b|flat.?top|bakplaat/.test(t)) return 'plancha';
    if (/direct grillen|direct.*vuur|hoog vuur|heet vuur|\bgrill(en)?\b/.test(t)) return 'direct';
    /* Oven vóór pan: "in de oven in een pan" is ovenwerk. */
    if (/\b(oven|combisteamer|steamer|kookketel|rational)\b/.test(t)) return 'oven';
    /* Pannetje, sauspannetje, koekenpan — allemaal het vuur. Let op het
       woordeinde: `\bpan\b` alleen matcht "pannetje" niet. */
    if (/\b(fornuis|inductie|au.bain.marie|(saus|steel|koeken|braad)?pan(netje|nen)?)\b/.test(t)) return 'fornuis';

    return null;
}

function onbekend(reden: string): ApparaatKeuze {
    return { materieelId: null, naam: null, rookhoutVervalt: false, toezichtNodig: false, reden };
}
