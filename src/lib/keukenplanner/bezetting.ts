/**
 * Eén pit tegelijk.
 *
 * `terugrekenen` weet alles van volgorde, deadlines en opwarmtijd, maar niets
 * van drukte: het rekent uit wanneer een taak op zijn vroegst *kán* beginnen,
 * niet of het toestel dan vrij is. Bij BBQ viel dat niet op — een smoker draait
 * zes uur onbewaakt en er ligt één ding op. Bij een Italiaans kookboek staat
 * álles in de rij voor één inductieplaat van 28 centimeter, en dan geeft de
 * planner je een dag die er goed uitziet en niet uit te voeren is.
 *
 * Wat hier gebeurt is een wachtrij per apparaat. De taken worden op volgorde van
 * urgentie langsgelopen en elk krijgt de eerste plek waar zijn toestel vrij is.
 * Dat is lijstplanning: niet gegarandeerd de allerbeste indeling, wél altijd een
 * uitvoerbare, en te volgen door een mens die ernaar kijkt. Een keuken die niet
 * begrijpt waaróm iets later staat, vertrouwt de planning niet.
 *
 * Wat er níet gebeurt: taken verplaatsen naar een ander toestel, of een taak
 * opknippen. Dat is een beslissing over het gerecht en niet over de agenda.
 *
 * Puur en zonder database. `nu` gaat er altijd in, nooit `new Date()`.
 */

/** Wat de wachtrij van een taak moet weten. */
export interface BezettingsTaak {
    id: number;
    /** Null = geen apparaat, dus nooit in de weg. */
    apparaatId: number | null;
    /** Hoeveel er tegelijk op dit toestel kunnen. `null` = onbekend → één. */
    concurrentJobs?: number | null;
    /** Houdt dit toestel alleen bezet als het exclusief is. */
    exclusiefBezet?: boolean;
    /** Vroegste start volgens terugrekenen, als ISO-tijd. */
    vroegsteStart: string;
    /** Hoe lang het toestel bezet is: werk plus wachten. */
    duurMin: number;
    /** Wanneer het klaar moet zijn. `null` = geen deadline. */
    uiterlijkKlaar: string | null;
}

export interface Plek {
    taakId: number;
    /** Wanneer hij echt kan beginnen, nadat het toestel vrij is. */
    start: string;
    eind: string;
    /** Hoeveel later dan zijn vroegste start, door drukte op het toestel. */
    wachtOpApparaatMin: number;
    /** Komt hij hierdoor te laat? Alleen zinvol met een deadline. */
    teLaat: boolean;
}

export interface Botsing {
    apparaatId: number;
    /** De taken die op elkaar moeten wachten, in de volgorde waarin ze gaan. */
    taakIds: number[];
    /** Hoeveel de laatste in de rij moet wachten. */
    langsteWachtMin: number;
    /** Taken die door dit wachten hun deadline niet halen. */
    teLaat: number[];
}

export interface Bezetting {
    plekken: Map<number, Plek>;
    botsingen: Botsing[];
}

const MS = 60_000;

/**
 * Geef elke taak de eerste plek waar zijn toestel vrij is.
 *
 * Volgorde van behandeling: wie het krapst zit gaat eerst. Een taak zonder
 * deadline gaat achteraan — geen deadline is geen haast, en dat is iets anders
 * dan een marge van nul. Diezelfde fout stond op de eerste demodag groot op het
 * wandscherm: een losse schoonmaaktaak boven de brisket.
 */
export function verdeelOverApparaten(taken: BezettingsTaak[]): Bezetting {
    const opVolgorde = [...taken].sort((a, b) => {
        const da = a.uiterlijkKlaar == null ? Infinity : Date.parse(a.uiterlijkKlaar);
        const db = b.uiterlijkKlaar == null ? Infinity : Date.parse(b.uiterlijkKlaar);
        if (da !== db) return da - db;
        /* Gelijke deadline: wie eerder kan, gaat eerder. Anders op id, zodat
           dezelfde invoer altijd dezelfde uitkomst geeft. */
        const va = Date.parse(a.vroegsteStart);
        const vb = Date.parse(b.vroegsteStart);
        return va !== vb ? va - vb : a.id - b.id;
    });

    /* Per apparaat: de bezette blokken, op volgorde. */
    const bezet = new Map<number, Array<{ van: number; tot: number }>>();
    const plekken = new Map<number, Plek>();
    const rijPerApparaat = new Map<number, number[]>();

    for (const taak of opVolgorde) {
        const vroegste = Date.parse(taak.vroegsteStart);
        const duurMs = Math.max(0, taak.duurMin) * MS;

        const houdtBezet = taak.apparaatId != null && taak.exclusiefBezet !== false;
        const start = houdtBezet
            ? eersteVrijeMoment(bezet.get(taak.apparaatId!) ?? [], vroegste, duurMs, aantalPlekken(taak))
            : vroegste;

        const eind = start + duurMs;

        if (houdtBezet) {
            const lijst = bezet.get(taak.apparaatId!) ?? [];
            lijst.push({ van: start, tot: eind });
            lijst.sort((a, b) => a.van - b.van);
            bezet.set(taak.apparaatId!, lijst);

            const rij = rijPerApparaat.get(taak.apparaatId!) ?? [];
            rij.push(taak.id);
            rijPerApparaat.set(taak.apparaatId!, rij);
        }

        const wacht = Math.round((start - vroegste) / MS);
        plekken.set(taak.id, {
            taakId: taak.id,
            start: new Date(start).toISOString(),
            eind: new Date(eind).toISOString(),
            wachtOpApparaatMin: wacht,
            teLaat: taak.uiterlijkKlaar != null && eind > Date.parse(taak.uiterlijkKlaar),
        });
    }

    /* Een botsing melden we alleen waar er écht op elkaar gewacht wordt. Twee
       taken die toevallig hetzelfde toestel delen maar elkaar niet raken is
       geen nieuws. */
    const botsingen: Botsing[] = [];
    for (const [apparaatId, taakIds] of rijPerApparaat) {
        const wachtend = taakIds.filter((id) => (plekken.get(id)?.wachtOpApparaatMin ?? 0) > 0);
        if (wachtend.length === 0) continue;

        botsingen.push({
            apparaatId,
            taakIds,
            langsteWachtMin: Math.max(...wachtend.map((id) => plekken.get(id)!.wachtOpApparaatMin)),
            teLaat: taakIds.filter((id) => plekken.get(id)?.teLaat),
        });
    }

    return { plekken, botsingen };
}

/** Onbekende gelijktijdigheid telt als één. Dat is de veilige kant van de fout. */
function aantalPlekken(taak: BezettingsTaak): number {
    const n = taak.concurrentJobs;
    return n != null && n > 0 ? n : 1;
}

/**
 * Het eerste moment vanaf `vroegste` waarop er ruimte is voor nog een taak.
 *
 * Bij één plek is dat simpel: achter het laatste blok dat eroverheen valt. Bij
 * meer plekken tellen we hoeveel blokken er op elk kandidaat-moment lopen, en
 * schuiven op tot er eentje afloopt.
 */
function eersteVrijeMoment(
    blokken: Array<{ van: number; tot: number }>,
    vroegste: number,
    duurMs: number,
    plekken: number,
): number {
    if (blokken.length === 0 || duurMs === 0) return vroegste;

    /* Kandidaat-momenten: het vroegste moment, en het einde van elk blok. Een
       plek komt nooit midden in een blok vrij. */
    const kandidaten = [vroegste, ...blokken.map((b) => b.tot)]
        .filter((t) => t >= vroegste)
        .sort((a, b) => a - b);

    for (const moment of kandidaten) {
        const overlappend = blokken.filter((b) => b.van < moment + duurMs && b.tot > moment).length;
        if (overlappend < plekken) return moment;
    }

    /* Kan niet voorkomen zolang blokken eindig zijn, maar liever een eerlijk
       laatste moment dan een oneindige lus. */
    return Math.max(vroegste, ...blokken.map((b) => b.tot));
}

/**
 * Eén regel over de drukte op een toestel, in mensentaal.
 *
 * "De inductieplaat is één pit: drie taken staan in de rij, de laatste begint
 * 95 minuten later." Dat is iets anders dan een foutmelding — het is de dag
 * zoals hij is, en het is precies de reden om iets naar de dag ervoor te
 * schuiven.
 */
export function botsingMelding(botsing: Botsing, apparaatNaam: string, plekken: number): string {
    const aantal = botsing.taakIds.length;
    const kop = plekken === 1
        ? `De ${apparaatNaam} kan er één tegelijk`
        : `De ${apparaatNaam} kan er ${plekken} tegelijk`;

    const staart = botsing.teLaat.length > 0
        ? ` — ${botsing.teLaat.length} ${botsing.teLaat.length === 1 ? 'taak haalt' : 'taken halen'} de deadline niet`
        : `, de laatste begint ${botsing.langsteWachtMin} min later`;

    return `${kop}: ${aantal} taken in de rij${staart}.`;
}
