// Draait elke SQL-test in supabase/tests (niet de seed) en meldt per bestand
// GESLAAGD of FOUT met de melding.
//
//   npm --prefix tools/testdb run test                 alle tests
//   npm --prefix tools/testdb run test -- winkel_vrij  alleen deze (deel van de naam)
//
// De tests melden hun uitkomst als EXCEPTION ("GESLAAGD: …" of "FOUT: …"),
// zodat alles wordt teruggedraaid. Elke test krijgt een eigen verbinding (als
// postgres, zonder claims: de "directe verbinding") in een transactie die
// daarna altijd wordt teruggedraaid.
//
// Rollen zoals PostgREST: de huidige tests wisselen zelf van rol binnen de
// test (set_config('role', …, true) en set_config('request.jwt.claims', …,
// true)). Moet een hele test als één rol draaien, zet dan bovenin:
//   -- testdb-rol: authenticated
//   -- testdb-claims: {"role":"authenticated","sub":"<uuid>"}
// Dan doet de runner wat PostgREST per verzoek doet: SET LOCAL ROLE en
// request.jwt.claims (transactie-lokaal). Zonder claims: {"role":"<rol>"}.

import fs from 'node:fs';
import path from 'node:path';
import { beschrijfFout, isHoofd, REPO, verbind } from './lib.mjs';

const TESTS = path.join(REPO, 'supabase', 'tests');
const ROLLEN = new Set(['anon', 'authenticated', 'service_role']);

function leesKop(sql) {
    const rol = sql.match(/^--\s*testdb-rol:\s*(\S+)\s*$/m)?.[1];
    const claims = sql.match(/^--\s*testdb-claims:\s*(\{.*\})\s*$/m)?.[1];
    if (rol && !ROLLEN.has(rol)) throw new Error(`testdb-rol "${rol}" onbekend (anon, authenticated of service_role)`);
    return { rol, claims: claims ?? (rol ? JSON.stringify({ role: rol }) : null) };
}

async function draaiTest(bestand) {
    const sql = fs.readFileSync(path.join(TESTS, bestand), 'utf8');
    const { rol, claims } = leesKop(sql);
    const client = await verbind();
    const t0 = Date.now();
    try {
        await client.query("BEGIN; SET LOCAL statement_timeout = '120s'");
        if (rol) {
            await client.query(`SET LOCAL ROLE ${rol}`);
            await client.query("SELECT set_config('request.jwt.claims', $1, true)", [claims]);
        }
        await client.query(sql);
        return { uitkomst: 'FOUT', melding: 'de test gaf geen GESLAAGD-melding (geen EXCEPTION aan het eind)', ms: Date.now() - t0 };
    } catch (e) {
        const ms = Date.now() - t0;
        if (e.message.startsWith('GESLAAGD')) return { uitkomst: 'GESLAAGD', melding: e.message, ms };
        if (e.message.startsWith('GEWEIGERD')) return { uitkomst: 'GEWEIGERD', melding: e.message, ms };
        return { uitkomst: 'FOUT', melding: beschrijfFout(e, sql, `supabase/tests/${bestand}`), ms };
    } finally {
        await client.query('ROLLBACK').catch(() => {});
        await client.end().catch(() => {});
    }
}

async function main(filters) {
    const bestanden = fs.readdirSync(TESTS)
        .filter((f) => f.endsWith('.sql') && !f.startsWith('seed_'))
        .filter((f) => filters.length === 0 || filters.some((x) => f.includes(x)))
        .sort();
    if (bestanden.length === 0) {
        console.error('Geen tests gevonden.');
        process.exit(2);
    }
    const uitslag = [];
    for (const b of bestanden) {
        const r = await draaiTest(b);
        uitslag.push({ b, ...r });
        console.log(`${r.uitkomst.padEnd(9)} ${b} (${r.ms} ms)\n          ${r.melding.split('\n').join('\n          ')}\n`);
    }
    const geslaagd = uitslag.filter((u) => u.uitkomst === 'GESLAAGD').length;
    console.log(`${geslaagd} van ${uitslag.length} geslaagd.`);
    if (geslaagd !== uitslag.length) process.exitCode = 1;
}

if (isHoofd(import.meta.url)) {
    main(process.argv.slice(2)).catch((e) => {
        console.error(e.message);
        process.exit(1);
    });
}
