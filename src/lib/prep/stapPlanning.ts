/**
 * stapPlanning — van receptstap naar geplande taak.
 *
 * Golf 2 uit docs/agent-architectuur-plan.md hoofdstuk 8. De ontleder schrijft
 * `recipe_steps`: per handeling handtijd, wachttijd, een groepeersleutel en de
 * plaats waar het gebeurt. Die tabel stond tot nu toe los van de planning die
 * draait. Dit bestand is de brug.
 *
 * Wat hier anders is dan in prepTaskScheduler.ts: dáár rekent de planner terug
 * vanaf event-start met een vaste lead-time per fase — een tabel met
 * ervaringsgetallen die voor elk gerecht hetzelfde is. Hier rekent hij terug
 * over de kéten van dit specifieke recept, met de duur die bij de stappen zelf
 * staat. De fase-tabel blijft bestaan voor gerechten zonder ontleding.
 *
 * Alles hier is deterministisch — klasse D. Geen model komt aan deze getallen.
 * De invoer is door een mens goedgekeurd (bewaarReceptStappen), en vanaf hier
 * is het optellen en aftrekken.
 *
 * Over verzonnen getallen: als een stap geen duur heeft opgeschreven staan,
 * blijft die duur leeg. Voor het plaatsen in de tijd is een getal nodig — een
 * stap zonder duur zou anders samenvallen met de volgende — dus daarvoor is er
 * een fallback per actie. Die fallback wordt NOOIT teruggeschreven naar
 * duur_actief_min; hij verlaat deze module alleen als `bron: 'schatting'` zodat
 * het scherm "duur onbekend" kan tonen in plaats van een verzonnen kwartier.
 */

import type { PrepTaskPhase } from '@/types/database.types';

export const PLAATSEN = ['thuis', 'bus', 'locatie'] as const;
export type Plaats = (typeof PLAATSEN)[number];

/** Eén rij uit `recipe_steps`, beperkt tot wat de planning leest. */
export interface ReceptStap {
    id: string;
    step_order: number;
    tekst: string;
    actie?: string | null;
    prep_group?: string | null;
    duur_actief_min?: number | null;
    duur_passief_min?: number | null;
    plaats?: string | null;
    toezicht_nodig?: boolean | null;
    station?: string | null;
    apparaat?: string | null;
    techniek_slug?: string | null;
    temp_doel_c?: number | null;
    ingredient_ref?: string | null;
    hoeveelheid?: number | null;
    eenheid?: string | null;
}

/** Waar een duur vandaan komt. Bepaalt of het scherm een getal mag tonen. */
export type DuurBron = 'recept' | 'schatting';

export interface StapDuur {
    /** Handtijd in minuten — kost een persoon. Null = de bron zei het niet. */
    actiefMin: number | null;
    /** Wachttijd in minuten — kost een apparaat, geen persoon. */
    passiefMin: number | null;
    /** Wat de planner gebruikt om de stap in de tijd te zetten. Altijd > 0. */
    plaatsingMin: number;
    bron: DuurBron;
}

/**
 * Fase-afleiding uit de actie van de stap. Deterministisch en uitlegbaar —
 * dezelfde rol als componentPhase() in bulkSchedule.ts, maar dan op het
 * werkwoord dat de ontleder heeft vastgelegd in plaats van op een naam.
 *
 * De fase bepaalt hier alleen nog kleur, sortering en station-routing; de
 * tíjd komt uit de stap zelf. Dat is precies de verschuiving die golf 2 maakt.
 */
const ACTIE_FASE: Record<string, PrepTaskPhase> = {
    'inkoop': 'inkoop',
    'pekelen': 'pekel',
    'marineren': 'marinade',
    'smoken': 'smoke',
    'grillen': 'grill',
    'bakken': 'warm',
    'koken': 'warm',
    'sous-vide': 'warm',
    'blenden': 'koud',
    'emulgeren': 'koud',
    'snijden': 'koud',
    'mise-en-place': 'koud',
    'koelen': 'koud',
    'invriezen': 'koud',
    'portioneren': 'plate',
    'afwerken': 'plate',
    'uitgifte': 'service',
};

export function faseVoorActie(actie: string | null | undefined): PrepTaskPhase {
    if (!actie) return 'other';
    return ACTIE_FASE[actie.trim().toLowerCase()] ?? 'other';
}

/**
 * Station-hint uit de actie — matcht de types in `kitchen_stations`.
 * `recipe_steps.station` is vrije tekst van de ontleder ("snijstation"); deze
 * afleiding is de brug naar de vaste station-types waarop bulkSchedule routeert.
 */
const ACTIE_STATION: Record<string, string> = {
    'smoken': 'smoker',
    'grillen': 'grill',
    'bakken': 'warm',
    'koken': 'warm',
    'sous-vide': 'warm',
    'emulgeren': 'sauzen',
    'blenden': 'sauzen',
    'portioneren': 'expeditie',
    'afwerken': 'expeditie',
    'uitgifte': 'expeditie',
};

export function stationTypeVoorActie(actie: string | null | undefined): string {
    if (!actie) return 'koud';
    return ACTIE_STATION[actie.trim().toLowerCase()] ?? 'koud';
}

/**
 * Plaatsings-fallback per actie, in minuten {actief, passief}.
 *
 * LEES DIT VOOR JE HET GEBRUIKT. Dit zijn geen gemeten tijden en ze mogen
 * nergens als zodanig worden getoond of opgeslagen. Ze bestaan om één reden:
 * een stap zonder duur moet tóch ergens op de tijdlijn staan, anders valt hij
 * samen met de stap erna en klopt de hele keten niet meer. Elke duur die
 * hiervandaan komt draagt `bron: 'schatting'` mee.
 *
 * De getallen zijn bewust grof en aan de lage kant: een te korte schatting
 * valt op in de keuken, een te lange verstopt zich.
 */
const PLAATSING_FALLBACK_MIN: Record<string, { actief: number; passief: number }> = {
    'inkoop': { actief: 30, passief: 0 },
    'snijden': { actief: 15, passief: 0 },
    'mise-en-place': { actief: 15, passief: 0 },
    'blenden': { actief: 10, passief: 0 },
    'emulgeren': { actief: 15, passief: 0 },
    'pekelen': { actief: 10, passief: 12 * 60 },
    'marineren': { actief: 10, passief: 12 * 60 },
    'smoken': { actief: 15, passief: 4 * 60 },
    'sous-vide': { actief: 10, passief: 2 * 60 },
    'koken': { actief: 20, passief: 0 },
    'bakken': { actief: 20, passief: 0 },
    'grillen': { actief: 20, passief: 0 },
    'koelen': { actief: 5, passief: 2 * 60 },
    'invriezen': { actief: 5, passief: 4 * 60 },
    'portioneren': { actief: 20, passief: 0 },
    'afwerken': { actief: 15, passief: 0 },
    'uitgifte': { actief: 15, passief: 0 },
};

/** Laatste redmiddel als de actie ook onbekend is. */
const FALLBACK_ONBEKEND = { actief: 15, passief: 0 };

/**
 * Handtijd, wachttijd en plaatsingsduur van één stap.
 *
 * Een stap telt als "uit het recept" zodra één van beide duren is ingevuld —
 * ook als de andere nul is. "Snijden: 15 minuten handwerk, geen wachttijd" is
 * een volledig antwoord, niet een half ingevulde regel.
 */
export function stapDuur(stap: ReceptStap): StapDuur {
    const actief = getalOfNull(stap.duur_actief_min);
    const passief = getalOfNull(stap.duur_passief_min);

    if (actief !== null || passief !== null) {
        const totaal = (actief ?? 0) + (passief ?? 0);
        return {
            actiefMin: actief,
            passiefMin: passief,
            /* Een stap die volgens het recept nul minuten duurt bestaat niet als
               plaatsbare handeling; geef hem één minuut zodat de keten blijft
               lopen in plaats van in te storten. */
            plaatsingMin: totaal > 0 ? totaal : 1,
            bron: 'recept',
        };
    }

    const key = (stap.actie ?? '').trim().toLowerCase();
    const fb = PLAATSING_FALLBACK_MIN[key] ?? FALLBACK_ONBEKEND;
    return {
        actiefMin: null,
        passiefMin: null,
        plaatsingMin: fb.actief + fb.passief,
        bron: 'schatting',
    };
}

export interface GeplandeStap {
    stap: ReceptStap;
    duur: StapDuur;
    fase: PrepTaskPhase;
    stationType: string;
    plaats: Plaats;
    /** Wanneer met deze stap begonnen moet worden. ISO-string. */
    startISO: string;
    /** Wanneer hij klaar is — start plus plaatsingsduur. */
    eindISO: string;
}

export interface StapPlanning {
    stappen: GeplandeStap[];
    /** Totale doorlooptijd van de keten in minuten. */
    doorlooptijdMin: number;
    /** Wanneer je moet beginnen om op tijd klaar te zijn. */
    startISO: string;
    /** Hoeveel stappen een geschatte in plaats van een opgeschreven duur hebben. */
    geschatteStappen: number;
}

/**
 * Reken de keten terug vanaf het moment dat het gerecht op tafel moet staan.
 *
 * De stappen worden op `step_order` gelegd en van achteren naar voren gevuld:
 * de laatste stap eindigt op event-start, de stap ervóór eindigt waar de
 * laatste begint, enzovoort. Dat is de klassieke terugrekening en het is de
 * reden dat handtijd en wachttijd apart moeten staan — de wachttijd van de
 * smoker schuift de hele keten naar voren, ook al staat er niemand bij.
 *
 * Bewust géén DAG over `hangt_af_van_stap_id`: de ontleder levert een
 * genummerde keten en die is per definitie al topologisch gesorteerd. Zodra
 * stappen echt kunnen vertakken hoort daar topologicalSort() uit
 * prepTaskScheduler.ts bij, en dan pas.
 */
export function planStappenTerug(
    stappen: ReceptStap[],
    eventStart: string | Date,
): StapPlanning {
    const eind = toDate(eventStart);
    const geordend = [...stappen].sort((a, b) => a.step_order - b.step_order);

    const gepland: GeplandeStap[] = [];
    let cursor = eind.getTime();
    let doorlooptijdMin = 0;
    let geschatteStappen = 0;

    /* Van achteren naar voren: de laatste handeling eindigt als de gasten eten. */
    for (let i = geordend.length - 1; i >= 0; i--) {
        const stap = geordend[i];
        const duur = stapDuur(stap);
        if (duur.bron === 'schatting') geschatteStappen++;
        const startMs = cursor - duur.plaatsingMin * 60_000;
        gepland.unshift({
            stap,
            duur,
            fase: faseVoorActie(stap.actie),
            stationType: stationTypeVoorActie(stap.actie),
            plaats: normaliseerPlaats(stap.plaats),
            startISO: new Date(startMs).toISOString(),
            eindISO: new Date(cursor).toISOString(),
        });
        doorlooptijdMin += duur.plaatsingMin;
        cursor = startMs;
    }

    return {
        stappen: gepland,
        doorlooptijdMin,
        startISO: new Date(cursor).toISOString(),
        geschatteStappen,
    };
}

export interface PlaatsTotaal {
    actiefMin: number;
    passiefMin: number;
    /** Stappen waarvan de duur niet is opgeschreven — niet meegeteld hierboven. */
    onbekend: number;
    stappen: number;
}

/**
 * Handtijd en wachttijd per plaats.
 *
 * Dit is waar het onderscheid zijn geld verdient. Thuis heb je je hele keuken
 * en kies je zelf het moment; op locatie heb je een fractie daarvan terwijl
 * tachtig mensen wachten. Twee budgetten dus, en een uur handwerk op locatie
 * weegt heel anders dan een uur handwerk thuis. Wachttijd op locatie telt niet
 * mee als druk, precies omdat er niemand bij hoeft te staan.
 *
 * Stappen zonder opgeschreven duur worden geteld maar niet opgeteld — anders
 * zou een schatting stilletjes in een totaal belanden en er als een meting
 * uitzien.
 */
export function totalenPerPlaats(stappen: ReceptStap[]): Record<Plaats, PlaatsTotaal> {
    const leeg = (): PlaatsTotaal => ({ actiefMin: 0, passiefMin: 0, onbekend: 0, stappen: 0 });
    const totalen: Record<Plaats, PlaatsTotaal> = {
        thuis: leeg(), bus: leeg(), locatie: leeg(),
    };

    for (const stap of stappen) {
        const plaats = normaliseerPlaats(stap.plaats);
        const t = totalen[plaats];
        t.stappen++;
        const duur = stapDuur(stap);
        if (duur.bron === 'schatting') {
            t.onbekend++;
            continue;
        }
        t.actiefMin += duur.actiefMin ?? 0;
        t.passiefMin += duur.passiefMin ?? 0;
    }

    return totalen;
}

/**
 * De groepeersleutel waarop taken over recepten heen samengevoegd worden.
 *
 * De datum zit erin omdat batchen alleen binnen één werkdag zin heeft: sjalot
 * die je vandaag snippert voor het feest van zaterdag is geen tijdwinst maar
 * een bak bruine sjalot. Zelfde vorm als de bestaande `comp:`-sleutel, zodat
 * werkvolgorde.ts er niets nieuws voor hoeft te leren.
 */
export function prepGroupBatchKey(prepGroup: string | null | undefined, datum: string): string | null {
    const g = (prepGroup ?? '').trim().toLowerCase();
    if (!g || !datum) return null;
    return `groep:${g}:${datum}`;
}

/* ─── Helpers ─────────────────────────────────────────────────── */

export function normaliseerPlaats(waarde: string | null | undefined): Plaats {
    const v = (waarde ?? '').trim().toLowerCase();
    return (PLAATSEN as readonly string[]).includes(v) ? (v as Plaats) : 'thuis';
}

function getalOfNull(v: unknown): number | null {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
    return v;
}

function toDate(v: string | Date): Date {
    if (v instanceof Date) {
        if (Number.isNaN(v.getTime())) throw new Error('stapPlanning: ongeldige Date');
        return v;
    }
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new Error(`stapPlanning: ongeldige datum "${v}"`);
    return d;
}
