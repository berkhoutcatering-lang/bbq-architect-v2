/**
 * Het plan — alles bij elkaar, en dan als kant-en-klare tekst voor het scherm.
 *
 * Het wandscherm rekent en formatteert niets. Het toont wat hier uitkomt.
 * Dat is geen luiheid maar een ontwerpregel: zodra het scherm zelf gaat
 * rekenen, kunnen scherm en planner uit elkaar gaan lopen, en dan toont een
 * ding dat aan de muur hangt iets anders dan wat het systeem denkt.
 */

import type { Keukenscherm, Melding, Taak, TijdlijnRegel, Aandacht } from './types';
import { formatDuur, formatKort, vrijeRuimteMin } from './duur';
import { terugrekenen, marge, type TerugrekenInvoer } from './terugrekenen';
import { vulGaten } from './gatenvullen';
import type { CapaciteitsProbleem } from './batchen';

export interface PlanInvoer extends TerugrekenInvoer {
    /** Openstaande HACCP-registraties, voor de statusbalk. */
    haccpOpen?: number;
    /** Meldingen die van buiten komen: verstoringen, herplanningen, capaciteit. */
    extraMeldingen?: Melding[];
    capaciteitsProblemen?: CapaciteitsProbleem[];
    /** Staan er fysieke afstanden in de database? Zo niet, dan zegt het dat. */
    afstandenBekend?: boolean;
}

/** Hoeveel regels er onder STRAKS passen. Meer past niet op één beeld. */
export const STRAKS_REGELS = 5;
/** Meer dan drie meldingen leest niemand vanaf drie meter. */
export const MAX_MELDINGEN = 3;

export function bouwScherm(invoer: PlanInvoer): Keukenscherm {
    const { taken, nu } = invoer;
    const nuMs = Date.parse(nu);
    const rekening = terugrekenen(invoer);
    /* Geen deadline telt als "geen haast", niet als "nu meteen". */
    const margeMin = new Map([...rekening].map(([id]) => [id, marge(rekening, id)]));

    const open = taken.filter((t) => t.status !== 'done' && t.status !== 'skipped');
    const lopend = open.find((t) => t.status === 'in_progress') ?? null;

    const gaten = vulGaten({ taken: open, margeMin, nu });

    /* Waar staat het scherm op? Loopt er iets waar hij mee bezig is, dan
       "bezig". Loopt er iets passiefs, dan is hij vrij en hoort er werk in
       dat gat te staan. Is er niets, dan is de dag klaar. */
    const nuTaak = kiesNu(lopend, open, margeMin, nuMs);
    const stand: Keukenscherm['stand'] = nuTaak == null
        ? 'leeg'
        : aandachtVanTaak(nuTaak) === 'actief' ? 'actief' : 'vrij';

    const meldingen: Melding[] = [
        ...(invoer.extraMeldingen ?? []),
        ...(invoer.capaciteitsProblemen ?? []).map(capaciteitsMelding),
    ];

    /* Eerlijk zijn over wat er nog niet is. Beter dan een matrix vol
       geschatte meters die eruitziet als een meting. */
    if (invoer.afstandenBekend === false) {
        meldingen.push({
            id: 'afstanden-onbekend',
            ernst: 'info',
            kop: 'Looptijden tellen nog niet mee',
            uitleg: 'De afstanden tussen de stations zijn nog niet opgemeten.',
        });
    }

    for (const t of open) {
        if (t.actiefMin == null && t.passiefMin == null) {
            meldingen.push({
                id: `duur-onbekend-${t.id}`,
                ernst: 'info',
                kop: `Duur onbekend: ${t.titel}`,
                uitleg: 'Deze stap staat wel in de dag maar telt niet mee in de tijdlijn.',
            });
        }
    }

    return {
        stand,
        nu: bouwNu(nuTaak, gaten, nuMs),
        straks: bouwStraks(open, nuTaak, rekening, nuMs),
        meldingen: meldingen.slice(0, MAX_MELDINGEN),
        status: {
            tijd: klok(nuMs),
            takenOpen: open.length,
            haccpOpen: invoer.haccpOpen ?? 0,
            gegenereerdOp: new Date(nuMs).toISOString(),
        },
    };
}

/**
 * Welke taak staat er groot op het scherm?
 *
 * Een lopende taak wint altijd — die verspringt nooit. Anders de taak met de
 * kleinste marge die nu al mag beginnen.
 */
function kiesNu(lopend: Taak | null, open: Taak[], margeMin: Map<number, number>, nuMs: number): Taak | null {
    if (lopend) return lopend;
    const startbaar = open
        .filter((t) => t.status !== 'blocked')
        .filter((t) => t.geplandOp == null || Date.parse(t.geplandOp) <= nuMs + 30 * 60000);
    if (startbaar.length === 0) return null;
    return [...startbaar].sort(opMargeGetal(margeMin))[0];
}

function opMargeGetal(margeMin: Map<number, number>) {
    return (a: Taak, b: Taak) =>
        (margeMin.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (margeMin.get(b.id) ?? Number.MAX_SAFE_INTEGER);
}

/* Wie geen deadline heeft, hoort niet vooraan. */

function bouwNu(taak: Taak | null, gaten: ReturnType<typeof vulGaten>, nuMs: number): Keukenscherm['nu'] {
    if (taak == null) {
        return {
            taakId: null, kop: 'Niets meer voor vandaag', regel: null, toelichting: null,
            station: null, aandacht: 'actief', duurBron: 'geschat', resterend: null,
            bezigSinds: null, vanMin: null, tempDoelC: null, wachtOp: null, wachtNog: null,
        };
    }

    const aandacht = aandachtVanTaak(taak);

    /* Bij een passieve stap toont NU niet het wachten maar het werk dat in de
       wachttijd gedaan wordt, met klein ernaast hoeveel tijd de smoker nog
       heeft. Dat is de hele winst van dit systeem in één beeld. */
    if (aandacht !== 'actief') {
        const gat = gaten.find((g) => g.wachtTaakId === taak.id);
        const eerste = gat?.suggesties[0] ?? null;
        const nogMin = restMin(taak, nuMs);
        return {
            taakId: eerste?.taakId ?? taak.id,
            kop: eerste?.titel ?? taak.titel,
            regel: eerste ? eerste.reden : (taak.toelichting ?? null),
            toelichting: eerste ? null : (taak.toelichting ?? null),
            station: taak.stationNaam ?? null,
            aandacht,
            duurBron: taak.duurBron,
            resterend: eerste ? formatDuur(eerste.duurMin) : (nogMin == null ? null : formatDuur(nogMin)),
            bezigSinds: null,
            vanMin: eerste?.duurMin ?? taak.passiefMin ?? null,
            tempDoelC: taak.tempDoelC ?? null,
            wachtOp: taak.titel,
            wachtNog: nogMin == null ? null : formatKort(nogMin),
        };
    }

    const nogMin = restMin(taak, nuMs);
    const bezigMin = taak.gestartOp ? (nuMs - Date.parse(taak.gestartOp)) / 60000 : null;

    return {
        taakId: taak.id,
        kop: taak.titel,
        regel: taak.hoeveelheid != null
            ? `${taak.hoeveelheid} ${taak.eenheid ?? ''}${taak.gerechtNaam ? ` · ${taak.gerechtNaam}` : ''}`.trim()
            : (taak.gerechtNaam ?? null),
        toelichting: taak.toelichting ?? null,
        station: taak.stationNaam ?? null,
        aandacht,
        duurBron: taak.duurBron,
        resterend: nogMin == null ? null : formatDuur(nogMin),
        bezigSinds: bezigMin == null ? null : formatDuur(bezigMin),
        vanMin: taak.actiefMin ?? null,
        tempDoelC: taak.tempDoelC ?? null,
        wachtOp: null,
        wachtNog: null,
    };
}

function bouwStraks(
    open: Taak[],
    nuTaak: Taak | null,
    rekening: ReturnType<typeof terugrekenen>,
    nuMs: number,
): TijdlijnRegel[] {
    return open
        .filter((t) => t.id !== nuTaak?.id)
        .sort((a, b) => {
            const ta = a.geplandOp ? Date.parse(a.geplandOp) : Number.MAX_SAFE_INTEGER;
            const tb = b.geplandOp ? Date.parse(b.geplandOp) : Number.MAX_SAFE_INTEGER;
            if (ta !== tb) return ta - tb;
            return marge(rekening, a.id) - marge(rekening, b.id);
        })
        .slice(0, STRAKS_REGELS)
        .map((t) => {
            /* Tijdkritisch werk ziet er anders uit dan werk dat kan schuiven.
               Een vast tijdstip betekent: dit moet dán. */
            const vast = t.geplandOp != null && (t.tempDoelC != null || t.apparaat != null || t.deadline != null);
            return {
                taakId: t.id,
                tijd: vast && t.geplandOp
                    ? klok(Date.parse(t.geplandOp))
                    : `~ ${formatKort((t.actiefMin ?? t.passiefMin ?? 0))}`,
                tijdIsVast: vast,
                titel: t.titel,
                waar: t.apparaat
                    ? `${t.apparaat.naam}${t.tempDoelC != null ? ` · ${t.tempDoelC} °C` : ''}`
                    : (t.stationNaam ?? null),
                aandacht: aandachtVanTaak(t),
                duurBron: t.duurBron,
            };
        });
}

export function aandachtVanTaak(taak: Taak): Aandacht {
    if ((taak.actiefMin ?? 0) > 0) return 'actief';
    if ((taak.passiefMin ?? 0) <= 0) return 'actief';
    if (taak.toezichtNodig) return 'passief_bewaakt';
    if (taak.herhaalIntervalMin != null && taak.herhaalDuurMin != null) return 'passief_gebonden';
    return 'passief_vrij';
}

/**
 * Hoeveel er nog te gaan is.
 *
 * Een bevestigd eind wint altijd van de berekening — dat is de thermometer of
 * de kok met een prikker. Zolang dat er niet is plant de planner op het
 * verwachte eind en zegt het scherm erbij dat het een verwachting is.
 */
export function restMin(taak: Taak, nuMs: number): number | null {
    const eind = taak.bevestigdEind ?? taak.verwachtEind ?? null;
    if (eind != null) return Math.max(0, (Date.parse(eind) - nuMs) / 60000);

    const totaal = (taak.actiefMin ?? 0) + (taak.passiefMin ?? 0);
    if (totaal <= 0) return null;
    if (taak.gestartOp == null) return totaal;
    const bezig = (nuMs - Date.parse(taak.gestartOp)) / 60000;
    return Math.max(0, totaal - bezig);
}

function capaciteitsMelding(p: CapaciteitsProbleem): Melding {
    return {
        id: `capaciteit-${p.soort}-${p.taakIds.join('-')}`,
        ernst: p.soort === 'past_niet' ? 'alarm' : 'waarschuwing',
        kop: p.soort === 'past_niet'
            ? `Past niet in ${p.apparaatNaam}`
            : p.soort === 'gesplitst'
                ? `Twee ladingen in ${p.apparaatNaam}`
                : `Capaciteit ${p.apparaatNaam} onbekend`,
        uitleg: p.tekst,
        verwacht: p.soort === 'gesplitst' ? 'Zorg dat er koelruimte vrij is voor de eerste lading.' : null,
    };
}

/**
 * Melding bij een herplanning die uit een waarneming volgt.
 *
 * Eén regel: wat er gebeurd is, wat het betekent, en of het nog haalbaar is.
 * Een dag die stilletjes een uur opschuift kost het vertrouwen in het scherm,
 * en daarmee het hele systeem.
 */
export function herplanMelding(opties: {
    wat: string;
    verschovenTaken: number;
    haalbaar: boolean;
    uitleveringKlok: string;
    spelingMin?: number | null;
}): Melding {
    const { wat, verschovenTaken, haalbaar, uitleveringKlok, spelingMin } = opties;
    return {
        id: `herplan-${Date.now()}`,
        ernst: haalbaar ? 'waarschuwing' : 'alarm',
        kop: wat,
        uitleg: `${verschovenTaken} ${verschovenTaken === 1 ? 'taak' : 'taken'} verschoven.`,
        verwacht: haalbaar
            ? `Uitlevering ${uitleveringKlok} blijft haalbaar${spelingMin != null ? ` — ${formatKort(spelingMin)} speling` : ''}.`
            : `Uitlevering ${uitleveringKlok} wordt niet gehaald.`,
    };
}

function klok(ms: number): string {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export { vrijeRuimteMin };
