/**
 * prijsVersheid — hoe oud zijn de prijzen van een leverancier?
 *
 * Aanleiding, 2026-09-01. Mathijs wil zijn leverancierspagina's elke twee à
 * drie weken opnieuw laten scrapen, want dat houdt zijn kostprijs vanzelf goed:
 * verandert er iets bij de groothandel, of sluit hij zich ergens officieel aan
 * en krijgt hij betere prijzen, dan volgt de marge mee zonder dat iemand iets
 * hoeft bij te werken.
 *
 * Op dat moment was geen enkele prijslijst jonger dan een maand en was de helft
 * een kwartaal oud — Sligro 92 dagen, Makro 131. De app wist dat wel (er staat
 * een `last_sync_at` per leverancier) maar zei er niets over: de kaart toonde
 * "Laatste sync: 04 mei", en dat leest niet als vier maanden.
 *
 * Vandaar deze module. Hij oordeelt niet over prijzen — alleen over hun leeftijd.
 */

/** Onder dit aantal dagen is een prijs vers. Sluit aan op "elke twee weken". */
export const VERS_DAGEN = 14;

/** Vanaf hier is een prijs oud. Sluit aan op "uiterlijk elke drie weken". */
export const OUD_DAGEN = 21;

/**
 * Een scan duurt minuten. Staat hij langer dan dit op 'running', dan draait er
 * niets meer en is de status blijven hangen. Vuur & Rook stond zo 120 dagen op
 * "bezig…" met een draaiend spinnertje erbij.
 */
export const VASTGELOPEN_UREN = 2;

export type Versheid = 'nooit' | 'vers' | 'wordt-oud' | 'oud';

export interface VersheidOordeel {
    stand: Versheid;
    /** Hele dagen sinds de laatste scan, of null als er nooit een was. */
    dagen: number | null;
    /** Korte tekst voor op de kaart. */
    tekst: string;
    /** Is het tijd om deze leverancier opnieuw te scrapen? */
    toeAanScan: boolean;
}

function dagenSinds(iso: string, nu: Date): number | null {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return Math.floor((nu.getTime() - d.getTime()) / 86_400_000);
}

export function beoordeelVersheid(laatsteSync: string | null | undefined, nu: Date = new Date()): VersheidOordeel {
    if (!laatsteSync) {
        return { stand: 'nooit', dagen: null, tekst: 'nog nooit gescand', toeAanScan: true };
    }
    const dagen = dagenSinds(laatsteSync, nu);
    if (dagen == null || dagen < 0) {
        return { stand: 'nooit', dagen: null, tekst: 'datum onbekend', toeAanScan: true };
    }

    const stand: Versheid = dagen >= OUD_DAGEN ? 'oud' : dagen >= VERS_DAGEN ? 'wordt-oud' : 'vers';
    return { stand, dagen, tekst: leeftijdTekst(dagen), toeAanScan: stand === 'oud' };
}

/**
 * Leeftijd in mensentaal. Bewust in weken en maanden zodra het er toe doet:
 * "131 dagen" moet je omrekenen, "ruim 4 maanden" niet.
 */
export function leeftijdTekst(dagen: number): string {
    if (dagen <= 0) return 'vandaag bijgewerkt';
    if (dagen === 1) return 'gisteren bijgewerkt';
    if (dagen < 14) return `${dagen} dagen oud`;
    if (dagen < 60) {
        const weken = Math.round(dagen / 7);
        return `${weken} weken oud`;
    }
    const maanden = Math.floor(dagen / 30);
    const rest = dagen - maanden * 30;
    return rest >= 15 ? `ruim ${maanden} maanden oud` : `${maanden} maanden oud`;
}

/**
 * Hangt de sync-status? Een scan die uren geleden begon en nog steeds 'running'
 * zegt, draait niet meer — dan is het proces afgebroken zonder af te melden.
 */
export function syncVastgelopen(
    status: string | null | undefined,
    laatsteSync: string | null | undefined,
    nu: Date = new Date(),
): boolean {
    if (status !== 'running') return false;
    if (!laatsteSync) return true;
    const d = new Date(laatsteSync);
    if (Number.isNaN(d.getTime())) return true;
    return (nu.getTime() - d.getTime()) / 3_600_000 > VASTGELOPEN_UREN;
}

export interface ScanOverzicht {
    /** Leveranciers waar prijzen van staan en die toe zijn aan een scan. */
    toeAanScan: number;
    /** Leveranciers met een vastgelopen sync-status. */
    vastgelopen: number;
    /** Oudste leeftijd in dagen over de leveranciers met prijzen. */
    oudsteDagen: number | null;
}

/**
 * Samenvatting over alle leveranciers. Alleen leveranciers waar ook echt
 * prijzen van in het systeem staan tellen mee — een lege leverancier die nooit
 * gescand is, is geen achterstand maar gewoon leeg.
 */
export function scanOverzicht(
    leveranciers: Array<{ last_sync_at: string | null; last_sync_status?: string | null; products_count?: number | null }>,
    nu: Date = new Date(),
): ScanOverzicht {
    const metPrijzen = leveranciers.filter((l) => (l.products_count ?? 0) > 0);
    let toe = 0;
    let vast = 0;
    let oudste: number | null = null;
    for (const l of metPrijzen) {
        const o = beoordeelVersheid(l.last_sync_at, nu);
        if (o.toeAanScan) toe++;
        if (syncVastgelopen(l.last_sync_status, l.last_sync_at, nu)) vast++;
        if (o.dagen != null && (oudste == null || o.dagen > oudste)) oudste = o.dagen;
    }
    return { toeAanScan: toe, vastgelopen: vast, oudsteDagen: oudste };
}
