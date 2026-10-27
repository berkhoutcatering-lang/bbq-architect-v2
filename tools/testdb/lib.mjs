// Gedeelde stukken van de lokale testdatabase: paden, poort, binaries,
// verbinding en het netjes tonen van resultaten en foutmeldingen.

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const HIER = path.dirname(fileURLToPath(import.meta.url));

// Draait dit bestand als script (node x.mjs) en niet als import?
export function isHoofd(metaUrl) {
    return !!process.argv[1] && fileURLToPath(metaUrl) === path.resolve(process.argv[1]);
}
// Migraties en tests komen uit deze checkout, of uit een andere worktree via
// TESTDB_REPO (bijvoorbeeld een lagere branch van de stapel).
export const REPO = process.env.TESTDB_REPO
    ? path.resolve(process.env.INIT_CWD ?? process.cwd(), process.env.TESTDB_REPO)
    : path.resolve(HIER, '..', '..');
// Het cluster staat in tools/testdb/.data, of in een eigen map via TESTDB_DATA
// (een tweede database naast de gewone, bijvoorbeeld voor de E2E-keten of een
// agent die parallel werkt). Met een eigen TESTDB_POORT erbij storen ze elkaar niet.
export const DATA = process.env.TESTDB_DATA
    ? path.resolve(process.env.INIT_CWD ?? process.cwd(), process.env.TESTDB_DATA)
    : path.join(HIER, '.data');
// De api-stand (api.mjs): JWT-geheim, sleutels en PostgREST-configuratie.
// Buiten .data, zodat `opnieuw` de sleutels niet verandert; met TESTDB_DATA
// erbij standaard in die map, met TESTDB_API_MAP in een eigen map.
export const API_MAP = process.env.TESTDB_API_MAP
    ? path.resolve(process.env.INIT_CWD ?? process.cwd(), process.env.TESTDB_API_MAP)
    : process.env.TESTDB_DATA
        ? path.join(DATA, 'api')
        : path.join(HIER, '.api');
// Gedownloade binaries (PostgREST), gedeeld door alle databases van deze checkout.
export const BIN = path.join(HIER, '.bin');
export const CLUSTER = path.join(DATA, 'pg');
export const LOG = path.join(DATA, 'postgres.log');
export const POORTBESTAND = path.join(DATA, 'poort');
export const MIGRATIES = path.join(REPO, 'supabase', 'migrations');

// Alleen voor deze wegwerpdatabase op 127.0.0.1; geen geheim.
export const GEBRUIKER = 'postgres';
export const WACHTWOORD = 'postgres';
export const DATABASE = 'postgres';
export const STANDAARDPOORT = Number(process.env.TESTDB_POORT || 54329);

// Types als tekst teruggeven: numeric, bigint, timestamps en jsonb precies
// zoals Postgres ze schrijft, net als psql en `supabase db query`.
for (const oid of [20, 700, 701, 1082, 1083, 1114, 1184, 1266, 1700, 114, 3802]) {
    pg.types.setTypeParser(oid, (v) => v);
}

export async function binaries() {
    const naam = `@embedded-postgres/${os.platform()}-${os.arch()}`;
    try {
        return await import(naam);
    } catch (e) {
        throw new Error(`Geen Postgres-binaries voor ${os.platform()}-${os.arch()} (${naam}). Draai eerst: npm --prefix tools/testdb install\n${e.message}`);
    }
}

export function leesPoort() {
    try {
        const p = Number(fs.readFileSync(POORTBESTAND, 'utf8').trim());
        return Number.isInteger(p) && p > 0 ? p : null;
    } catch {
        return null;
    }
}

export function poortVrij(poort) {
    return new Promise((resolve) => {
        const srv = net.createServer();
        srv.once('error', () => resolve(false));
        srv.once('listening', () => srv.close(() => resolve(true)));
        srv.listen(poort, '127.0.0.1');
    });
}

export async function vrijePoort(vanaf = STANDAARDPOORT) {
    for (let p = vanaf; p < vanaf + 20; p++) {
        if (await poortVrij(p)) return p;
    }
    throw new Error(`Geen vrije poort gevonden tussen ${vanaf} en ${vanaf + 19}.`);
}

export function draait() {
    // postmaster.pid bestaat zolang de server draait (pg_ctl ruimt hem op).
    const pidbestand = path.join(CLUSTER, 'postmaster.pid');
    if (!fs.existsSync(pidbestand)) return false;
    const pid = Number(fs.readFileSync(pidbestand, 'utf8').split('\n')[0]);
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

export async function verbind({ stil = false } = {}) {
    const poort = leesPoort();
    if (!poort || !draait()) {
        throw new Error('De testdatabase draait niet. Start hem met: npm --prefix tools/testdb run start');
    }
    const client = new pg.Client({
        host: '127.0.0.1',
        port: poort,
        user: GEBRUIKER,
        password: WACHTWOORD,
        database: DATABASE,
        application_name: 'bbq-testdb',
    });
    if (!stil) {
        client.on('notice', (n) => {
            if (process.env.TESTDB_NOTICES) console.log(`  ${n.severity}: ${n.message}`);
        });
    }
    await client.connect();
    return client;
}

export function url() {
    const poort = leesPoort() ?? STANDAARDPOORT;
    return `postgresql://${GEBRUIKER}:${WACHTWOORD}@127.0.0.1:${poort}/${DATABASE}`;
}

// Regelnummer bij een foutpositie (pg geeft een tekenpositie in de query).
export function regelBij(sql, positie) {
    if (!positie) return null;
    return sql.slice(0, Number(positie) - 1).split('\n').length;
}

export function beschrijfFout(e, sql, bestand) {
    const delen = [];
    const regel = regelBij(sql ?? '', e.position);
    delen.push(`${e.code ? `[${e.code}] ` : ''}${e.message}`);
    if (bestand) delen.push(`  bestand: ${bestand}${regel ? `, regel ${regel}` : ''}`);
    if (regel && sql) {
        const r = sql.split('\n')[regel - 1];
        if (r !== undefined) delen.push(`  > ${r.trim()}`);
    }
    if (e.detail) delen.push(`  detail: ${e.detail}`);
    if (e.hint) delen.push(`  hint: ${e.hint}`);
    if (e.where) delen.push(`  waar: ${e.where.split('\n').slice(0, 4).join(' | ')}`);
    return delen.join('\n');
}

// Een resultaat als tabel, zoals psql dat doet (zonder afhankelijkheden).
export function toonTabel(res) {
    if (!res || !res.fields || res.fields.length === 0) return '';
    const kolommen = res.fields.map((f) => f.name);
    const rijen = res.rows.map((r) => kolommen.map((k) => (r[k] === null || r[k] === undefined ? '' : typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k]))));
    const breedtes = kolommen.map((k, i) => Math.max(k.length, ...rijen.map((r) => r[i].length)));
    const lijn = (cellen) => ' ' + cellen.map((c, i) => c.padEnd(breedtes[i])).join(' | ');
    const uit = [lijn(kolommen), '-' + breedtes.map((b) => '-'.repeat(b)).join('-+-') + '-'];
    for (const r of rijen) uit.push(lijn(r));
    uit.push(`(${rijen.length} ${rijen.length === 1 ? 'rij' : 'rijen'})`);
    return uit.join('\n');
}
