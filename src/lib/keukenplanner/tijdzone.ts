/**
 * De keuken leeft op Nederlandse tijd; de server niet.
 *
 * Planner en wandscherm rekenen op de server, en die draait in UTC. Met
 * `getHours()` / `setHours()` en `new Date('2026-12-23T16:00')` (zonder zone)
 * lag het dagvenster van 04:00 dan om 05:00 of 06:00, en stond de klok op het
 * wandscherm een of twee uur achter. Deze helpers rekenen altijd in
 * Europe/Amsterdam, ongeacht waar de code draait — ook rond de wisseling van
 * zomer- naar wintertijd.
 */

const ZONE = 'Europe/Amsterdam';

const delen = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
});

interface Wandklok { jaar: number; maand: number; dag: number; uur: number; minuut: number; seconde: number }

function wandklok(ms: number): Wandklok {
    const d: Record<string, number> = {};
    for (const p of delen.formatToParts(new Date(ms))) if (p.type !== 'literal') d[p.type] = Number(p.value);
    return { jaar: d.year, maand: d.month, dag: d.day, uur: d.hour, minuut: d.minute, seconde: d.second };
}

/** Hoeveel ms Amsterdam op dit moment vóór loopt op UTC (3.600.000 of 7.200.000). */
function verschuiving(ms: number): number {
    const w = wandklok(ms);
    return Date.UTC(w.jaar, w.maand - 1, w.dag, w.uur, w.minuut, w.seconde) - Math.floor(ms / 1000) * 1000;
}

const twee = (n: number) => String(n).padStart(2, '0');

/** Het uur (0–23) in Amsterdam. */
export function uurAmsterdam(ms: number): number {
    return wandklok(ms).uur;
}

/** "16:05" in Amsterdam. */
export function klokAmsterdam(ms: number): string {
    const w = wandklok(ms);
    return `${twee(w.uur)}:${twee(w.minuut)}`;
}

/** "2026-12-23" — de kalenderdag in Amsterdam. */
export function datumAmsterdam(ms: number): string {
    const w = wandklok(ms);
    return `${w.jaar}-${twee(w.maand)}-${twee(w.dag)}`;
}

/** Een kalenderdag verschuiven, zonder tijdzone: "2026-12-31" + 1 → "2027-01-01". */
export function plusDagen(datum: string, dagen: number): string {
    const [j, m, d] = datum.split('-').map(Number);
    const t = new Date(Date.UTC(j, m - 1, d + dagen));
    return `${t.getUTCFullYear()}-${twee(t.getUTCMonth() + 1)}-${twee(t.getUTCDate())}`;
}

/**
 * Wandkloktijd in Amsterdam → het echte moment als ISO (UTC).
 * `amsterdamNaarIso('2026-12-23', '16:00')` → "2026-12-23T15:00:00.000Z".
 * Tijd mag "HH:MM" of "HH:MM:SS" zijn.
 */
export function amsterdamNaarIso(datum: string, tijd: string): string {
    const [j, m, d] = datum.split('-').map(Number);
    const [u, mi, s] = tijd.split(':').map(Number);
    const alsUtc = Date.UTC(j, m - 1, d, u, mi, s || 0);
    /* Eerste gok met de verschuiving van dat moment, dan bijstellen: rond de
       wisselnacht kan de verschuiving net anders zijn. */
    let ms = alsUtc - verschuiving(alsUtc);
    ms = alsUtc - verschuiving(ms);
    return new Date(ms).toISOString();
}
