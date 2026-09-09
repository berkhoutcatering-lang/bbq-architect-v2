/**
 * De estafette — hoe je twee ladingen door één smoker krijgt.
 *
 * Het idee komt uit de keuken en niet uit een leerboek. Vlees gaat om acht uur
 * op de smoker, komt er om één uur af, gaat in een gastronorm met het deksel
 * erop en gaart verder in de steamer. Op dat moment is de smoker vrij en kan
 * lading twee erop. Om acht uur 's avonds is alles klaar — in plaats van dat
 * je met één lading de dag vult.
 *
 * Je maakt de smoker dus niet groter; je haalt er eerder iets af.
 *
 * **Waarom dat mag.** Het verhaal dat vlees na drie uur geen rook meer opneemt
 * is een broodje aap. Wat er echt gebeurt is dat de opname terugloopt zodra het
 * oppervlak droog en warm is — en het deksel maakt het definitief: daarna komt
 * er geen rook meer bij. De rookfase eindigt dus op een **handeling**, niet op
 * de klok. Alles daarna is warmte, en warmte kan elk ding leveren dat de
 * temperatuur haalt.
 *
 * **Wat dat betekent voor het model.** Een stap moet geen apparaat eisen maar
 * een *kunde*: "rookt" of "houdt 110 °C". Welk apparaat dat wordt, kiest de
 * planner — en dan kan hij de flessenhals ontzien. `materieel.maakt_mogelijk`
 * is precies die lijst en staat al gevuld.
 */

import type { Apparaat } from './types';
/* Dezelfde marge als bij het meerijden van vlees: wat samen in één pit mag,
   mag ook samen met een schaal cranberries. Eén definitie, één plek. */
import { TEMP_MARGE_C } from './batchen';

/** Wat een stap van een apparaat vraagt. */
export interface ApparaatEis {
    /** Uit `materieel.maakt_mogelijk`: smoker, grill, oven, fornuis, koeling… */
    kunde: string;
    /** Nodige temperatuur. Leeg = maakt niet uit. */
    tempC?: number | null;
    /** Moet dit apparaat er exclusief voor vrij zijn? */
    exclusief?: boolean;
}

/** Een apparaat zoals de estafette het nodig heeft: met zijn kundes erbij. */
export interface ApparaatMetKundes extends Apparaat {
    kundes: string[];
}

export interface Kandidaat {
    apparaat: ApparaatMetKundes;
    /** Lager is beter. */
    kosten: number;
    reden: string;
}

/**
 * Welke apparaten kunnen dit?
 *
 * Een apparaat komt in aanmerking als het de kunde heeft én de temperatuur
 * haalt. Staat het temperatuurbereik leeg, dan weten we het niet — en dan
 * wordt het apparaat wel voorgesteld maar met een lagere voorkeur, want een
 * aanname over temperatuur is precies het soort stille fout dat je pas merkt
 * als het vlees niet gaar is.
 */
export function geschikteApparaten(eis: ApparaatEis, apparaten: ApparaatMetKundes[]): ApparaatMetKundes[] {
    return apparaten.filter((a) => {
        if (!a.kundes.includes(eis.kunde)) return false;
        if (eis.tempC == null) return true;
        if (a.temp_min_c == null && a.temp_max_c == null) return true;   // onbekend bereik
        const onder = a.temp_min_c != null && eis.tempC < a.temp_min_c;
        const boven = a.temp_max_c != null && eis.tempC > a.temp_max_c;
        return !onder && !boven;
    });
}

/**
 * Kies het apparaat dat de dag het minst in de weg zit.
 *
 * De regel die alles doet: **ontzie de flessenhals**. Kan iets zowel op de
 * smoker als in de oven, en is de smoker het apparaat waar de dag op vastloopt,
 * dan gaat het in de oven. Niet omdat de oven beter is, maar omdat elk uur dat
 * de smoker vrij is een uur is waarin er een lading bij kan.
 *
 * @param flessenhalsId het apparaat dat de dag begrenst; die wordt ontzien.
 * @param bezetMin per apparaat hoeveel minuten het al vol zit vandaag.
 */
export function kiesApparaat(
    eis: ApparaatEis,
    apparaten: ApparaatMetKundes[],
    opties: { flessenhalsId?: number | null; bezetMin?: Map<number, number> } = {},
): Kandidaat | null {
    const geschikt = geschikteApparaten(eis, apparaten);
    if (geschikt.length === 0) return null;

    const bezet = opties.bezetMin ?? new Map<number, number>();

    const kandidaten: Kandidaat[] = geschikt.map((a) => {
        const isFlessenhals = opties.flessenhalsId != null && a.id === opties.flessenhalsId;
        const drukte = bezet.get(a.id) ?? 0;
        const bereikOnbekend = eis.tempC != null && a.temp_min_c == null && a.temp_max_c == null;

        /* De flessenhals krijgt een forse opslag zodat hij alleen wordt gekozen
           als er echt niets anders is. Drukte weegt daarna mee, en een onbekend
           temperatuurbereik telt licht tegen. */
        const kosten = (isFlessenhals ? 10_000 : 0) + drukte + (bereikOnbekend ? 500 : 0);

        return {
            apparaat: a,
            kosten,
            reden: isFlessenhals
                ? `${a.naam} kan het, maar is de flessenhals van vandaag`
                : bereikOnbekend
                    ? `${a.naam} kan het; temperatuurbereik is niet vastgelegd`
                    : `${a.naam} kan het en zit vandaag ${Math.round(drukte)} min vol`,
        };
    });

    kandidaten.sort((a, b) => a.kosten - b.kosten);
    return kandidaten[0];
}

/**
 * Hoeveel ladingen passen er vandaag door de flessenhals?
 *
 * Dit is de som waar de hele estafette om draait. De smoker heeft één keer
 * opwarmtijd nodig en daarna een vaste cyclus per lading. Twee ladingen kosten
 * dus niet twee keer alles — het opwarmen betaal je één keer, en dat is precies
 * waarom een tweede ronde relatief goedkoop is.
 */
export function rondesPerDag(opties: {
    /** Hoeveel minuten het apparaat vandaag beschikbaar is. */
    beschikbaarMin: number;
    /** Eenmalig, vóór de eerste lading. */
    opwarmMin: number;
    /** Hoe lang één lading het apparaat bezet houdt. */
    cyclusMin: number;
    /** Tijd tussen twee ladingen: eraf halen, erop leggen. */
    wisselMin?: number;
}): { rondes: number; eindMin: number; restMin: number } {
    const { beschikbaarMin, opwarmMin, cyclusMin } = opties;
    const wissel = opties.wisselMin ?? 0;
    if (cyclusMin <= 0) return { rondes: 0, eindMin: 0, restMin: beschikbaarMin };

    const naOpwarmen = beschikbaarMin - opwarmMin;
    if (naOpwarmen < cyclusMin) return { rondes: 0, eindMin: 0, restMin: beschikbaarMin };

    const rondes = Math.floor((naOpwarmen + wissel) / (cyclusMin + wissel));
    const eindMin = opwarmMin + rondes * cyclusMin + (rondes - 1) * wissel;
    return { rondes, eindMin, restMin: beschikbaarMin - eindMin };
}

/**
 * Wat levert het op om de gaarfase van de flessenhals af te halen?
 *
 * Geeft in minuten en in ladingen terug wat de estafette scheelt. Bestaat er
 * geen apparaat dat het kan overnemen, dan is het antwoord eerlijk nul — en
 * dan weet je meteen wat zo'n apparaat waard zou zijn.
 */
export function estafetteWinst(opties: {
    beschikbaarMin: number;
    opwarmMin: number;
    /** Hoe lang de rookfase het apparaat bezet houdt. */
    rookMin: number;
    /** Hoe lang het daarna nog moet garen. */
    gaarMin: number;
    wisselMin?: number;
    /** Is er iets dat de gaarfase kan overnemen? */
    overnemer: ApparaatMetKundes | null;
}): { zonder: number; met: number; extraLadingen: number; uitleg: string } {
    const { beschikbaarMin, opwarmMin, rookMin, gaarMin } = opties;
    const wissel = opties.wisselMin ?? 15;

    /* Zonder overnemer blijft het vlees de hele rit op de smoker liggen. */
    const zonder = rondesPerDag({ beschikbaarMin, opwarmMin, cyclusMin: rookMin + gaarMin, wisselMin: wissel }).rondes;

    if (!opties.overnemer) {
        return {
            zonder, met: zonder, extraLadingen: 0,
            uitleg: 'Er is geen apparaat dat de gaarfase kan overnemen, dus het vlees blijft de hele tijd op de smoker liggen.',
        };
    }

    const met = rondesPerDag({ beschikbaarMin, opwarmMin, cyclusMin: rookMin, wisselMin: wissel }).rondes;
    const extra = Math.max(0, met - zonder);

    return {
        zonder, met, extraLadingen: extra,
        uitleg: extra > 0
            ? `Gaar je verder in de ${opties.overnemer.naam}, dan passen er ${met} ladingen op de smoker in plaats van ${zonder}.`
            : `Overnemen door de ${opties.overnemer.naam} levert vandaag geen extra lading op.`,
    };
}


/**
 * Welk apparaat is vandaag de flessenhals?
 *
 * Niet "het duurste" of "de smoker", maar: waar is de vraag het grootst ten
 * opzichte van wat er op een dag door kan. Dat is de enige zinnige definitie,
 * en hij verschuift per dag — op een koude dag is de Robot Coupe de flessenhals
 * en staat de Yoder uit.
 *
 * Waarom het uitmaakt: een uur stilstand op de flessenhals is een uur voor de
 * hele dag. Overal elders haal je het weer in.
 */
export function bepaalFlessenhals(
    vraagMin: Map<number, number>,
    beschikbaarMin = 12 * 60,
): { apparaatId: number | null; bezettingsgraad: number; krap: boolean } {
    let besteId: number | null = null;
    let hoogste = 0;

    for (const [id, min] of vraagMin) {
        if (min > hoogste) {
            hoogste = min;
            besteId = id;
        }
    }

    const graad = beschikbaarMin > 0 ? hoogste / beschikbaarMin : 0;
    return {
        apparaatId: besteId,
        bezettingsgraad: Math.round(graad * 100) / 100,
        /* Boven de zeventig procent gaat een dag knellen: elke uitloop tikt
           dan meteen door naar het eind. Onder de helft is er lucht genoeg en
           is "ontzien" een oplossing voor een probleem dat er niet is. */
        krap: graad >= 0.7,
    };
}

/**
 * Hoeveel minuten elk apparaat vandaag gevraagd wordt.
 *
 * Telt per taak de tijd dat het toestel bezet is: aanzetten, opwarmen, werken
 * en wachten. Een taak zonder toestel telt nergens mee.
 */
export function vraagPerApparaat(
    taken: Array<{ apparaat?: { id: number; aanzetMin: number; opwarmMin: number | null } | null; actiefMin: number | null; passiefMin: number | null }>,
): Map<number, number> {
    const uit = new Map<number, number>();
    for (const t of taken) {
        if (!t.apparaat) continue;
        const min = (t.apparaat.aanzetMin ?? 0) + (t.apparaat.opwarmMin ?? 0)
            + (t.actiefMin ?? 0) + (t.passiefMin ?? 0);
        uit.set(t.apparaat.id, (uit.get(t.apparaat.id) ?? 0) + min);
    }
    return uit;
}


/**
 * Moet dit kleine onderdeel echt de smoker aan?
 *
 * Gerookte cranberries voor een saus zijn een meerijder: draait de smoker toch
 * al voor het vlees, dan kost die schaal bessen niets extra — hij gaat er
 * gewoon bij. Draait hij niet, dan zet je een uur opwarmen en een zak pellets
 * in voor een bakje fruit, en dan is de vraag eerlijk: wil je dat, of doen we
 * het zonder rook?
 *
 * Dat is geen zuinigheid maar planning. Een smoker die aangaat voor één
 * onderdeel legt beslag op je flessenhals, en dat tikt door naar de rest van
 * de dag.
 *
 * @param draaitAl Draait het toestel al voor iets anders in dit venster?
 * @param tempVerschilC Verschil met wat er al op staat. Leeg = niets op.
 */
export function rookMeerijden(opties: {
    draaitAl: boolean;
    tempVerschilC?: number | null;
    opwarmMin: number | null;
    /** Waar het om gaat — voor de vraag aan de kok. */
    wat: string;
}): { oordeel: 'meerijden' | 'vraag'; reden: string } {
    const { draaitAl, opwarmMin, wat } = opties;
    const verschil = opties.tempVerschilC ?? 0;

    if (draaitAl && Math.abs(verschil) <= TEMP_MARGE_C) {
        return {
            oordeel: 'meerijden',
            reden: `De smoker draait al — ${wat} gaat er gewoon bij en kost geen extra tijd`,
        };
    }

    if (draaitAl) {
        return {
            oordeel: 'vraag',
            reden: `De smoker draait, maar ${Math.abs(verschil)} °C anders dan ${wat} vraagt — meerijden of apart?`,
        };
    }

    const kosten = opwarmMin != null ? `${opwarmMin} min opwarmen` : 'de smoker aanzetten';
    return {
        oordeel: 'vraag',
        reden: `De smoker staat uit. ${wat} roken kost ${kosten} — doen, of zonder rook?`,
    };
}
