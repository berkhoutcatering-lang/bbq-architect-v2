// Wist de lokale testdatabase en bouwt hem opnieuw op: stoppen, .data weg,
// nieuw cluster, starten, Supabase nabootsen en alle migraties erop.
// De seed en de tests daarna los: run seed, run test.

import fs from 'node:fs';
import { DATA, isHoofd } from './lib.mjs';
import { migreer } from './migreer.mjs';
import { start } from './start.mjs';
import { stop } from './stop.mjs';

async function opnieuw() {
    await stop();
    fs.rmSync(DATA, { recursive: true, force: true });
    console.log('tools/testdb/.data gewist.');
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
