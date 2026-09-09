/**
 * Gaten vullen — waar dit systeem zijn minuten wint.
 *
 * Elk blok passieve tijd is ruimte. Zoek daarin actieve taken die passen
 * zonder een latere deadline te raken.
 *
 * Wat de eerste versie fout had, en wat uit echte recepten kwam: **passief
 * betekent niet altijd weg kunnen lopen.** Bij de oerham en de spareribs
 * staat "garen, en elk half uur natspuiten". Dat is een passief blok van
 * tweeënhalf uur waarin je aan de plek gebonden bent. Stuur je iemand dan
 * naar de andere kant van de keuken, dan mist hij zijn spuitbeurt.
 *
 * Daarom drie soorten passief in plaats van één:
 *
 *   vrij      — rusten, marineren, opwarmen → alles wat past
 *   gebonden  — elk half uur natspuiten     → kort werk op hetzelfde station
 *   bewaakt   — toezicht_nodig              → niets
 *
 * De oude grens van vier uur is vervallen. Die stond op duur ("bij een
 * overnight-pekel sta je er niet bij"), maar de vraag is niet hoe lang het
 * duurt — de vraag is of je erbij bent. Een gaarstap van vijf uur midden op
 * de dag is prima vulbaar; een pekel van twaalf uur 's nachts niet, en dat
 * blijkt uit het tijdstip en niet uit de lengte.
 */

import type { Taak } from './types';
import { vrijeRuimteMin, formatKort } from './duur';

export interface Suggestie {
    taakId: number;
    titel: string;
    duurMin: number;
    /** Leesbare reden — het scherm mag geen black box zijn. */
    reden: string;
}

export interface Gat {
    /** De passieve taak waar dit gat in zit. */
    wachtTaakId: number;
    startISO: string;
    /** Hoeveel er echt vrij is; bij gebonden passief is dat het interval. */
    ruimteMin: number;
    gebondenAanStationId: number | null;
    suggesties: Suggestie[];
}

export interface VulInvoer {
    /** Alle taken van de dag, met hun geplande start. */
    taken: Taak[];
    /** Marge per taak, uit terugrekenen.ts. */
    margeMin: Map<number, number>;
    nu: string;
    /** Buiten deze uren staat de kok niet in de keuken. */
    werkdag?: { vanUur: number; totUur: number };
}

const STANDAARD_WERKDAG = { vanUur: 6, totUur: 22 };
/** Onder deze rest is er niets zinnigs meer te doen. */
const MINIMUM_REST_MIN = 5;

/**
 * Zoek per passief blok werk dat erin past.
 *
 * Greedy op deadline: wie het meest haast heeft mag eerst. Een taak wordt
 * hooguit één keer voorgesteld.
 */
export function vulGaten(invoer: VulInvoer): Gat[] {
    const { taken, margeMin, nu } = invoer;
    const werkdag = invoer.werkdag ?? STANDAARD_WERKDAG;

    const passief = taken.filter((t) => (t.passiefMin ?? 0) > 0 && t.geplandOp != null);
    const actief = taken.filter((t) => (t.actiefMin ?? 0) > 0 && t.status !== 'done' && t.status !== 'skipped');

    const geclaimd = new Set<number>();
    const gaten: Gat[] = [];

    for (const wacht of [...passief].sort(opStart)) {
        const ruimte = vrijeRuimteMin(wacht);
        if (ruimte < MINIMUM_REST_MIN) continue;

        const startMs = Date.parse(wacht.geplandOp as string) + (wacht.actiefMin ?? 0) * 60000;
        if (!binnenWerkdag(startMs, werkdag)) continue;
        if (startMs < Date.parse(nu) - 60 * 60000) continue;

        const gebonden = wacht.herhaalIntervalMin != null ? (wacht.stationId ?? null) : null;

        let rest = ruimte;
        const suggesties: Suggestie[] = [];

        const kandidaten = actief
            .filter((k) => !geclaimd.has(k.id) && k.id !== wacht.id)
            .filter((k) => (k.actiefMin ?? 0) <= rest)
            /* Bij gebonden passief mag alleen werk op hetzelfde station. */
            .filter((k) => gebonden == null || k.stationId === gebonden)
            /* Nooit iets naar voren trekken wat dan zijn eigen deadline raakt. */
            .filter((k) => (margeMin.get(k.id) ?? 0) >= 0)
            .sort((a, b) => (margeMin.get(a.id) ?? 0) - (margeMin.get(b.id) ?? 0));

        for (const k of kandidaten) {
            const duur = k.actiefMin ?? 0;
            if (duur > rest) continue;
            geclaimd.add(k.id);
            suggesties.push({
                taakId: k.id,
                titel: k.titel,
                duurMin: duur,
                reden: gebonden != null
                    ? `past in de ${formatKort(ruimte)} tussen twee spuitbeurten, en staat op hetzelfde station`
                    : `past in de ${formatKort(ruimte)} wachttijd`,
            });
            rest -= duur;
            if (rest < MINIMUM_REST_MIN) break;
        }

        if (suggesties.length > 0) {
            gaten.push({
                wachtTaakId: wacht.id,
                startISO: new Date(startMs).toISOString(),
                ruimteMin: ruimte,
                gebondenAanStationId: gebonden,
                suggesties,
            });
        }
    }

    return gaten;
}

/**
 * Mag een apparaat schoongemaakt worden in dit gat?
 *
 * Alleen als het die dag niet meer nodig is, of als de schoonmaaktijd binnen
 * het gat past vóór het volgende gebruik. Een schone Robot Coupe die je
 * tien minuten later weer vies maakt is verspilde tijd.
 */
export function magSchoonmaken(
    schoonmaakMin: number,
    gatMin: number,
    volgendGebruikOverMin: number | null,
): boolean {
    if (schoonmaakMin > gatMin) return false;
    if (volgendGebruikOverMin == null) return true;
    return schoonmaakMin <= volgendGebruikOverMin;
}

function opStart(a: Taak, b: Taak): number {
    return Date.parse(a.geplandOp ?? '') - Date.parse(b.geplandOp ?? '');
}

function binnenWerkdag(ms: number, werkdag: { vanUur: number; totUur: number }): boolean {
    const uur = new Date(ms).getHours();
    return uur >= werkdag.vanUur && uur < werkdag.totUur;
}
