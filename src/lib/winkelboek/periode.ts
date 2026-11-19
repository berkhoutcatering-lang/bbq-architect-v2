/**
 * De periode van Boekhouding winkel: een ISO-week of een kalendermaand, als
 * sleutel in het adres (`?p=2026-W48` of `?p=2026-11`). Zuiver: geen klok,
 * `vandaag` komt van de aanroeper.
 *
 * Rekenen gebeurt in UTC op de middag, zodat zomertijd geen dag verschuift.
 */

export type PeriodeSoort = 'week' | 'maand';

export interface Periode {
    /** '2026-W48' of '2026-11' */
    sleutel: string;
    soort: PeriodeSoort;
    /** JJJJ-MM-DD: maandag, of de 1e van de maand. */
    start: string;
    /** JJJJ-MM-DD: zondag, of de laatste dag van de maand. */
    eind: string;
    /** 'Week 48 · 23 – 29 nov' of 'November 2026' */
    label: string;
    vorige: string;
    volgende: string;
}

const DAG = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const middag = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Maandag = 0 … zondag = 6. */
const weekdag = (d: Date) => (d.getUTCDay() + 6) % 7;

/** De maandag van ISO-week `week` in ISO-jaar `jaar` (week 1 bevat 4 januari). */
function maandagVanWeek(jaar: number, week: number): Date {
    const vierJan = new Date(Date.UTC(jaar, 0, 4, 12));
    return new Date(vierJan.getTime() - weekdag(vierJan) * DAG + (week - 1) * 7 * DAG);
}

function isoWeek(d: Date): { jaar: number; week: number } {
    const maandag = new Date(d.getTime() - weekdag(d) * DAG);
    /* De donderdag van de week bepaalt bij welk jaar hij hoort. */
    const jaar = new Date(maandag.getTime() + 3 * DAG).getUTCFullYear();
    const week = Math.round((maandag.getTime() - maandagVanWeek(jaar, 1).getTime()) / (7 * DAG)) + 1;
    return { jaar, week };
}

/** 28 december valt altijd in de laatste ISO-week van zijn jaar. */
const wekenInJaar = (jaar: number) => isoWeek(new Date(Date.UTC(jaar, 11, 28, 12))).week;

const weekNaam = (jaar: number, week: number) => `${jaar}-W${pad(week)}`;
const maandNaam = (jaar: number, maand: number) => `${jaar}-${pad(maand)}`;

function dagMaand(d: Date, metMaand: boolean): string {
    const dag = String(d.getUTCDate());
    if (!metMaand) return dag;
    const maand = d.toLocaleDateString('nl-NL', { month: 'short', timeZone: 'UTC' }).replace('.', '');
    return `${dag} ${maand}`;
}

function week(jaar: number, nr: number): Periode {
    const start = maandagVanWeek(jaar, nr);
    const eind = new Date(start.getTime() + 6 * DAG);
    const vorige = isoWeek(new Date(start.getTime() - 7 * DAG));
    const volgende = isoWeek(new Date(start.getTime() + 7 * DAG));
    const zelfdeMaand = start.getUTCMonth() === eind.getUTCMonth();
    return {
        sleutel: weekNaam(jaar, nr),
        soort: 'week',
        start: iso(start),
        eind: iso(eind),
        label: `Week ${nr} · ${dagMaand(start, !zelfdeMaand)} – ${dagMaand(eind, true)}`,
        vorige: weekNaam(vorige.jaar, vorige.week),
        volgende: weekNaam(volgende.jaar, volgende.week),
    };
}

function maand(jaar: number, nr: number): Periode {
    const start = new Date(Date.UTC(jaar, nr - 1, 1, 12));
    const eind = new Date(Date.UTC(jaar, nr, 0, 12));
    const naam = start.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return {
        sleutel: maandNaam(jaar, nr),
        soort: 'maand',
        start: iso(start),
        eind: iso(eind),
        label: naam.charAt(0).toUpperCase() + naam.slice(1),
        vorige: nr === 1 ? maandNaam(jaar - 1, 12) : maandNaam(jaar, nr - 1),
        volgende: nr === 12 ? maandNaam(jaar + 1, 1) : maandNaam(jaar, nr + 1),
    };
}

/** Ongeldige of ontbrekende sleutel: de ISO-week waarin `vandaag` (JJJJ-MM-DD) valt. */
export function periodeVan(sleutel: string | undefined, vandaag: string): Periode {
    const w = /^(\d{4})-W(\d{2})$/.exec(sleutel ?? '');
    if (w) {
        const jaar = Number(w[1]);
        const nr = Number(w[2]);
        if (nr >= 1 && nr <= wekenInJaar(jaar)) return week(jaar, nr);
    }
    const m = /^(\d{4})-(\d{2})$/.exec(sleutel ?? '');
    if (m) {
        const nr = Number(m[2]);
        if (nr >= 1 && nr <= 12) return maand(Number(m[1]), nr);
    }
    const nu = isoWeek(middag(vandaag));
    return week(nu.jaar, nu.week);
}

/** De sleutel van de maand waarin de periode begint, voor de wissel week ↔ maand. */
export function maandSleutel(p: Periode): string {
    return p.start.slice(0, 7);
}

/** De sleutel van de week waarin de periode begint. */
export function weekSleutel(p: Periode): string {
    const w = isoWeek(middag(p.start));
    return weekNaam(w.jaar, w.week);
}
