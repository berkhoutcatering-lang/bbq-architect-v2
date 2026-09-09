// Demo-keukendag: zet één geloofwaardige productiedag neer zodat het
// wandscherm, de tablet, het kookbord en de briefing allemaal iets te tonen
// hebben. Zonder data blijft alles leeg en valt er niets te beoordelen.
//
// Het scenario is dat van Mathijs zelf: winkel dicht, dus een MEP-dag, met de
// voorbereiding voor een bruiloft aan het eind van de week. Inclusief de stap
// die geen enkel receptenboek opschrijft — vlees uit de koelcel zodat het op
// temperatuur komt.
//
// Run:      node scripts/seed-keukendag.mjs
// Weghalen: node scripts/seed-keukendag.mjs --verwijder
//
// Alles wat dit script aanmaakt staat in scripts/keukendag-state.json. Dat
// bestand is de waarheid bij het opruimen — geen zoeken op naam, geen
// gokwerk. In de zichtbare velden staat bewust GEEN [SEED]-prefix: je moet
// naar dit scherm kunnen kijken zoals het in het echt zou zijn. De markering
// staat in de notitie-velden.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
);

const ORG = '3f6f7bfd-4f0d-407e-b505-7c6ab0c2c879';   // Hop & Bites
const YS1500 = 21;                                     // pelletgrill — indirect en roken
const HOUTSKOOL = 1;                                   // 24×48 — direct grillen
const MARKER = 'demo-keukendag';
const STATE = join(__dirname, 'keukendag-state.json');

/* ── Tijd ───────────────────────────────────────────────────────────
   Alles hangt aan vandaag, zodat de dag altijd klopt wanneer je hem ook
   draait. Uitlevering is zaterdag; vandaag is de MEP-dag ervoor. */

const nu = new Date();
function overDagen(n, uur = 16) {
    const d = new Date(nu);
    d.setDate(d.getDate() + n);
    d.setHours(uur, 0, 0, 0);
    return d;
}
const zaterdag = overDagen((6 - nu.getDay() + 7) % 7 || 5);
const datumISO = (d) => d.toISOString().slice(0, 10);

/* ── De receptstappen ───────────────────────────────────────────────
   Voor de brisketburger. Bewust op ZIJN apparatuur: indirect gaat naar de
   YS1500s, en het rookhout uit een boekrecept vervalt daar — pellets maken
   hun eigen rook. Zie src/lib/keukenplanner/apparaatKeuze.ts.

   duur_bron staat overal op 'geschat': er is nog niets gemeten, en dat hoort
   het scherm te laten zien. */

const STAPPEN = [
    {
        volg: 1, tekst: 'Brisket uit de koelcel op de werkbank',
        actie: 'mise-en-place', bewerking: 'tempereren',
        actief: 5, passief: 60,
        toelichting: 'Laten tempereren — koud vlees rookt ongelijk',
    },
    /* Aanzetten en opwarmen zijn twee blokken, geen één. Zet je ze samen,
       dan zegt het scherm een uur lang "je bent bezig" terwijl je na één
       minuut vrij bent — en juist dat uur is de ruimte waar dit systeem het
       voor doet. De planner hoort dit tweede blok straks zelf te maken uit
       materieel.opwarm_min (bouwplan §2.5); tot die tijd staat het hier. */
    {
        volg: 2, tekst: 'Smoker aanzetten', actie: 'voorverwarmen',
        bewerking: 'aanzetten', actief: 1, kunde: 'smoker',
    },
    {
        volg: 9, tekst: 'Smoker komt op 120 °C', actie: 'voorverwarmen',
        bewerking: 'opwarmen', passief: 60, kunde: 'smoker', temp: 120,
        toelichting: 'Ondertussen ben je vrij',
    },
    {
        volg: 3, tekst: 'Brisket trimmen', actie: 'snijden', bewerking: 'trimmen',
        actief: 25, hoeveelheid: 12, eenheid: 'kg',
        toelichting: 'Vetkap tot 6 mm, zilvervlies eraf',
    },
    {
        volg: 4, tekst: 'Brisket rondom kruiden met beef rub',
        actie: 'kruiden', bewerking: 'kruiden', actief: 10,
        hoeveelheid: 0.2, eenheid: 'kg', hangtAf: 3,
    },
    {
        volg: 5, tekst: 'Brisket op de smoker', actie: 'beladen', bewerking: 'beladen',
        actief: 5, kunde: 'smoker', hangtAf: 4,
    },
    {
        volg: 6, tekst: 'Roken op 120 °C', actie: 'roken', bewerking: 'roken',
        passief: 300, kunde: 'smoker', temp: 120, refKg: 6, hangtAf: 5,
        toelichting: 'Tot het deksel erop gaat — daarna komt er geen rook meer bij',
    },
    {
        volg: 10, tekst: 'Deksel erop en nagaren tot kern 90 °C',
        actie: 'garen', bewerking: 'nagaren',
        passief: 300, kunde: 'oven', temp: 90, refKg: 6, hangtAf: 6,
        toelichting: 'Alleen nog warmte — dit hoeft niet op de smoker',
    },
    {
        volg: 7, tekst: 'Sriracha mayo aanmaken', actie: 'emulgeren', bewerking: 'emulgeren',
        actief: 20, hoeveelheid: 2, eenheid: 'l',
    },
    {
        volg: 8, tekst: 'Bosui flinterdun snijden', actie: 'snijden', bewerking: 'snijden',
        actief: 8, hoeveelheid: 1, eenheid: 'kg',
    },
];

/* ── De drie aanvragen ──────────────────────────────────────────────
   Met conceptantwoord, want dat is wat de briefing 's ochtends klaarzet. */

const AANVRAGEN = [
    {
        naam: 'Annemarie Vos', email: 'a.vos@example.invalid',
        gasten: 22, dagen: 9, type: 'borrel',
        bericht: 'Hoi! We hebben een borrel voor 22 mensen, kunnen jullie borrelplanken verzorgen?',
        concept: 'Dag Annemarie, dank voor je bericht. Voor 22 personen kunnen we borrelplanken verzorgen; die datum staat nog vrij in onze agenda. Ik stuur je vandaag een voorstel met twee opties.',
    },
    {
        naam: 'Bouwbedrijf Kremer', email: 'planning@kremer.example.invalid',
        gasten: 65, dagen: 24, type: 'personeelsfeest',
        bericht: 'Personeelsfeest eind volgende maand, ongeveer 65 man. Wat kost een BBQ bij ons op het terrein?',
        concept: 'Goedemiddag, dank voor de aanvraag. Voor 65 personen op locatie werken wij met een vaste opstelling; ik zet een voorstel klaar met richtprijs per persoon en wat we meenemen.',
    },
    {
        naam: 'Familie Doornbos', email: 'doornbos.fam@example.invalid',
        gasten: 14, dagen: 4, type: 'verjaardag',
        bericht: 'Zaterdag over een week jarig, 14 personen. Is dat nog mogelijk?',
        concept: 'Dag familie Doornbos, over vier dagen is kort dag maar niet onmogelijk — er staat die zaterdag al een klus, dus ik kijk of het qua tijd past en bel u vandaag even.',
    },
];

/* ────────────────────────────────────────────────────────────────── */

async function seed() {
    if (existsSync(STATE)) {
        console.error('Er staat al een demo-keukendag. Eerst weghalen:\n  node scripts/seed-keukendag.mjs --verwijder');
        process.exit(1);
    }

    const state = { gemaaktOp: nu.toISOString(), marker: MARKER, event: null, stappen: [], taken: [], leads: [], bonnen: [] };

    /* Vangnet: wat er ook misgaat, wat al aangemaakt is moet weg te halen
       zijn. Een seeder die bij een fout rommel achterlaat is erger dan een
       seeder die niet werkt. */
    const bewaar = () => writeFileSync(STATE, JSON.stringify(state, null, 2));
    process.on('exit', () => { if (state.event || state.taken.length) bewaar(); });

    // 1 — Het event waar de MEP voor is.
    const { data: ev, error: evErr } = await sb.from('events').insert({
        organization_id: ORG,
        name: 'Bruiloft Zweeloo',
        date: datumISO(zaterdag),
        start_time: '16:00',
        guests: 40,
        location: 'Zweeloo',
        status: 'bevestigd',
        client_naam: 'Fam. Zwiers',
        type: 'bruiloft',
        notitie: `[${MARKER}] demo-data`,
    }).select('id').single();
    if (evErr) throw evErr;
    state.event = ev.id;
    console.log(`Event: Bruiloft Zweeloo op ${datumISO(zaterdag)}, 40 gasten (id ${ev.id})`);

    // 2 — Receptstappen voor de brisketburger.
    const GERECHT = '3b7677f0-519b-441f-b831-fa2905825884'; // Pulled Brisket Burger Deluxe
    const stapIdVanVolg = {};
    for (const s of STAPPEN) {
        const { data, error } = await sb.from('recipe_steps').insert({
            organization_id: ORG,
            gerecht_id: GERECHT,
            step_order: s.volg,
            tekst: s.tekst,
            actie: s.actie ?? null,
            bewerking_code: s.bewerking ?? null,
            duur_actief_min: s.actief ?? null,
            duur_passief_min: s.passief ?? null,
            duur_vast_min: s.actief ?? null,
            passief_ref_kg: s.refKg ?? null,
            hoeveelheid: s.hoeveelheid ?? null,
            eenheid: s.eenheid ?? null,
            materieel_id: s.materieel ?? null,
            kunde: s.kunde ?? null,
            temp_doel_c: s.temp ?? null,
            hangt_af_van_stap_id: s.hangtAf ? stapIdVanVolg[s.hangtAf] : null,
            duur_bron: 'geschat',
            bron: MARKER,
            plaats: 'thuis',
        }).select('id').single();
        if (error) throw error;
        stapIdVanVolg[s.volg] = data.id;
        state.stappen.push(data.id);
    }
    console.log(`Receptstappen: ${STAPPEN.length} voor Pulled Brisket Burger Deluxe`);

    /* 3 — De taken. Bewust vanaf NU en niet op een vast ochtenduur: draai je
       de demo om vier uur 's middags, dan wil je een levende dag zien en geen
       ochtend die al voorbij is. De onderlinge afstanden blijven kloppen. */
    const OFFSET_MIN = { 1: 0, 2: 5, 9: 6, 3: 75, 4: 105, 5: 120, 6: 130, 10: 435, 7: 15, 8: 40 };
    const start = new Date(nu);
    start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
    const vanafNu = (min) => new Date(start.getTime() + min * 60000).toISOString();

    for (const s of STAPPEN) {
        const { data, error } = await sb.from('prep_tasks').insert({
            organization_id: ORG,
            event_id: ev.id,
            gerecht_id: GERECHT,
            recipe_step_id: stapIdVanVolg[s.volg],
            text: s.tekst,
            notes: `[${MARKER}] ${s.toelichting ?? ''}`.trim(),
            status: 'planned',
            scheduled_at: vanafNu(OFFSET_MIN[s.volg]),
            duur_actief_min: s.actief ?? null,
            duur_passief_min: s.passief ?? null,
            duration_min: (s.actief ?? 0) + (s.passief ?? 0) || null,
            target_qty: s.hoeveelheid ?? null,
            target_unit: s.eenheid ?? null,
            stuk_gewicht_kg: s.refKg ?? null,
            materieel_id: s.materieel ?? null,
            kunde: s.kunde ?? null,
            bewerking_code: s.bewerking ?? null,
            phase: 'other',
            dagen: 0,
        }).select('id').single();
        if (error) throw error;
        state.taken.push(data.id);
    }

    // Eén schoonmaaktaak, want die hoort in het gat van het roken te vallen.
    const { data: schoon, error: schoonErr } = await sb.from('prep_tasks').insert({
        organization_id: ORG,
        text: 'Robot Coupe schoonmaken',
        notes: `[${MARKER}] hoort in de wachttijd van de smoker te passen`,
        status: 'planned',
        scheduled_at: vanafNu(240),
        duur_actief_min: 8,
        duration_min: 8,
        bewerking_code: 'schoonmaken',
        phase: 'other',
        dagen: 0,
    }).select('id').single();
    if (schoonErr) throw schoonErr;
    state.taken.push(schoon.id);
    console.log(`Taken vandaag: ${state.taken.length}`);

    // 4 — Drie binnengekomen aanvragen met conceptantwoord.
    for (const a of AANVRAGEN) {
        const { data, error } = await sb.from('leads').insert({
            organization_id: ORG,
            naam: a.naam,
            email: a.email,
            gasten: a.gasten,
            event_datum: datumISO(overDagen(a.dagen)),
            event_type: a.type,
            bericht: `${a.bericht}\n\n[${MARKER}]`,
            ai_concept: a.concept,
            status: 'nieuw',
            /* `leads.source` kent alleen public_form, manual, klantgesprek en
               arrangement — géén 'email'. Dat is precies het gat: een
               aanvraag per mail bestaat in dit schema nog niet eens als bron.
               Voor de demo doen we alsof hij is overgetikt. */
            source: 'manual',
        }).select('id').single();
        if (error) throw error;
        state.leads.push(data.id);
    }
    console.log(`Aanvragen: ${AANVRAGEN.length}, met conceptantwoord`);

    // 5 — Eén binnengekomen leveranciersfactuur die om een beslissing vraagt.
    const { data: bon, error: bonErr } = await sb.from('bonnen').insert({
        organization_id: ORG,
        winkel: 'Beef Club',
        datum: datumISO(nu),
        totaal_bedrag: 487.65,
        netto_bedrag: 447.39,
        btw_laag_bedrag: 40.26,
        btw_pct: 9,
        status: 'review',   // wacht op jouw akkoord
        source: 'email',
        source_type: 'email',
        notities: `[${MARKER}] demo — binnengekomen per mail, wacht op akkoord`,
    }).select('id').single();
    if (bonErr) throw bonErr;
    state.bonnen.push(bon.id);
    console.log('Leveranciersfactuur: Beef Club, € 487,65 — wacht op akkoord');

    writeFileSync(STATE, JSON.stringify(state, null, 2));
    console.log(`\nKlaar. Weghalen kan met:\n  node scripts/seed-keukendag.mjs --verwijder`);
}

async function verwijder() {
    if (!existsSync(STATE)) {
        console.error('Geen keukendag-state.json — er valt niets weg te halen.');
        process.exit(1);
    }
    const state = JSON.parse(readFileSync(STATE, 'utf8'));

    /* Volgorde: kind vóór ouder, anders blokkeert een foreign key. */
    const stappen = [
        ['taakmetingen', 'prep_task_id', state.taken],
        ['prep_tasks', 'id', state.taken],
        ['recipe_steps', 'id', state.stappen],
        ['leads', 'id', state.leads],
        ['bonnen', 'id', state.bonnen],
        ['events', 'id', state.event ? [state.event] : []],
    ];

    for (const [tabel, kolom, ids] of stappen) {
        if (!ids || ids.length === 0) continue;
        /* `select()` erbij zodat we tellen wat er ECHT weg is en niet hoeveel
           we hebben gevraagd. Een teller die het aangevraagde aantal print
           zegt "9 weg" terwijl er nul rijen bestonden. */
        const { data, error } = await sb.from(tabel).delete().in(kolom, ids).eq('organization_id', ORG).select('id');
        if (error) console.error(`  ${tabel}: ${error.message}`);
        else console.log(`  ${tabel}: ${(data ?? []).length} weg`);
    }

    unlinkSync(STATE);
    console.log('\nDemo-keukendag opgeruimd.');
}

const weg = process.argv.includes('--verwijder');
(weg ? verwijder() : seed()).catch((e) => {
    console.error('Mislukt:', e.message ?? e);
    process.exit(1);
});
