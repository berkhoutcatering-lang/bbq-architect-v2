// De api-stand van de lokale testdatabase: PostgREST plus een kleine voordeur
// (api-proxy.mjs) die /rest/v1/* doorgeeft zoals Supabase. Zo draait BBQ
// Architect lokaal met NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<poort> en
// eigen sleutels tegen deze database: de publieke winkel-routes en de
// Toonbank-API werken, schermen achter login niet (geen GoTrue).
//
//   node api.mjs            starten op de voorgrond; Ctrl+C stopt PostgREST en de voordeur
//   node api.mjs --proef    starten, een paar controles, stoppen (exit 1 bij een fout)
//
// Wat hij doet:
//   1. de database starten als hij nog niet draait (er moeten migraties op staan);
//   2. PostgREST downloaden als hij er nog niet is (postgrest.mjs, .bin/);
//   3. één keer een JWT-geheim maken en daarmee de anon- en service_role-sleutel
//      (JWT's met de role-claim), in <API_MAP>/geheim.json (alleen voor jou leesbaar);
//   4. de rol authenticator laten inloggen met een eigen wachtwoord (alleen
//      deze wegwerpdatabase), en PostgREST starten op een interne poort;
//   5. de voordeur op TESTDB_API_POORT (standaard 54321, anders de eerstvolgende vrije);
//   6. <API_MAP>/ba.env schrijven met de drie variabelen voor BBQ Architect,
//      en <API_MAP>/api.json met de poorten. Er wordt nooit een sleutel geprint.
//
// API_MAP is tools/testdb/.api, of <TESTDB_DATA>/api, of TESTDB_API_MAP.

import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { maakProxy } from './api-proxy.mjs';
import { API_MAP, DATABASE, draait, isHoofd, leesPoort, verbind, vrijePoort } from './lib.mjs';
import { postgrestOmgeving, zorgVoorPostgrest } from './postgrest.mjs';
import { start } from './start.mjs';

export const API_STANDAARDPOORT = Number(process.env.TESTDB_API_POORT || 54321);
export const GEHEIM_BESTAND = path.join(API_MAP, 'geheim.json');
export const API_BESTAND = path.join(API_MAP, 'api.json');
export const ENV_BESTAND = path.join(API_MAP, 'ba.env');
const CONF_BESTAND = path.join(API_MAP, 'postgrest.conf');
const LOG_BESTAND = path.join(API_MAP, 'postgrest.log');

const b64url = (b) => Buffer.from(b).toString('base64url');

/** Een HS256-JWT, zoals de sleutels van Supabase (role-claim, lang geldig). */
export function tekenJwt(payload, geheim) {
    const kop = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const romp = b64url(JSON.stringify(payload));
    const handtekening = createHmac('sha256', geheim).update(`${kop}.${romp}`).digest('base64url');
    return `${kop}.${romp}.${handtekening}`;
}

function sleutel(rol, geheim) {
    const iat = Math.floor(Date.now() / 1000);
    return tekenJwt({ iss: 'tools/testdb', ref: 'testdb-lokaal', role: rol, iat, exp: iat + 10 * 365 * 24 * 3600 }, geheim);
}

/** Het geheim en de sleutels: één keer gemaakt, daarna steeds dezelfde (ook na `opnieuw`). */
export function zorgVoorGeheimen() {
    fs.mkdirSync(API_MAP, { recursive: true, mode: 0o700 });
    if (fs.existsSync(GEHEIM_BESTAND)) {
        const g = JSON.parse(fs.readFileSync(GEHEIM_BESTAND, 'utf8'));
        if (g.jwt_secret && g.anon_key && g.service_role_key && g.authenticator_wachtwoord) return g;
    }
    const jwt_secret = randomBytes(48).toString('base64url');
    const g = {
        uitleg: 'Alleen voor de lokale testdatabase (tools/testdb, api-stand). Nooit committen, nooit voor live.',
        jwt_secret,
        authenticator_wachtwoord: randomBytes(24).toString('hex'),
        anon_key: sleutel('anon', jwt_secret),
        service_role_key: sleutel('service_role', jwt_secret),
    };
    fs.writeFileSync(GEHEIM_BESTAND, JSON.stringify(g, null, 2) + '\n', { mode: 0o600 });
    return g;
}

async function bereidDatabaseVoor(wachtwoord) {
    const client = await verbind({ stil: true });
    try {
        const { rows } = await client.query(`SELECT to_regclass('testdb.migraties') IS NOT NULL AS er, (SELECT count(*) FROM pg_roles WHERE rolname = 'authenticator')::int AS rol`);
        if (!rows[0].er) {
            throw new Error('Er staan nog geen migraties op deze database. Draai eerst: npm --prefix tools/testdb run opnieuw (en run seed).');
        }
        if (!rows[0].rol) throw new Error('De rol authenticator ontbreekt (supabase-stub.sql niet gedraaid?). Draai: npm --prefix tools/testdb run opnieuw.');
        // Alleen deze wegwerpdatabase op 127.0.0.1: authenticator mag inloggen, zoals op Supabase.
        await client.query(`ALTER ROLE authenticator WITH LOGIN PASSWORD '${wachtwoord.replace(/'/g, "''")}'`);
        // Schema-cache van een al draaiende PostgREST verversen (na een nieuwe migratie).
        await client.query(`NOTIFY pgrst, 'reload schema'`);
    } finally {
        await client.end();
    }
}

function schrijfConfig({ dbPoort, postgrestPoort, adminPoort, g }) {
    const regels = [
        '# tools/testdb api-stand: gemaakt door api.mjs, niet met de hand aanpassen.',
        `db-uri = "postgres://authenticator:${g.authenticator_wachtwoord}@127.0.0.1:${dbPoort}/${DATABASE}"`,
        'db-schemas = "public"',
        'db-anon-role = "anon"',
        'db-extra-search-path = "public, extensions"',
        'db-max-rows = 1000',
        'db-pool = 10',
        'db-channel-enabled = true',
        `jwt-secret = "${g.jwt_secret}"`,
        'server-host = "127.0.0.1"',
        `server-port = ${postgrestPoort}`,
        `admin-server-port = ${adminPoort}`,
        'log-level = "warn"',
        '',
    ];
    fs.writeFileSync(CONF_BESTAND, regels.join('\n'), { mode: 0o600 });
}

function schrijfEnv(url, g) {
    const regels = [
        '# tools/testdb api-stand: lokaal, nooit live. Gemaakt door `npm --prefix tools/testdb run api`.',
        '# Alleen deze drie; de rest van BBQ Architect (mail, myPOS, AI) staat hier bewust niet in.',
        `NEXT_PUBLIC_SUPABASE_URL=${url}`,
        `NEXT_PUBLIC_SUPABASE_ANON_KEY=${g.anon_key}`,
        `SUPABASE_SERVICE_ROLE_KEY=${g.service_role_key}`,
        '',
    ];
    fs.writeFileSync(ENV_BESTAND, regels.join('\n'), { mode: 0o600 });
}

async function wachtOpKlaar(adminPoort, kind, ms = 20_000) {
    const tot = Date.now() + ms;
    while (Date.now() < tot) {
        if (kind.exitCode !== null) throw new Error(`PostgREST stopte meteen (code ${kind.exitCode}). Zie ${LOG_BESTAND}.`);
        try {
            const r = await fetch(`http://127.0.0.1:${adminPoort}/ready`);
            if (r.ok) return;
        } catch {
            /* nog niet */
        }
        await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`PostgREST werd niet klaar binnen ${ms / 1000} s. Zie ${LOG_BESTAND}.`);
}

/**
 * Start PostgREST en de voordeur. Geeft { url, poort, sleutels, stop } terug.
 * @param {{ log?: (regel: string) => void }} [opties]
 */
export async function startApi({ log = () => {} } = {}) {
    if (!draait()) await start();
    const dbPoort = leesPoort();
    const g = zorgVoorGeheimen();
    await bereidDatabaseVoor(g.authenticator_wachtwoord);
    const bin = await zorgVoorPostgrest();

    const poort = await vrijePoort(API_STANDAARDPOORT);
    const postgrestPoort = await vrijePoort(poort + 1);
    const adminPoort = await vrijePoort(postgrestPoort + 1);
    schrijfConfig({ dbPoort, postgrestPoort, adminPoort, g });

    const logStroom = fs.createWriteStream(LOG_BESTAND, { flags: 'a', mode: 0o600 });
    const kind = spawn(bin, [CONF_BESTAND], { env: await postgrestOmgeving(), stdio: ['ignore', 'pipe', 'pipe'] });
    kind.stdout.pipe(logStroom, { end: false });
    kind.stderr.pipe(logStroom, { end: false });
    try {
        await wachtOpKlaar(adminPoort, kind);
    } catch (e) {
        kind.kill('SIGTERM');
        throw e;
    }

    const proxy = maakProxy({ postgrestPoort, sleutels: { anon: g.anon_key, service_role: g.service_role_key }, log });
    await new Promise((resolve, reject) => {
        proxy.once('error', reject);
        proxy.listen(poort, '127.0.0.1', resolve);
    });

    const url = `http://127.0.0.1:${poort}`;
    schrijfEnv(url, g);
    fs.writeFileSync(API_BESTAND, JSON.stringify({ url, poort, postgrest_poort: postgrestPoort, admin_poort: adminPoort, db_poort: dbPoort, pid: process.pid, gestart_at: new Date().toISOString() }, null, 2) + '\n');

    let gestopt = false;
    const stop = async () => {
        if (gestopt) return;
        gestopt = true;
        await new Promise((r) => proxy.close(() => r()));
        proxy.closeAllConnections?.();
        if (kind.exitCode === null) {
            kind.kill('SIGTERM');
            await new Promise((r) => {
                const t = setTimeout(() => {
                    kind.kill('SIGKILL');
                    r();
                }, 3000);
                kind.once('exit', () => {
                    clearTimeout(t);
                    r();
                });
            });
        }
        logStroom.end();
        fs.rmSync(API_BESTAND, { force: true });
    };

    return { url, poort, postgrestPoort, sleutels: { anon: g.anon_key, service_role: g.service_role_key }, kind, stop };
}

/* ── Proef: werkt de voordeur zoals Supabase? ──────────────────────────────── */

export async function proef(api) {
    const fouten = [];
    const check = async (naam, fn) => {
        try {
            await fn();
            console.log(`  OK    ${naam}`);
        } catch (e) {
            fouten.push(naam);
            console.log(`  FOUT  ${naam}: ${e.message}`);
        }
    };
    const vraag = (pad, { sleutel, methode = 'GET', body } = {}) =>
        fetch(`${api.url}${pad}`, {
            method: methode,
            headers: { ...(sleutel ? { apikey: sleutel, authorization: `Bearer ${sleutel}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
    const verwacht = (r, status) => {
        if (r.status !== status) throw new Error(`HTTP ${r.status}, verwacht ${status}`);
    };

    await check('zonder apikey: 401', async () => verwacht(await vraag('/rest/v1/organizations?select=id&limit=1'), 401));
    await check('onbekende sleutel: 401', async () => verwacht(await vraag('/rest/v1/organizations?select=id&limit=1', { sleutel: 'x.y.z' }), 401));
    await check('anon mag winkel_voorraad_stand niet aanroepen', async () => {
        const r = await vraag('/rest/v1/rpc/winkel_voorraad_stand', { sleutel: api.sleutels.anon, methode: 'POST', body: { p_org: '00000000-0000-0000-0000-000000000000' } });
        if (r.status !== 401 && r.status !== 403 && r.status !== 404) throw new Error(`HTTP ${r.status}, verwacht 401/403/404`);
    });
    await check('service_role leest organizations', async () => verwacht(await vraag('/rest/v1/organizations?select=id&limit=1', { sleutel: api.sleutels.service_role }), 200));
    await check('service_role roept winkel_voorraad_stand aan', async () => {
        const r = await vraag('/rest/v1/rpc/winkel_voorraad_stand', { sleutel: api.sleutels.service_role, methode: 'POST', body: { p_org: '00000000-0000-0000-0000-000000000000' } });
        if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    });
    await check('/auth/v1/user: 401 (geen GoTrue)', async () => verwacht(await vraag('/auth/v1/user', { sleutel: api.sleutels.anon }), 401));
    await check('CORS-preflight: 204 met de origin', async () => {
        const r = await fetch(`${api.url}/rest/v1/organizations`, { method: 'OPTIONS', headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'GET' } });
        verwacht(r, 204);
        if (r.headers.get('access-control-allow-origin') !== 'http://localhost:3000') throw new Error('geen access-control-allow-origin');
    });
    return fouten;
}

async function hoofd() {
    const metProef = process.argv.includes('--proef');
    const uitgebreid = process.argv.includes('--log');
    const api = await startApi({ log: uitgebreid ? (r) => console.log(`  ${r}`) : undefined });
    console.log(`De api-stand draait: ${api.url}  (REST op ${api.url}/rest/v1, PostgREST intern op ${api.postgrestPoort})`);
    const rel = path.relative(process.cwd(), ENV_BESTAND);
    console.log(`Sleutels en variabelen voor BBQ Architect: ${rel && !rel.startsWith('..') ? rel : ENV_BESTAND}`);
    console.log('  (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY; de waarden worden niet getoond)');

    if (metProef) {
        console.log('Proef:');
        const fouten = await proef(api);
        await api.stop();
        if (fouten.length) {
            console.error(`PROEF MISLUKT (${fouten.length})`);
            process.exit(1);
        }
        console.log('PROEF GESLAAGD');
        process.exit(0);
    }

    console.log('Ctrl+C stopt PostgREST en de voordeur (de database blijft draaien).');
    let stoppen = false;
    for (const s of ['SIGINT', 'SIGTERM']) {
        process.on(s, async () => {
            stoppen = true;
            await api.stop();
            process.exit(0);
        });
    }
    api.kind.on('exit', (code) => {
        if (stoppen) return;
        console.error(`PostgREST stopte onverwacht (code ${code}). Zie ${LOG_BESTAND}.`);
        api.stop().finally(() => process.exit(1));
    });
}

if (isHoofd(import.meta.url)) {
    hoofd().catch((e) => {
        console.error(e.message);
        process.exit(1);
    });
}
