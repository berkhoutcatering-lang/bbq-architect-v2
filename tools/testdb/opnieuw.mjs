// Wist de lokale testdatabase en bouwt hem opnieuw op: stoppen, .data weg,
// nieuw cluster, starten, Supabase nabootsen en alle migraties erop.
// De seed en de tests daarna los: run seed, run test.

import fs from 'node:fs';
import path from 'node:path';
import { CLUSTER, DATA, isHoofd, POORTBESTAND } from './lib.mjs';
import { migreer } from './migreer.mjs';
import { start } from './start.mjs';
import { stop } from './stop.mjs';

// Alleen een map wissen die echt een testdatabase is (of leeg): met TESTDB_DATA
// kan de map overal staan, en een tikfout mag nooit iets anders weggooien.
function isTestdbMap(map) {
    if (!fs.existsSync(map)) return true;
    const inhoud = fs.readdirSync(map);
    return inhoud.length === 0 || fs.existsSync(path.join(CLUSTER, 'PG_VERSION')) || fs.existsSync(POORTBESTAND);
}

async function opnieuw() {
    await stop();
    if (!isTestdbMap(DATA)) {
        throw new Error(`${DATA} is geen testdatabase (geen pg/PG_VERSION en geen poort-bestand) en is niet leeg. Ik wis hem niet; kies een andere TESTDB_DATA.`);
    }
    fs.rmSync(DATA, { recursive: true, force: true });
    console.log(`${path.relative(process.cwd(), DATA) || DATA} gewist.`);
    await start();
    await migreer();
}

if (isHoofd(import.meta.url)) {
    opnieuw().catch((e) => {
        console.error('\nOPNIEUW OPBOUWEN MISLUKT');
        console.error(e.testdbUitleg ?? e.message);
        process.exit(1);
    });
}
