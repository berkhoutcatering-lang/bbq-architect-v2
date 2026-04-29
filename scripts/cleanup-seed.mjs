// Cleanup: leest scripts/seed-state.json en verwijdert alle records die seed
// heeft aangemaakt. Volgorde: child → parent (FK-respect).
//
// Run: `node scripts/cleanup-seed.mjs`

import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const stateFile = join(__dirname, 'seed-state.json');
if (!existsSync(stateFile)) {
    console.error('Geen seed-state.json gevonden — niets om op te ruimen.');
    process.exit(1);
}

const state = JSON.parse(readFileSync(stateFile, 'utf8'));
console.log('State uit:', state.seededAt);

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// Volgorde: child → parent. Records met FK's eerst weg, daarna parents.
const order = [
    'portal_berichten',     // → klanten
    'event_allergies',      // → events
    'pack_lists',           // → events
    'inkooplijsten',        // → events
    'prep_tasks',           // → events
    'time_logs',            // → events (soft, geen hard FK)
    'rtr_items',            // standalone
    'bonnen',               // → leveranciers (soft)
    'facturen',             // → offertes/events
    'offertes',             // → events
    'events',               // → klanten (soft)
    'inventory',            // → leveranciers
    'gerechten',            // → gangen via slug
    'gangen',
    'recepten',
    'materieel',
    'klanten',
    'leveranciers',
];

let totalDeleted = 0;
for (const table of order) {
    const ids = state[table];
    if (!ids || ids.length === 0) continue;
    const { error, count } = await sb
        .from(table)
        .delete({ count: 'exact' })
        .in('id', ids);
    if (error) {
        console.error(`✗ ${table}: ${error.message}`);
        continue;
    }
    console.log(`✓ ${table}: ${count ?? ids.length} rows verwijderd`);
    totalDeleted += count ?? ids.length;
}

console.log(`\nTotaal: ${totalDeleted} rows verwijderd.`);
unlinkSync(stateFile);
console.log('seed-state.json verwijderd.');
