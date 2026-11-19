/**
 * De rekenkant van de DatumKiezer (src/components/DatumKiezer.tsx): een maand
 * als rooster van weken die op maandag beginnen, en datums als 'jjjj-mm-dd'
 * (zoals <input type="date"> ze gaf). Alles in kalenderdagen, zonder tijdzone:
 * een THT is een dag, geen moment.
 */

export interface RoosterDag {
    iso: string;
    dag: number;
    /** Hoort bij de getoonde maand (anders: een dag van de vorige of volgende maand). */
    inMaand: boolean;
}

const twee = (n: number) => String(n).padStart(2, '0');

export function isoVan(jaar: number, maand0: number, dag: number): string {
    const d = new Date(Date.UTC(jaar, maand0, dag));
    return `${d.getUTCFullYear()}-${twee(d.getUTCMonth() + 1)}-${twee(d.getUTCDate())}`;
}

/** Vandaag als 'jjjj-mm-dd' op de klok van dit apparaat. */
export function vandaagIso(nu: Date = new Date()): string {
    return `${nu.getFullYear()}-${twee(nu.getMonth() + 1)}-${twee(nu.getDate())}`;
}

/** 'jjjj-mm-dd' → { jaar, maand0 } van die maand; ongeldig → null. */
export function maandVan(iso: string | null | undefined): { jaar: number; maand0: number } | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
    if (!m) return null;
    const maand0 = Number(m[2]) - 1;
    if (maand0 < 0 || maand0 > 11) return null;
    return { jaar: Number(m[1]), maand0 };
}

export function verschuifMaand(jaar: number, maand0: number, stap: number): { jaar: number; maand0: number } {
    const t = jaar * 12 + maand0 + stap;
    return { jaar: Math.floor(t / 12), maand0: ((t % 12) + 12) % 12 };
}

/**
 * De maand als hele weken van maandag tot en met zondag: 4 tot 6 rijen van 7,
 * aangevuld met de laatste dagen van de vorige en de eerste van de volgende maand.
 */
export function maandRooster(jaar: number, maand0: number): RoosterDag[][] {
    const eerste = new Date(Date.UTC(jaar, maand0, 1));
    const voor = (eerste.getUTCDay() + 6) % 7; // maandag = 0
    const dagenInMaand = new Date(Date.UTC(jaar, maand0 + 1, 0)).getUTCDate();
    const weken = Math.ceil((voor + dagenInMaand) / 7);
    const rooster: RoosterDag[][] = [];
    for (let w = 0; w < weken; w++) {
        const week: RoosterDag[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(Date.UTC(jaar, maand0, 1 - voor + w * 7 + i));
            week.push({ iso: isoVan(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), dag: d.getUTCDate(), inMaand: d.getUTCMonth() === maand0 });
        }
        rooster.push(week);
    }
    return rooster;
}

export const WEEKDAGEN_KORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'] as const;

/** "november 2026" */
export function maandNaam(jaar: number, maand0: number): string {
    return new Date(Date.UTC(jaar, maand0, 1)).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "donderdag 26 november 2026"; leeg → ''. */
export function datumVoluit(iso: string): string {
    if (!maandVan(iso)) return '';
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "do 26 nov 2026", voor een smal veld; leeg → ''. */
export function datumKort(iso: string): string {
    if (!maandVan(iso)) return '';
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
