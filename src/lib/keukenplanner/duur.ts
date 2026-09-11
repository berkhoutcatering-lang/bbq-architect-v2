/**
 * Duur uitrekenen — waar tijd vandaan komt en wat hij van je vraagt.
 *
 * Twee formules, en één regel die belangrijker is dan allebei:
 * **onbekend is geen nul**. Een stap zonder duur wordt niet als 0 minuten
 * ingepland maar krijgt `null`, en valt daarmee buiten het gatenvullen.
 * Dat is dezelfde regel als bij kostprijzen: een leeg veld verslaat een
 * schatting die zich voordoet als feit.
 */

import type { Aandacht, Taak } from './types';

/** Wat er in `recipe_steps` staat, voor zover de duurberekening het nodig heeft. */
export interface StapDuurVelden {
    duur_vast_min?: number | null;
    duur_per_eenheid_min?: number | null;
    duur_actief_min?: number | null;
    duur_passief_min?: number | null;
    passief_ref_kg?: number | null;
    herhaal_interval_min?: number | null;
    herhaal_duur_min?: number | null;
    toezicht_nodig?: boolean | null;
}

/**
 * Actieve tijd: het klaarzetten schaalt niet mee met de kilo's, het snijden wel.
 *
 *   actief = duur_vast_min + duur_per_eenheid_min × hoeveelheid
 *
 * Staat alleen het oude `duur_actief_min` gevuld, dan is dat de hele duur —
 * de splitsing in vast en per eenheid mag pas gemaakt worden als er metingen
 * zijn bij duidelijk verschillende hoeveelheden (zie schatter.ts).
 */
export function actieveDuurMin(stap: StapDuurVelden, hoeveelheid: number | null | undefined): number | null {
    const vast = stap.duur_vast_min ?? null;
    const perEenheid = stap.duur_per_eenheid_min ?? null;

    if (vast == null && perEenheid == null) {
        return stap.duur_actief_min ?? null;
    }
    if (perEenheid != null && perEenheid > 0) {
        if (hoeveelheid == null) {
            /* Er is een tarief per eenheid maar we weten de hoeveelheid niet.
               Dan is de uitkomst onbekend — niet "dan maar alleen het vaste
               deel", want dat is systematisch te laag. */
            return null;
        }
        return round1((vast ?? 0) + perEenheid * hoeveelheid);
    }
    return vast;
}

/**
 * Passieve tijd. Schaalt niet met het aantal — drie briskets naast elkaar in
 * de smoker duren samen niet langer dan één — maar wel met het formaat van
 * het stuk: acht kilo rookt langer dan vier.
 *
 *   passief = referentieduur × (stukgewicht ÷ passief_ref_kg)
 *
 * Ontbreekt een van beide, dan blijft de referentieduur staan. Niet
 * stilletjes vermenigvuldigen met een aangenomen gewicht.
 *
 * De uitkomst is en blijft een **verwachting**: een gaarstap eindigt op
 * kerntemperatuur, niet op de klok. Zie §2.6 van het bouwplan.
 */
export function passieveDuurMin(stap: StapDuurVelden, stukGewichtKg: number | null | undefined): number | null {
    const basis = stap.duur_passief_min ?? null;
    if (basis == null) return null;

    const ref = stap.passief_ref_kg ?? null;
    if (ref == null || ref <= 0 || stukGewichtKg == null || stukGewichtKg <= 0) {
        return basis;
    }
    return Math.round(basis * (stukGewichtKg / ref));
}

/**
 * Wat dit blok van de kok vraagt.
 *
 * De volgorde is niet willekeurig: bewaakt wint van gebonden, en gebonden van
 * vrij. Een stap die zowel actief werk als wachten heeft telt als actief —
 * het scherm toont dan het werk, en het wachten komt erna als eigen blok.
 */
export function aandachtVan(stap: StapDuurVelden, actiefMin: number | null, passiefMin: number | null): Aandacht {
    if (actiefMin != null && actiefMin > 0) return 'actief';
    if (passiefMin == null || passiefMin <= 0) return 'actief';
    if (stap.toezicht_nodig) return 'passief_bewaakt';
    if (stap.herhaal_interval_min != null && stap.herhaal_duur_min != null) return 'passief_gebonden';
    return 'passief_vrij';
}

/**
 * Hoeveel van een passief blok echt vrij is.
 *
 * Bij gebonden passief (elk half uur natspuiten) is de vrije ruimte niet het
 * hele blok maar het interval: je kunt hooguit tot de volgende spuitbeurt weg,
 * en dan alleen met werk op hetzelfde station. Bij bewaakt passief is er geen
 * vrije ruimte.
 */
export function vrijeRuimteMin(taak: Pick<Taak, 'passiefMin' | 'herhaalIntervalMin' | 'herhaalDuurMin' | 'toezichtNodig'>): number {
    const passief = taak.passiefMin ?? 0;
    if (passief <= 0) return 0;
    if (taak.toezichtNodig) return 0;

    const interval = taak.herhaalIntervalMin ?? null;
    const handeling = taak.herhaalDuurMin ?? 0;
    if (interval != null && interval > 0) {
        return Math.max(0, Math.min(passief, interval - handeling));
    }
    return passief;
}

/**
 * Totale tijd die een taak in beslag neemt op de tijdlijn: aanzetten +
 * opwarmen + werk + wachten. Onbekende stukken tellen als nul zodat de
 * tijdlijn niet omvalt, maar `duurOnbekend` vertelt of dat gebeurd is.
 */
export function doorlooptijdMin(taak: Pick<Taak, 'actiefMin' | 'passiefMin' | 'apparaat'>, apparaatIsKoud: boolean): {
    totaalMin: number;
    duurOnbekend: boolean;
} {
    const aanzet = apparaatIsKoud ? (taak.apparaat?.aanzetMin ?? 0) : 0;
    const opwarm = apparaatIsKoud ? (taak.apparaat?.opwarmMin ?? 0) : 0;
    const actief = taak.actiefMin;
    const passief = taak.passiefMin;
    return {
        totaalMin: aanzet + opwarm + (actief ?? 0) + (passief ?? 0),
        duurOnbekend: actief == null && passief == null,
    };
}

/** "11:48" voor een resterende tijd in minuten. Boven het uur telt hij door. */
export function formatDuur(minuten: number): string {
    const totaal = Math.max(0, Math.round(minuten * 60));
    const u = Math.floor(totaal / 3600);
    const m = Math.floor((totaal % 3600) / 60);
    const s = totaal % 60;
    if (u > 0) return `${u}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
}

/** "20m", "1u30" — voor de STRAKS-regels waar geen seconde nodig is. */
export function formatKort(minuten: number): string {
    const m = Math.round(minuten);
    if (m < 60) return `${m}m`;
    const u = Math.floor(m / 60);
    const rest = m % 60;
    return rest === 0 ? `${u}u` : `${u}u${pad(rest)}`;
}

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}
