/**
 * Terugrekenen — en vooruitrekenen.
 *
 * Twee kanten op, en dat is niet hetzelfde als twee keer hetzelfde:
 *
 *   **achteruit** vanaf het uitlevermoment geeft de *laatste* starttijd.
 *   **vooruit** vanaf nu en vanaf de voorgangers geeft de *vroegste*.
 *
 * Het verschil is speling. De keten met nul speling is het kritieke pad: die
 * bepaalt hoe lang de dag duurt. Alles daarbuiten mag schuiven, en dat is de
 * ruimte waarin je iets anders kunt zetten.
 *
 * **Waarom dit erbij moest.** De eerste versie rekende alleen achteruit. Wie
 * dat uitvoert draait elke taak op zijn laatste moment en is om vijf voor drie
 * klaar voor een klus van drie uur — nul speling, en één hapering en je bent
 * te laat. Dat is geen planning maar een gok.
 *
 * **De buffer.** Niet elke taak wat ruimer inschatten — die ruimte wordt
 * opgegeten, het werk rekt zich uit tot de tijd die je geeft. In plaats
 * daarvan schat je eerlijk krap en zet je alle veiligheid als één blok aan het
 * eind: klaar om 14:00 voor een uitlevering van 16:00. Die buffer is dan
 * zichtbaar en je ziet hem slinken. Dat is het idee achter critical chain
 * (Goldratt), en het werkt hier om precies dezelfde reden.
 *
 * Twee dingen die uit echte recepten kwamen:
 *   - Een koud apparaat moet eerst aangezet en opgewarmd worden; dat hoort
 *     vóór het werk en telt mee in de keten.
 *   - Twee ladingen betekent dat de eerste een halve dag eerder in moet,
 *     inclusief schoonmaaktijd ertussen bij een exclusief apparaat.
 */

import type { Taak } from './types';

export interface Terugrekening {
    taakId: number;
    /** Vroegste moment waarop deze taak kán starten: nu, of zodra zijn
     *  voorgangers klaar zijn. */
    vroegsteStart: string;
    /** Laatste moment waarop deze taak mag starten. */
    uiterlijkStart: string;
    /** Wanneer hij af moet zijn. */
    uiterlijkKlaar: string;
    /**
     * Minuten speling tot de deadline, gerekend vanaf `nu`.
     *
     * `null` = deze taak heeft helemaal geen deadline. Dat is iets anders dan
     * een marge van nul: geen deadline betekent geen haast, niet maximale
     * haast. Gevonden op de eerste demo-dag — een losse schoonmaaktaak zonder
     * event stond groot op het scherm terwijl de brisket lag te wachten.
     */
    margeMin: number | null;
    /** Ligt de deadline al achter ons? Alleen zinvol als er één is. */
    teLaat: boolean;
    /**
     * Speling: hoeveel deze taak mag schuiven zonder iets anders te raken.
     * Nul betekent kritiek pad. `null` = geen deadline, dus geen speling te
     * berekenen.
     */
    spelingMin: number | null;
    /** Zit deze taak op het kritieke pad? Die bepalen de lengte van de dag. */
    kritiek: boolean;
}

export interface TerugrekenInvoer {
    taken: Taak[];
    /** Uitlevermoment per klus (event). ISO. */
    uitlevering: Record<number, string>;
    /** Wat de planner als "nu" beschouwt. Nooit uit de omgeving lezen. */
    nu: string;
    /**
     * Minuten die je vóór de uitlevering klaar wilt zijn.
     *
     * Alle veiligheid op één plek in plaats van uitgesmeerd over de taken.
     * Standaard twee uur: klaar om 14:00 voor een uitlevering van 16:00.
     * Nul betekent: rekenen tot op de minuut, en dan werk je op spanning.
     */
    bufferMin?: number;
}

/** Twee uur speling voor de uitlevering. Zie de kop van dit bestand. */
export const STANDAARD_BUFFER_MIN = 120;

/**
 * Rekent per taak terug. Taken zonder eigen deadline erven die van de taak
 * die van hen afhangt; helemaal onderaan de keten staat het uitlevermoment.
 *
 * Cycli in de afhankelijkheden worden genegeerd in plaats van dat ze de
 * planner laten vastlopen — een kok heeft meer aan een plan met een rare
 * volgorde dan aan een leeg scherm.
 */
export function terugrekenen(invoer: TerugrekenInvoer): Map<number, Terugrekening> {
    const { taken, uitlevering, nu } = invoer;
    const bufferMin = invoer.bufferMin ?? STANDAARD_BUFFER_MIN;
    const perId = new Map(taken.map((t) => [t.id, t]));
    const nuMs = Date.parse(nu);

    /* Wie hangt er van mij af? Nodig om achterstevoren te lopen. */
    const volgers = new Map<number, number[]>();
    for (const t of taken) {
        for (const v of t.hangtAfVan) {
            const lijst = volgers.get(v);
            if (lijst) lijst.push(t.id);
            else volgers.set(v, [t.id]);
        }
    }

    const klaar = new Map<number, number>();
    const bezig = new Set<number>();

    function uiterlijkKlaarMs(id: number): number {
        const gevonden = klaar.get(id);
        if (gevonden != null) return gevonden;
        if (bezig.has(id)) {
            /* Cykel. Val terug op het uitlevermoment van de klus. */
            const t = perId.get(id);
            return eigenDeadlineMs(t) ?? nuMs;
        }
        bezig.add(id);

        const taak = perId.get(id);
        const mijnVolgers = volgers.get(id) ?? [];
        let resultaat: number;

        if (mijnVolgers.length === 0) {
            resultaat = eigenDeadlineMs(taak) ?? nuMs;
        } else {
            /* Ik moet klaar zijn vóór de vroegste start van wie op mij wacht. */
            resultaat = Math.min(
                ...mijnVolgers.map((v) => {
                    const vt = perId.get(v);
                    const vKlaar = uiterlijkKlaarMs(v);
                    return vKlaar - duurMs(vt);
                }),
            );
            const eigen = eigenDeadlineMs(taak);
            if (eigen != null) resultaat = Math.min(resultaat, eigen);
        }

        bezig.delete(id);
        klaar.set(id, resultaat);
        return resultaat;
    }

    function eigenDeadlineMs(t: Taak | undefined): number | null {
        if (!t) return null;
        /* Een eigen deadline is al een echt moment; de buffer hoort bij de
           uitlevering van de klus, niet bij een losse taak. */
        if (t.deadline) return Date.parse(t.deadline);
        if (t.eventId != null && uitlevering[t.eventId]) {
            return Date.parse(uitlevering[t.eventId]) - bufferMin * 60000;
        }
        return null;
    }

    /* Vooruit: wanneer kán deze taak op zijn vroegst beginnen? Nu, of zodra
       alles waar hij op wacht klaar is. */
    const vroegste = new Map<number, number>();
    const bezigVooruit = new Set<number>();

    function vroegsteStartMs(id: number): number {
        const gevonden = vroegste.get(id);
        if (gevonden != null) return gevonden;
        if (bezigVooruit.has(id)) return nuMs;   // cykel
        bezigVooruit.add(id);

        const taak = perId.get(id);
        let resultaat = nuMs;
        /* Een taak die al loopt is begonnen wanneer hij begonnen is. */
        if (taak?.gestartOp) resultaat = Date.parse(taak.gestartOp);

        for (const v of taak?.hangtAfVan ?? []) {
            if (!perId.has(v)) continue;
            resultaat = Math.max(resultaat, vroegsteStartMs(v) + duurMs(perId.get(v)));
        }

        bezigVooruit.delete(id);
        vroegste.set(id, resultaat);
        return resultaat;
    }

    /* Heeft deze taak, of iets verderop in de keten, überhaupt een deadline?
       Zo niet, dan is er niets om tegen af te rekenen. */
    function heeftDeadline(id: number, gezien = new Set<number>()): boolean {
        if (gezien.has(id)) return false;
        gezien.add(id);
        if (eigenDeadlineMs(perId.get(id)) != null) return true;
        return (volgers.get(id) ?? []).some((v) => heeftDeadline(v, gezien));
    }

    const uit = new Map<number, Terugrekening>();
    for (const t of taken) {
        const klaarMs = uiterlijkKlaarMs(t.id);
        const startMs = klaarMs - duurMs(t);
        const vroegMs = vroegsteStartMs(t.id);
        const metDeadline = heeftDeadline(t.id);
        const speling = metDeadline ? Math.round((startMs - vroegMs) / 60000) : null;

        uit.set(t.id, {
            taakId: t.id,
            vroegsteStart: new Date(vroegMs).toISOString(),
            uiterlijkStart: new Date(startMs).toISOString(),
            uiterlijkKlaar: new Date(klaarMs).toISOString(),
            margeMin: metDeadline ? Math.round((startMs - nuMs) / 60000) : null,
            teLaat: metDeadline && startMs < nuMs,
            spelingMin: speling,
            /* Kritiek = geen ruimte om te schuiven. Deze taken bepalen hoe
               lang de dag is; al het andere kan eromheen. */
            kritiek: speling != null && speling <= 0,
        });
    }
    return uit;
}

/**
 * Hoeveel tijd deze taak in de keten inneemt: aanzetten + opwarmen + werk +
 * wachten. Een onbekende duur telt als nul zodat de keten niet omvalt; het
 * scherm laat apart zien dat de duur onbekend is.
 */
export function duurMs(taak: Taak | undefined): number {
    if (!taak) return 0;
    const aanzet = taak.apparaat?.aanzetMin ?? 0;
    const opwarm = taak.apparaat?.opwarmMin ?? 0;
    return ((taak.actiefMin ?? 0) + (taak.passiefMin ?? 0) + aanzet + opwarm) * 60000;
}

/**
 * Sorteert op wie het meest haast heeft. Bij gelijke geschiktheid wint de
 * taak met de kleinste marge tot zijn deadline.
 */
export function opMarge(rekening: Map<number, Terugrekening>): (a: Taak, b: Taak) => number {
    return (a, b) => marge(rekening, a.id) - marge(rekening, b.id);
}

/** Geen deadline achteraan, niet vooraan. */
export function marge(rekening: Map<number, Terugrekening>, taakId: number): number {
    return rekening.get(taakId)?.margeMin ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Moet dit apparaat opgewarmd worden voordat deze taak kan beginnen?
 *
 * Nee als het binnen `warmBlijftMin` na het vorige gebruik is. Staat dat veld
 * leeg, dan koelt hij af — dat is de veilige kant, en meestal de goedkoopste:
 * liever twintig minuten opwarmen dan een uur stoken voor niets.
 */
export function moetOpwarmen(
    taak: Taak,
    vorigGebruikEind: string | null,
    startMoment: string,
): boolean {
    if (!taak.apparaat) return false;
    if ((taak.apparaat.opwarmMin ?? 0) <= 0) return false;
    if (vorigGebruikEind == null) return true;

    const warmBlijft = taak.apparaat.warmBlijftMin;
    if (warmBlijft == null) return true;

    const gatMin = (Date.parse(startMoment) - Date.parse(vorigGebruikEind)) / 60000;
    return gatMin > warmBlijft;
}
