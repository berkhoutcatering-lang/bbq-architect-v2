// Importeert de kennisbank uit data/kennisbank/ naar Supabase.
//
// De kennisbank is naslag, geen bedrijfsdata: culinaire feiten die niet per
// cateraar verschillen. Daarom staat hij als bestand in het repo — versiebeheer,
// leesbaar in een diff, opnieuw importeerbaar als er iets misgaat.
//
// Bypass RLS via service_role; de doeltabellen laten alleen lezen toe vanuit
// de app.
//
// Run:
//   node scripts/import-kennisbank.mjs              alles
//   node scripts/import-kennisbank.mjs citrussen    één productgroep
//   node scripts/import-kennisbank.mjs --dry-run    laat zien wat er zou gebeuren
//
// Idempotent: werkt bij op slug/klacht, maakt geen dubbelen aan.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const KB = join(ROOT, 'data', 'kennisbank');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const groepFilter = args.find((a) => !a.startsWith('--')) || null;

/* ── env ───────────────────────────────────────────────────────────── */
const envPath = join(ROOT, '.env.local');
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.+)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!url || !key)) {
    console.error('Ontbrekend: NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(2);
}

const sb = dryRun
    ? null
    : createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

/* ── helpers ───────────────────────────────────────────────────────── */
const lees = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** Alleen velden meesturen die daadwerkelijk in het bestand staan. Zo overschrijft
 *  een onvolledig bestand geen eerder ingevulde kolommen met null. */
function pak(bron, mapping) {
    const rij = {};
    for (const [kolom, sleutel] of Object.entries(mapping)) {
        const v = bron[sleutel];
        if (v !== undefined) rij[kolom] = v;
    }
    return rij;
}

async function upsert(tabel, rijen, conflictKolom) {
    if (!rijen.length) return { aantal: 0 };
    if (dryRun) {
        console.log(`  [dry-run] ${tabel}: ${rijen.length} rijen`);
        console.log(`            eerste: ${JSON.stringify(rijen[0]).slice(0, 140)}…`);
        return { aantal: rijen.length };
    }
    const { error } = await sb.from(tabel).upsert(rijen, { onConflict: conflictKolom });
    if (error) {
        console.error(`  ✗ ${tabel}: ${error.message}`);
        process.exitCode = 1;
        return { aantal: 0 };
    }
    console.log(`  ✓ ${tabel}: ${rijen.length} rijen`);
    return { aantal: rijen.length };
}

/* ── 1. balans-correcties ──────────────────────────────────────────── */
async function importBalans() {
    const pad = join(KB, 'balans-correcties.json');
    if (!existsSync(pad)) return 0;
    const doc = lees(pad);
    const rijen = (doc.correcties || []).map((c) => ({
        klacht: c.klacht,
        omschrijving: c.omschrijving,
        voeg_toe: c.voegToe,
        toelichting: c.toelichting ?? null,
    }));
    console.log(`\nBalans-correcties (v${doc.versie})`);
    return (await upsert('balans_correcties', rijen, 'klacht')).aantal;
}

/* ── 2. technieken ─────────────────────────────────────────────────── */
async function importTechnieken() {
    const pad = join(KB, 'technieken.json');
    if (!existsSync(pad)) return 0;
    const doc = lees(pad);
    const rijen = (doc.technieken || []).map((t) =>
        pak(t, {
            slug: 'slug',
            naam: 'naam',
            omschrijving: 'omschrijving',
            vereist_basis: 'vereistBasis',
            vereist_eigenschap: 'vereistEigenschap',
            hulpmiddel: 'hulpmiddel',
            dosering_min_pct: 'doseringMinPct',
            dosering_max_pct: 'doseringMaxPct',
            eindtextuur: 'eindtextuur',
            apparaat: 'apparaat',
            standtijd_min: 'standtijdMin',
            transport_bestendig: 'transportBestendig',
            stappen: 'stappen',
            bron: 'bron',
        })
    );
    console.log(`\nTechnieken (v${doc.versie})`);
    return (await upsert('technieken', rijen, 'slug')).aantal;
}

/* ── 3. gastronorm-maten ───────────────────────────────────────────── */
async function importGnMaten() {
    const pad = join(KB, 'gn-maten.json');
    if (!existsSync(pad)) return 0;
    const doc = lees(pad);
    const rijen = (doc.maten || []).map((m) => ({
        code: m.code,
        naam: m.naam,
        lengte_mm: m.lengteMm,
        breedte_mm: m.breedteMm,
        diepte_mm: m.diepteMm,
        inhoud_liter: m.inhoudLiter ?? null,
        vulgraad: m.vulgraad ?? null,
        stapelbaar: m.stapelbaar ?? null,
        bron: doc.bron ?? null,
    }));
    console.log(`\nGastronorm-maten (v${doc.versie})`);
    return (await upsert('gn_maten', rijen, 'code')).aantal;
}

/* ── 4. ingrediënt-profielen, per productgroep ─────────────────────── */
async function importIngredienten() {
    const map = join(KB, 'ingredienten');
    if (!existsSync(map)) return 0;

    let bestanden = readdirSync(map).filter((f) => f.endsWith('.json'));
    if (groepFilter) {
        bestanden = bestanden.filter((f) => f.replace(/\.json$/, '') === groepFilter);
        if (!bestanden.length) {
            console.error(`Geen productgroep "${groepFilter}" gevonden in ${map}`);
            process.exitCode = 1;
            return 0;
        }
    }

    let totaal = 0;
    for (const bestand of bestanden) {
        const doc = lees(join(map, bestand));
        const groep = doc.productgroep || bestand.replace(/\.json$/, '');
        const rijen = (doc.ingredienten || []).map((i) => ({
            productgroep: groep,
            ...pak(i, {
                slug: 'slug',
                naam: 'naam',
                vet_pct: 'vetPct',
                vocht_pct: 'vochtPct',
                eiwit_pct: 'eiwitPct',
                zout_pct: 'zoutPct',
                suiker_pct: 'suikerPct',
                ph: 'ph',
                dichtheid_g_per_ml: 'dichtheid',
                rol: 'rol',
                smaakpalet: 'smaakpalet',
                smaakregister: 'smaakregister',
                aroma_drempel_pct: 'aromaDrempelPct',
                prikkel_drempel_pct: 'prikkelDrempelPct',
                dosering_min_pct: 'doseringMinPct',
                dosering_max_pct: 'doseringMaxPct',
                hitte_gedrag: 'hitteGedrag',
                structuur_effect: 'structuurEffect',
                textuur_eind: 'textuurEind',
                kleur: 'kleur',
                stappen_kosten: 'stappenKosten',
                aroma_componenten: 'aromaComponenten',
                bron: 'bron',
            }),
        }));

        // Waarschuw als harde getallen zonder bron zijn ingevuld: dan is het een
        // gok die zich voordoet als feit.
        const zonderBron = rijen.filter(
            (r) => !r.bron && [r.vet_pct, r.vocht_pct, r.eiwit_pct, r.ph].some((v) => v != null)
        );
        if (zonderBron.length) {
            console.warn(
                `  ! ${groep}: ${zonderBron.length} met samenstellingscijfers zonder bron — ${zonderBron
                    .map((r) => r.slug)
                    .join(', ')}`
            );
        }

        console.log(`\nIngrediënten · ${groep} (v${doc.versie ?? '?'})`);
        totaal += (await upsert('ingredient_profielen', rijen, 'slug')).aantal;
    }
    return totaal;
}

/* ── uitvoeren ─────────────────────────────────────────────────────── */
console.log(dryRun ? 'Kennisbank importeren — DRY RUN, er wordt niets geschreven' : 'Kennisbank importeren');

const n =
    (groepFilter ? 0 : await importBalans()) +
    (groepFilter ? 0 : await importTechnieken()) +
    (groepFilter ? 0 : await importGnMaten()) +
    (await importIngredienten());

console.log(`\nKlaar — ${n} rijen ${dryRun ? 'zouden worden weggeschreven' : 'weggeschreven'}.`);
if (process.exitCode === 1) console.log('Er ging iets mis; zie de regels met ✗ hierboven.');
