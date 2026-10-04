// Bootst de Supabase-omgeving na en past daarna alle migraties toe, op
// volgorde van bestandsnaam (zoals de Supabase CLI), elk in een eigen
// transactie. Wat er al op staat (tabel testdb.migraties) wordt overgeslagen.
//
// Volgorde:
//   1. tools/testdb/supabase-stub.sql   rollen, auth, storage, extensions,
//                                       standaardrechten zoals Supabase
//   2. supabase-schema.sql en schema-migration.sql (repo-root): het begin-
//      schema dat ooit in de SQL-editor is geplakt, vóór 001_multi_tenant
//   3. tools/testdb/voorgeschiedenis.sql de tabellen en kolommen die op live
//      ook buiten de migraties om zijn ontstaan (zie dat bestand)
//   4. supabase/migrations/*.sql, zonder _draft*; oude migraties die in de
//      repo anders staan dan ze op live zijn gedraaid, krijgen in het geheugen
//      een aanpassing uit afwijkingen.mjs (het bestand zelf blijft zoals het is)
//
// Stopt bij de eerste fout en laat bestand, regel en melding zien.
//
//   node migreer.mjs              alles wat er nog niet op staat
//   node migreer.mjs --tot=2026…  alleen t/m deze bestandsnaam

import fs from 'node:fs';
import path from 'node:path';
import { pasAfwijkingenToe } from './afwijkingen.mjs';
import { beschrijfFout, HIER, isHoofd, MIGRATIES, REPO, verbind } from './lib.mjs';

const VOORBEREIDING = [
    { naam: 'supabase-stub.sql', pad: path.join(HIER, 'supabase-stub.sql') },
    { naam: 'supabase-schema.sql', pad: path.join(REPO, 'supabase-schema.sql') },
    { naam: 'schema-migration.sql', pad: path.join(REPO, 'schema-migration.sql') },
    { naam: 'voorgeschiedenis.sql', pad: path.join(HIER, 'voorgeschiedenis.sql') },
];

export function migratieBestanden() {
    return fs.readdirSync(MIGRATIES)
        .filter((f) => f.endsWith('.sql') && !f.startsWith('_'))
        .sort()
        .map((f) => ({ naam: f, pad: path.join(MIGRATIES, f) }));
}

async function pasToe(client, { naam, pad }, soort) {
    let sql = fs.readFileSync(pad, 'utf8');
    let afwijkingen = [];
    if (soort === 'migratie') ({ sql, toegepast: afwijkingen } = pasAfwijkingenToe(naam, sql));
    const t0 = Date.now();
    await client.query('BEGIN');
    try {
        await client.query(sql);
        await client.query(
            'INSERT INTO testdb.migraties (bestand, soort, duur_ms, afwijking) VALUES ($1, $2, $3, $4)',
            [naam, soort, Date.now() - t0, afwijkingen.length ? afwijkingen.join(' | ') : null],
        );
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        e.testdbUitleg = beschrijfFout(e, sql, path.relative(REPO, pad));
        throw e;
    }
    // Een SET (zonder LOCAL) in een migratie mag niet doorlekken naar de volgende.
    await client.query('RESET ALL; RESET ROLE');
    return { ms: Date.now() - t0, afwijkingen: afwijkingen.length };
}

export async function migreer({ tot } = {}) {
    let client = await verbind();
    try {
        await client.query(`
            CREATE SCHEMA IF NOT EXISTS testdb;
            CREATE TABLE IF NOT EXISTS testdb.migraties (
                volgorde     serial PRIMARY KEY,
                bestand      text NOT NULL UNIQUE,
                soort        text NOT NULL,
                toegepast_op timestamptz NOT NULL DEFAULT now(),
                duur_ms      integer,
                afwijking    text
            );
            REVOKE ALL ON SCHEMA testdb FROM PUBLIC;`);
        const { rows } = await client.query('SELECT bestand FROM testdb.migraties');
        const gedaan = new Set(rows.map((r) => r.bestand));

        let nieuw = 0;
        for (const stap of VOORBEREIDING) {
            if (gedaan.has(stap.naam)) continue;
            const { ms } = await pasToe(client, stap, 'nabootsing');
            console.log(`  nabootsing  ${stap.naam} (${ms} ms)`);
            nieuw++;
            // search_path en rolinstellingen gelden pas in een nieuwe sessie.
            await client.end();
            client = await verbind();
        }

        const bestanden = migratieBestanden();
        let overgeslagen = 0;
        for (const b of bestanden) {
            if (tot && b.naam > tot) break;
            if (gedaan.has(b.naam)) {
                overgeslagen++;
                continue;
            }
            const { ms, afwijkingen } = await pasToe(client, b, 'migratie');
            console.log(`  migratie    ${b.naam} (${ms} ms)${afwijkingen ? ' — met historische afwijking (afwijkingen.mjs)' : ''}`);
            nieuw++;
        }
        const { rows: [{ n }] } = await client.query("SELECT count(*)::int AS n FROM testdb.migraties WHERE soort = 'migratie'");
        console.log(`Klaar: ${nieuw} nieuw toegepast, ${overgeslagen} stonden er al; ${n} van ${bestanden.length} migraties staan erop.`);
    } finally {
        await client.end().catch(() => {});
    }
}

if (isHoofd(import.meta.url)) {
    const totArg = process.argv.find((a) => a.startsWith('--tot='));
    migreer({ tot: totArg ? totArg.slice(6) : undefined }).catch((e) => {
        console.error('\nMIGRATIE MISLUKT');
        console.error(e.testdbUitleg ?? e.message);
        process.exit(1);
    });
}
