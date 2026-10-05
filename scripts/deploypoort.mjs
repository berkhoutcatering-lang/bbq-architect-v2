#!/usr/bin/env node
/**
 * Deploypoort — beslist of Vercel een productiebuild mag maken.
 *
 * Draait als Vercel "Ignored Build Step" (`ignoreCommand` in vercel.json).
 * Vercel-conventie: exit 0 = build OVERSLAAN, exit 1 = build doorlaten.
 *
 * Regels (plan v4 Toonbank, 2 oktober 2026):
 *   - Previews bouwen altijd; de poort geldt alleen voor productie.
 *   - Productie alleen op maandag, dinsdag en woensdag (Europe/Amsterdam):
 *     de winkel is open van donderdag t/m zaterdag en dan gaat er niets live.
 *   - Nooit in een bevriezing (14 november 2026 t/m 3 januari 2027).
 *   - Noodgeval: zet `[noodfix]` in het commitbericht, dan bouwt hij toch.
 *
 * `magDeployen()` is zuiver en wordt getest in src/lib/deploypoort.test.ts.
 */
import { pathToFileURL } from 'node:url';

/** Weekdagen waarop productie mag (1 = maandag … 7 = zondag). */
export const DEPLOY_DAGEN = [1, 2, 3];

/** Bevriezingen: van en tot en met, als datum in Europe/Amsterdam. */
export const BEVRIEZINGEN = [
    { van: '2026-11-14', tot: '2027-01-03', reden: 'drukke periode Sinterklaas, kerst en jaarwisseling' },
];

const WEEKDAG = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const DAGNAAM = ['', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

/** Datum (JJJJ-MM-DD) en weekdag (1–7) van een moment in Europe/Amsterdam. */
export function amsterdamDag(nu) {
    const delen = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Amsterdam',
            weekday: 'short',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        })
            .formatToParts(nu)
            .map((d) => [d.type, d.value]),
    );
    return { datum: `${delen.year}-${delen.month}-${delen.day}`, weekdag: WEEKDAG[delen.weekday] };
}

/**
 * @param {{ nu: Date, omgeving?: string, bericht?: string }} invoer
 * @returns {{ bouwen: boolean, reden: string }}
 */
export function magDeployen({ nu, omgeving, bericht = '' }) {
    if (omgeving !== 'production') {
        return { bouwen: true, reden: `geen productie (${omgeving || 'onbekend'}): previews bouwen altijd` };
    }
    if (bericht.includes('[noodfix]')) {
        return { bouwen: true, reden: 'noodfix in het commitbericht: de poort wordt bewust gepasseerd' };
    }
    const { datum, weekdag } = amsterdamDag(nu);
    const bevriezing = BEVRIEZINGEN.find((b) => datum >= b.van && datum <= b.tot);
    if (bevriezing) {
        return {
            bouwen: false,
            reden: `bevriezing ${bevriezing.van} t/m ${bevriezing.tot} (${bevriezing.reden}); gebruik [noodfix] voor een spoedfix`,
        };
    }
    if (!DEPLOY_DAGEN.includes(weekdag)) {
        return {
            bouwen: false,
            reden: `het is ${DAGNAAM[weekdag]} ${datum}: productie alleen op maandag t/m woensdag; gebruik [noodfix] voor een spoedfix`,
        };
    }
    return { bouwen: true, reden: `${DAGNAAM[weekdag]} ${datum}: deploydag` };
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
    const uitkomst = magDeployen({
        nu: new Date(),
        omgeving: process.env.VERCEL_ENV,
        bericht: process.env.VERCEL_GIT_COMMIT_MESSAGE || '',
    });
    console.log(`Deploypoort: ${uitkomst.bouwen ? 'BOUWEN' : 'OVERSLAAN'} — ${uitkomst.reden}`);
    process.exit(uitkomst.bouwen ? 1 : 0);
}
