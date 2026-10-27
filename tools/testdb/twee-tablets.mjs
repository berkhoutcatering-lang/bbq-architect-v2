// Twee tablets verwerken tegelijk hun wachtrij (review M2, B1).
//
//   npm --prefix tools/testdb run proef:twee-tablets
//
// Tablet A heeft bonnen op P2, poort A, P1; tablet B op P1, poort B, P2: de
// producten in gekruiste volgorde. Een derde verbinding houdt de twee
// poortproducten even vast, zodat A en B allebei halverwege hun batch staan
// als ze verder mogen. Zonder de fix (alle producten van de batch vooraf in
// één statement, in id-volgorde) gaf dat "40P01 deadlock detected" en een
// geldige bon op 'fout'. Met de fix wacht de ene tablet op de andere en
// staan alle zes de bonnen op 'verwerkt'.
//
// Alleen de lokale testdatabase (127.0.0.1, zie lib.mjs). De opzet wordt
// gecommit (wegwerpdatabase), in de organisatie e2e-hop-en-bites van de seed;
// draai hem daarom ná de SQL-tests (toonbank_apparaten telt op T1/T2).
// Afsluitcode 0 = geslaagd, 1 = fout.

import { randomUUID } from 'node:crypto';
import { verbind } from './lib.mjs';

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

const s = await verbind({ stil: true });
const a = await verbind({ stil: true });
const b = await verbind({ stil: true });
const c = await verbind({ stil: true });
let geslaagd = false;
try {
    const { rows: [org] } = await s.query(`select id from organizations where slug = 'e2e-hop-en-bites'`);
    if (!org) throw new Error('organisatie e2e-hop-en-bites ontbreekt: draai eerst de seed');
    const hash = 'a'.repeat(32) + ':' + 'b'.repeat(128);
    const sfx = randomUUID().slice(0, 8);
    const tablet = async (naam) =>
        JSON.parse((await s.query(`select toonbank_apparaat_nieuw($1, $2, 'winkel', $3) as r`, [org.id, naam, hash])).rows[0].r);
    const product = async (naam) => {
        const { rows: [{ id }] } = await s.query(
            `insert into winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct) values ($1, $2, 'bier', 'stuk', 1, 21) returning id`,
            [org.id, `${naam} ${sfx}`]);
        await s.query(`select winkel_muteer_voorraad($1, $2, 'telling', 100)`, [org.id, id]);
        return id;
    };
    const appA = await tablet(`Twee tablets A ${sfx}`);
    const appB = await tablet(`Twee tablets B ${sfx}`);
    const P0 = await product('Poort A');
    const P0b = await product('Poort B');
    const P1 = await product('Een');
    const P2 = await product('Twee');

    const bon = (code, volgnr, productId) => {
        const gid = randomUUID();
        return {
            soort: 'bon', gebeurtenis_id: gid, volgnummer: volgnr, moment: '2027-03-06T12:00:00+01:00', medewerker_id: null,
            bon_id: gid, bonnummer: `${code}-${String(volgnr).padStart(6, '0')}`, bon_volgnummer: volgnr, status: 'afgerond',
            kanaal: 'winkel', catalogus_versie: 1, leeftijd: null, totaal_cents: 345, afronding_cents: 0,
            regels: [
                { regelnr: 1, soort: 'verkoop', artikel_id: null, naam: 'Twee tablets', aantal: 1, stuk_cents: 345, korting_cents: 0, bedrag_cents: 345,
                  btw: [{ pct: 21, incl_cents: 345 }], alcohol: false, onderdelen: [{ product_id: productId, hoeveelheid: 1, eenheid: 'stuk' }], prijs_bron: 'catalogus' },
                { regelnr: 2, soort: 'betaling', betaalmethode: 'pin', bedrag_cents: 345 },
            ],
        };
    };
    await s.query(`select toonbank_journaal_opslaan($1, $2, $3::jsonb, '1.1.0')`,
        [org.id, appA.apparaat_id, JSON.stringify([bon(appA.code, 1, P2), bon(appA.code, 2, P0), bon(appA.code, 3, P1)])]);
    await s.query(`select toonbank_journaal_opslaan($1, $2, $3::jsonb, '1.1.0')`,
        [org.id, appB.apparaat_id, JSON.stringify([bon(appB.code, 1, P1), bon(appB.code, 2, P0b), bon(appB.code, 3, P2)])]);

    // C houdt de twee poorten vast; A en B starten, dan laat C los.
    await c.query('begin');
    await c.query(`select 1 from winkel_producten where id in ($1, $2) for update`, [P0, P0b]);
    const t0 = Date.now();
    const rpc = (k, app) => k.query(`select toonbank_verwerk_wachtrij($1, $2) as r`, [org.id, app.apparaat_id])
        .then(() => null, (e) => `${e.code} ${e.message}`);
    const pa = rpc(a, appA);
    await wacht(400);
    const pb = rpc(b, appB);
    await wacht(400);
    await c.query('commit');
    const fouten = (await Promise.all([pa, pb])).filter(Boolean);

    const { rows } = await s.query(
        `select a.code, j.volgnummer, j.verwerk_status, j.pogingen, j.fout_code, left(j.fout_melding, 90) as melding
           from toonbank_journaal j join toonbank_apparaten a on a.id = j.apparaat_id
          where j.apparaat_id in ($1, $2) order by a.code, j.volgnummer`, [appA.apparaat_id, appB.apparaat_id]);
    const { rows: [{ n }] } = await s.query(
        `select count(*)::int as n from winkel_voorraad_mutaties where winkel_product_id = any($1::uuid[]) and type = 'verkoop_kassa'`,
        [[P0, P0b, P1, P2]]);
    console.log(`klaar na ${Date.now() - t0} ms`);
    console.table(rows);
    if (fouten.length) console.log('RPC-fout:', fouten.join(' | '));
    geslaagd = !fouten.length && rows.length === 6 && rows.every((r) => r.verwerk_status === 'verwerkt') && n === 6;
    console.log(geslaagd
        ? `GESLAAGD: twee tablets tegelijk, gekruiste producten: alle 6 bonnen verwerkt, 6 × verkoop_kassa, geen deadlock`
        : `FOUT: niet alle bonnen verwerkt (${n} × verkoop_kassa)`);
} finally {
    for (const k of [s, a, b, c]) await k.end().catch(() => {});
}
process.exit(geslaagd ? 0 : 1);
