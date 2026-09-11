/**
 * Schoonmaken vervalt.
 *
 * De Robot Coupe is acht minuten werk als je hem meteen doet, en een kwartier
 * schrobben als de mayonaise is ingedroogd. Schoonmaaktijd is dus geen
 * constante maar een aflopende zaak, en daarmee krijgt schoonmaak iets wat
 * het in mijn eerste model niet had: een **zachte deadline**.
 *
 * Twee soorten deadline, en ze mogen nooit door elkaar lopen:
 *
 *   hard   — de klant staat om vier uur op de stoep. Missen kan niet.
 *   zacht  — de Robot Coupe wordt duurder naarmate je wacht. Missen kan wel,
 *            het kost je alleen tijd.
 *
 * Een zachte deadline mag een harde nooit wegdrukken. Wél mag hij meewegen
 * bij het vullen van een gat, en dat is precies waar de winst zit: het gat
 * direct na het gebruik van een machine is de goedkoopste plek om hem schoon
 * te maken, en dat verschil is te rekenen in plaats van te vinden.
 */

import type { Apparaat } from './types';

export interface SchoonmaakOordeel {
    /** Wat het nú kost, in minuten. */
    duurMin: number | null;
    /** Zijn we al over het moment heen dat het makkelijk ging? */
    ingedroogd: boolean;
    /** Hoeveel minuten je nog hebt voordat het duurder wordt. `null` = onbekend. */
    nogGoedkoopMin: number | null;
    /** Hoeveel je bespaart door het nu te doen in plaats van straks. */
    winstMin: number;
    /** In mensentaal, voor op het scherm. */
    reden: string | null;
}

/**
 * Wat schoonmaken van dit apparaat nu kost.
 *
 * @param minutenSindsGebruik hoe lang geleden het apparaat klaar was.
 *   `null` betekent: niet gebruikt vandaag, dus geen haast.
 */
export function schoonmaakDuur(
    apparaat: Pick<Apparaat, 'naam' | 'schoonmaakMin'> & {
        schoonmaakVervalNaMin?: number | null;
        schoonmaakKoudMin?: number | null;
    },
    minutenSindsGebruik: number | null,
): SchoonmaakOordeel {
    const vers = apparaat.schoonmaakMin ?? null;
    if (vers == null) {
        return { duurMin: null, ingedroogd: false, nogGoedkoopMin: null, winstMin: 0, reden: null };
    }

    const vervalNa = apparaat.schoonmaakVervalNaMin ?? null;
    const koud = apparaat.schoonmaakKoudMin ?? null;

    /* Geen verval bekend: dan is de vaste tijd het beste wat we hebben, en
       doen we niet alsof we meer weten. */
    if (vervalNa == null || koud == null || koud <= vers) {
        return { duurMin: vers, ingedroogd: false, nogGoedkoopMin: null, winstMin: 0, reden: null };
    }

    if (minutenSindsGebruik == null) {
        return {
            duurMin: vers, ingedroogd: false, nogGoedkoopMin: null, winstMin: 0,
            reden: null,
        };
    }

    const ingedroogd = minutenSindsGebruik >= vervalNa;
    const nogGoedkoop = ingedroogd ? 0 : Math.round(vervalNa - minutenSindsGebruik);

    return {
        duurMin: ingedroogd ? koud : vers,
        ingedroogd,
        nogGoedkoopMin: ingedroogd ? 0 : nogGoedkoop,
        winstMin: ingedroogd ? 0 : koud - vers,
        reden: ingedroogd
            ? `${apparaat.naam} staat al ${Math.round(minutenSindsGebruik)} min — schoonmaken kost nu ${koud} in plaats van ${vers} min`
            : `nu ${vers} min, over ${nogGoedkoop} min wordt het ${koud}`,
    };
}

/**
 * Hoe zwaar deze schoonmaak meeweegt bij het vullen van een gat.
 *
 * Uitgedrukt als een marge in minuten, zodat hij naast echte deadlines kan
 * staan in dezelfde sortering. Maar bewust **nooit negatief**: een zachte
 * deadline mag een harde niet inhalen, hoe duur hij ook wordt. Wie zijn
 * uitlevering mist omdat de keukenmachine anders moeilijker schoon te maken
 * was, heeft het verkeerde probleem opgelost.
 */
export function zachteMarge(oordeel: SchoonmaakOordeel): number {
    if (oordeel.nogGoedkoopMin == null) return Number.MAX_SAFE_INTEGER;
    return Math.max(0, oordeel.nogGoedkoopMin);
}

/**
 * Zou je dit apparaat nú moeten schoonmaken?
 *
 * Ja als het past in het gat, en als je er tijd mee wint. Nee als het apparaat
 * straks weer nodig is — een schone machine die je tien minuten later weer
 * vies maakt is weggegooide tijd.
 */
export function loontSchoonmakenNu(opties: {
    oordeel: SchoonmaakOordeel;
    gatMin: number;
    volgendGebruikOverMin: number | null;
}): { doen: boolean; reden: string } {
    const { oordeel, gatMin, volgendGebruikOverMin } = opties;

    if (oordeel.duurMin == null) {
        return { doen: false, reden: 'schoonmaaktijd onbekend' };
    }
    if (oordeel.duurMin > gatMin) {
        return { doen: false, reden: `past niet in het gat van ${Math.round(gatMin)} min` };
    }
    if (volgendGebruikOverMin != null && volgendGebruikOverMin < oordeel.duurMin) {
        return { doen: false, reden: 'apparaat is straks alweer nodig' };
    }
    if (oordeel.winstMin > 0) {
        return { doen: true, reden: `nu doen scheelt ${oordeel.winstMin} min` };
    }
    return { doen: true, reden: 'past in de wachttijd' };
}
