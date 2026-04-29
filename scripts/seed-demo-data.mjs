// Seed-script: vult Hop & Bites org met realistische demo-data NAAST bestaande
// productie-data zodat alle pagina's data hebben. Alles met [SEED] prefix in
// zichtbare velden + IDs in state-file voor 1-click cleanup.
//
// Bypass RLS via service_role.
// Run: `node scripts/seed-demo-data.mjs`
// Cleanup: `node scripts/cleanup-seed.mjs`

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const ORG_ID = '3f6f7bfd-4f0d-407e-b505-7c6ab0c2c879'; // Hop & Bites
const T = '[SEED]'; // tag voor alle zichtbare velden

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// Datums relatief aan vandaag (2026-04-29)
const today = new Date('2026-04-29');
const fmtDate = (d) => d.toISOString().slice(0, 10);
const daysFromNow = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return fmtDate(d);
};

const state = {
    seededAt: new Date().toISOString(),
    org_id: ORG_ID,
    leveranciers: [],
    klanten: [],
    gangen: [],
    recepten: [],
    gerechten: [],
    inventory: [],
    materieel: [],
    events: [],
    offertes: [],
    facturen: [],
    inkooplijsten: [],
    prep_tasks: [],
    time_logs: [],
    event_allergies: [],
    rtr_items: [],
    pack_lists: [],
    portal_berichten: [],
    bonnen: [],
};

// Tabellen die GEEN organization_id kolom hebben (gekoppeld via parent-FK)
const NO_ORG = new Set(['portal_berichten']);

async function insert(table, rows, returningCol = 'id') {
    if (rows.length === 0) return [];
    const enriched = NO_ORG.has(table)
        ? rows
        : rows.map((r) => ({ ...r, organization_id: ORG_ID }));
    const { data, error } = await sb.from(table).insert(enriched).select(returningCol);
    if (error) {
        console.error(`✗ ${table}:`, error.message);
        throw error;
    }
    state[table].push(...data.map((r) => r[returningCol]));
    console.log(`✓ ${table}: ${data.length} rows`);
    return data;
}

// ─── 1. Leveranciers ──────────────────────────────────────────────────────────
const lev = await insert('leveranciers', [
    { naam: T + ' Slagerij De Laat', type: 'Vlees', contact: 'Mark de Laat', tel: '0570-612345', email: 'mark@delaat-vlees.nl' },
    { naam: T + ' Vishandel Noordzee', type: 'Vis', contact: 'Petra Noord', tel: '0118-555012', email: 'orders@noordzee-vis.nl' },
    { naam: T + ' BBQ Fuel BV', type: 'Brandstof', contact: 'Jan Houtskool', tel: '030-9988776', email: 'sales@bbqfuel.nl' },
    { naam: T + ' Bakkerij Hoffmann', type: 'Brood', contact: 'Lisa Hoffmann', tel: '055-3344556', email: 'lisa@hoffmann-brood.nl' },
    { naam: T + ' Sligro Zwolle', type: 'Algemeen', contact: 'Account manager', tel: '038-1122334', email: 'zwolle@sligro.nl' },
]);

// ─── 2. Klanten (mix particulier + zakelijk) ─────────────────────────────────
const klanten = await insert('klanten', [
    { naam: T + ' Familie Pietersen', bedrijf: '', adres: 'Lindenlaan 12', postcode: '8011 PP', plaats: 'Zwolle', telefoon: '06-12345678', email: 'pietersen@hotmail.com', type: 'Particulier', notities: T + ' Vaste klant, 50e verjaardag jaarlijks. Wil altijd extra brood.' },
    { naam: T + ' Acme Solutions', bedrijf: 'Acme Solutions BV', adres: 'Industrieweg 88', postcode: '8021 AB', plaats: 'Zwolle', telefoon: '038-4567890', email: 'events@acme.nl', type: 'Zakelijk', notities: T + ' Bedrijfsfeesten 2x/jaar. Bestuurder vegetarisch.' },
    { naam: T + ' Bruiloft van Dijk', bedrijf: '', adres: 'Hoofdstraat 5', postcode: '7777 BB', plaats: 'Dalfsen', telefoon: '06-87654321', email: 'mark.vandijk@gmail.com', type: 'Particulier', notities: T + ' Bruiloft juni, 120 gasten.' },
    { naam: T + ' Sportclub HCZ', bedrijf: 'HC Zwolle', adres: 'Sportlaan 3', postcode: '8025 SS', plaats: 'Zwolle', telefoon: '038-2233445', email: 'penningmeester@hcz.nl', type: 'Zakelijk', notities: T + ' Eindeseizoen-BBQ jaarlijks juni.' },
    { naam: T + ' Familie de Boer', bedrijf: '', adres: 'Beukenlaan 22', postcode: '8014 BL', plaats: 'Zwolle', telefoon: '06-11223344', email: 'deboer.familie@kpnmail.nl', type: 'Particulier', notities: T + ' Geboortefeest, kleine groep.' },
    { naam: T + ' Bouwbedrijf Jansen', bedrijf: 'Jansen Bouw BV', adres: 'Ambachtsstraat 14', postcode: '8013 JB', plaats: 'Zwolle', telefoon: '038-7788990', email: 'admin@jansenbouw.nl', type: 'Zakelijk', notities: T + ' Personeels-BBQ jaarlijks.' },
    { naam: T + ' Stichting Beeklust', bedrijf: 'Beeklust Buurthuis', adres: 'Beeklaan 9', postcode: '8016 BL', plaats: 'Zwolle', telefoon: '038-9988776', email: 'bestuur@beeklust.nl', type: 'Zakelijk', notities: T + ' Buurt-BBQ.' },
    { naam: T + ' Loonbedrijf Westerveld', bedrijf: 'Westerveld Agrarisch', adres: 'Polderweg 33', postcode: '7945 PW', plaats: 'Wezuperbrug', telefoon: '0591-345678', email: 'info@westerveld-loon.nl', type: 'Zakelijk', notities: T + ' Oogstfeest najaar.' },
]);

// ─── 3. Gangen — gebruik bestaande slugs, voeg alleen ontbrekende toe ────────
// Bestaande: bites, voorgerechten, hoofdgerechten, dessert
const gangenNew = await insert('gangen', [
    { naam: T + ' Bijgerecht', slug: 'seed-bijgerecht', minimum: 2, extra_prijs_pp: 0, volgorde: 5, actief: true },
    { naam: T + ' Vegetarisch', slug: 'seed-vegetarisch', minimum: 1, extra_prijs_pp: 0, volgorde: 6, actief: true },
]);

// ─── 4. Recepten ──────────────────────────────────────────────────────────────
await insert('recepten', [
    { naam: T + ' Texas-style Brisket', categorie: 'Vlees', porties: 10, preptime: 720, ingredienten: [{naam:'Brisket', hoeveelheid:5, eenheid:'kg'},{naam:'Bruine suiker', hoeveelheid:100, eenheid:'g'},{naam:'Paprikapoeder', hoeveelheid:50, eenheid:'g'}], instructies: '1. Trim brisket, laat 1cm vetlaag. 2. Rub aanbrengen, 12u laten intrekken. 3. Smoker 110°C, 10-12u tot kerntemperatuur 95°C. 4. Rusten 1u in folie.', notitie: T + ' Signatuur-gerecht Hop & Bites' },
    { naam: T + ' Pulled Pork Carolina', categorie: 'Vlees', porties: 12, preptime: 600, ingredienten: [{naam:'Procureur', hoeveelheid:4, eenheid:'kg'},{naam:'Mosterd', hoeveelheid:3, eenheid:'el'}], instructies: '1. Mosterdlaag aanbrengen. 2. Rub generously. 3. Smoker 120°C tot 96°C kerntemperatuur. 4. Pull met forks of klauwen.', notitie: T },
    { naam: T + ' Spare Ribs St. Louis', categorie: 'Vlees', porties: 6, preptime: 360, ingredienten: [{naam:'Spare ribs', hoeveelheid:2, eenheid:'kg'}], instructies: '3-2-1 methode: 3u roken op 110°C, 2u in folie met appelsap, 1u glaze.', notitie: T },
    { naam: T + ' Gerookte Zalmfilet', categorie: 'Vis', porties: 8, preptime: 180, ingredienten: [{naam:'Zalmfilet heel', hoeveelheid:1.5, eenheid:'kg'}], instructies: 'Pekelen 4u, drogen 1u, koud roken 12u op elzenhout.', notitie: T },
    { naam: T + ' Coleslaw Hop & Bites', categorie: 'Salade', porties: 20, preptime: 30, ingredienten: [{naam:'Witte kool', hoeveelheid:1, eenheid:'kg'},{naam:'Wortel', hoeveelheid:300, eenheid:'g'},{naam:'Mayonaise', hoeveelheid:200, eenheid:'g'}], instructies: 'Schaaf alles fijn, meng dressing met mayo, azijn, mosterd, peper. Min 2u trekken.', notitie: T },
    { naam: T + ' Mac & Cheese', categorie: 'Bijgerecht', porties: 10, preptime: 45, ingredienten: [{naam:'Macaroni', hoeveelheid:500, eenheid:'g'},{naam:'Cheddar', hoeveelheid:300, eenheid:'g'}], instructies: 'Pasta al dente, kaassaus van bechamel + 3 kazen, oven 180°C 15 min.', notitie: T },
    { naam: T + ' Honey Mustard BBQ Saus', categorie: 'Saus', porties: 30, preptime: 20, ingredienten: [{naam:'Honing', hoeveelheid:200, eenheid:'g'},{naam:'Mosterd', hoeveelheid:100, eenheid:'g'}], instructies: 'Alles mengen, 10 min zachtjes laten reduceren.', notitie: T },
    { naam: T + ' Memphis Dry Rub', categorie: 'Rub', porties: 50, preptime: 10, ingredienten: [{naam:'Bruine suiker', hoeveelheid:200, eenheid:'g'},{naam:'Paprika', hoeveelheid:100, eenheid:'g'},{naam:'Knoflookpoeder', hoeveelheid:50, eenheid:'g'}], instructies: 'Alle droge kruiden mengen, in luchtdichte pot bewaren tot 6 maanden.', notitie: T },
    { naam: T + ' Gegrilde Mais met Lime', categorie: 'Bijgerecht', porties: 12, preptime: 25, ingredienten: [{naam:'Maiskolf', hoeveelheid:12, eenheid:'st'}], instructies: 'Voorkoken 5 min, grillen 8 min onder draaien, lime-boter erbij.', notitie: T },
    { naam: T + ' Vegan BBQ Jackfruit', categorie: 'Vlees', porties: 8, preptime: 60, ingredienten: [{naam:'Jackfruit blik', hoeveelheid:2, eenheid:'st'},{naam:'BBQ saus', hoeveelheid:200, eenheid:'g'}], instructies: 'Jackfruit afspoelen, pluksgewijs, marineren 30 min, sauteren met saus 20 min.', notitie: T },
    { naam: T + ' Brioche Buns', categorie: 'Bijgerecht', porties: 12, preptime: 240, ingredienten: [{naam:'Bloem', hoeveelheid:500, eenheid:'g'},{naam:'Boter', hoeveelheid:100, eenheid:'g'},{naam:'Eieren', hoeveelheid:3, eenheid:'st'}], instructies: 'Deeg 1u rijzen, vormen, 30 min narijzen, oven 200°C 12 min.', notitie: T },
    { naam: T + ' Cheesecake met BBQ Bessen', categorie: 'Dessert', porties: 12, preptime: 30, ingredienten: [{naam:'Roomkaas', hoeveelheid:500, eenheid:'g'},{naam:'Bessen', hoeveelheid:300, eenheid:'g'}], instructies: 'Bodem van speculoos, vulling roomkaas+suiker+gelatine. Bessen kort grillen op plank.', notitie: T },
]);

// ─── 5. Gerechten — gekoppeld aan BESTAANDE gangen-slugs + nieuwe seed-* ────
await insert('gerechten', [
    { naam: T + ' Pulled Pork Sliders', beschrijving: 'Brioche bun met pulled pork, coleslaw en honey mustard', gang_slug: 'bites', actief: true, ingredienten: ['Brioche bun', 'Pulled pork', 'Coleslaw', 'Honey mustard'], allergenen: ['Gluten', 'Mosterd', 'Eieren', 'Melk'], tags: ['Populair', 'Klassieker'], kostprijs_pp: 2.40, verkoopprijs: 6.50 },
    { naam: T + ' Brisket Toast', beschrijving: 'Geroosterde sourdough met dun gesneden brisket en mierikswortelcrème', gang_slug: 'bites', actief: true, ingredienten: ['Sourdough', 'Brisket', 'Mierikswortel', 'Bieslook'], allergenen: ['Gluten', 'Melk'], tags: ['Premium'], kostprijs_pp: 3.20, verkoopprijs: 8.50 },
    { naam: T + ' Gerookte Zalm op Komkommer', beschrijving: 'Frisse hap, koud gerookte zalm op komkommerrondje met dille', gang_slug: 'bites', actief: true, ingredienten: ['Komkommer', 'Gerookte zalm', 'Crème fraîche', 'Dille', 'Citroen'], allergenen: ['Vis', 'Melk'], tags: ['Fris', 'Light'], kostprijs_pp: 1.80, verkoopprijs: 5.50 },
    { naam: T + ' Buikspek Lolly', beschrijving: '12u gerookt buikspek op stokje met koffie-rub en honingglans', gang_slug: 'bites', actief: true, ingredienten: ['Buikspek', 'Koffie-rub', 'Honing', 'Stokje'], allergenen: [], tags: ['Showstopper'], kostprijs_pp: 2.10, verkoopprijs: 6.00 },
    { naam: T + ' Gegrilde Geitenkaas op Vijg', beschrijving: 'Romige geitenkaas op verse vijg met honing en walnoot', gang_slug: 'voorgerechten', actief: true, ingredienten: ['Geitenkaas', 'Vijg', 'Honing', 'Walnoot'], allergenen: ['Melk', 'Noten'], tags: ['Vega'], kostprijs_pp: 3.50, verkoopprijs: 9.50 },
    { naam: T + ' Texas Brisket Hoofdgerecht', beschrijving: '12u gerookte brisket, gesneden, met jus, mac & cheese en coleslaw', gang_slug: 'hoofdgerechten', actief: true, ingredienten: ['Brisket', 'BBQ saus', 'Mac & cheese', 'Coleslaw'], allergenen: ['Gluten', 'Melk', 'Mosterd', 'Eieren'], tags: ['Signatuur'], kostprijs_pp: 8.50, verkoopprijs: 24.50 },
    { naam: T + ' Pulled Pork Bordje', beschrijving: 'Pulled pork met cornbread, beans en pickle slaw', gang_slug: 'hoofdgerechten', actief: true, ingredienten: ['Pulled pork', 'Cornbread', 'Beans', 'Pickle slaw'], allergenen: ['Gluten'], tags: ['Klassieker'], kostprijs_pp: 6.20, verkoopprijs: 19.50 },
    { naam: T + ' St. Louis Spare Ribs', beschrijving: 'Spare ribs 3-2-1 methode, met huisgemaakte saus', gang_slug: 'hoofdgerechten', actief: true, ingredienten: ['Spare ribs', 'BBQ saus', 'Aardappelpartjes'], allergenen: [], tags: ['BBQ-Klassieker'], kostprijs_pp: 7.80, verkoopprijs: 22.50 },
    { naam: T + ' Gerookte Zalmfilet Hoofd', beschrijving: 'Hele gerookte zalmfilet met dillesaus en geroosterde aardappelen', gang_slug: 'hoofdgerechten', actief: true, ingredienten: ['Zalmfilet', 'Dille', 'Crème fraîche', 'Aardappel'], allergenen: ['Vis', 'Melk'], tags: ['Vis'], kostprijs_pp: 9.20, verkoopprijs: 26.00 },
    { naam: T + ' BBQ Jackfruit Bowl', beschrijving: 'Vegan: gerookte jackfruit met quinoa, geroosterde groenten en tahini', gang_slug: 'seed-vegetarisch', actief: true, ingredienten: ['Jackfruit', 'Quinoa', 'Pompoen', 'Tahini'], allergenen: ['Sesamzaad'], tags: ['Vegan', 'Glutenvrij'], kostprijs_pp: 4.80, verkoopprijs: 18.50 },
    { naam: T + ' Halloumi-spies met Groenten', beschrijving: 'Gegrilde halloumi met courgette, paprika en chimichurri', gang_slug: 'seed-vegetarisch', actief: true, ingredienten: ['Halloumi', 'Courgette', 'Paprika', 'Chimichurri'], allergenen: ['Melk'], tags: ['Vega'], kostprijs_pp: 4.20, verkoopprijs: 17.00 },
    { naam: T + ' Coleslaw Hop & Bites', beschrijving: 'Huisgemaakte coleslaw met witte kool, wortel en lichte mayo-dressing', gang_slug: 'seed-bijgerecht', actief: true, ingredienten: ['Witte kool', 'Wortel', 'Mayonaise'], allergenen: ['Eieren', 'Mosterd'], tags: ['Standaard'], kostprijs_pp: 0.80, verkoopprijs: 3.50 },
    { naam: T + ' Mac & Cheese Truffel', beschrijving: 'Romige macaroni met 3 kazen en een vleugje truffel-olie', gang_slug: 'seed-bijgerecht', actief: true, ingredienten: ['Macaroni', 'Cheddar', 'Parmezaan', 'Truffel-olie'], allergenen: ['Gluten', 'Melk'], tags: ['Premium'], kostprijs_pp: 1.80, verkoopprijs: 5.50 },
    { naam: T + ' Cheesecake met BBQ Bessen', beschrijving: 'Romige cheesecake met op de BBQ gegrilde bessen', gang_slug: 'dessert', actief: true, ingredienten: ['Roomkaas', 'Bessen', 'Speculoos'], allergenen: ['Melk', 'Gluten', 'Eieren'], tags: ['Signatuur'], kostprijs_pp: 2.50, verkoopprijs: 8.00 },
    { naam: T + ' BBQ Ananas met Kaneelijs', beschrijving: 'Gegrilde ananas met kaneel-vanille-ijs en karamel', gang_slug: 'dessert', actief: true, ingredienten: ['Ananas', 'Vanille-ijs', 'Kaneel', 'Karamel'], allergenen: ['Melk'], tags: ['Vega', 'Light'], kostprijs_pp: 1.90, verkoopprijs: 6.50 },
]);

// ─── 6. Inventory ────────────────────────────────────────────────────────────
await insert('inventory', [
    { naam: T + ' Brisket', categorie: 'Vlees', current_stock: 2, min_stock: 5, par_level: 8, unit: 'kg', purchase_price: 18.50, supplier: 'Slagerij De Laat', leverancier_id: lev[0].id, allergenen: [], used_in: ['Texas Brisket Hoofdgerecht', 'Brisket Toast'] },
    { naam: T + ' Procureur', categorie: 'Vlees', current_stock: 8, min_stock: 4, par_level: 6, unit: 'kg', purchase_price: 9.80, supplier: 'Slagerij De Laat', leverancier_id: lev[0].id, allergenen: [], used_in: ['Pulled Pork Bordje', 'Pulled Pork Sliders'] },
    { naam: T + ' Spare Ribs', categorie: 'Vlees', current_stock: 6, min_stock: 4, par_level: 6, unit: 'kg', purchase_price: 12.50, supplier: 'Slagerij De Laat', leverancier_id: lev[0].id, allergenen: [], used_in: ['St. Louis Spare Ribs'] },
    { naam: T + ' Buikspek', categorie: 'Vlees', current_stock: 1.5, min_stock: 3, par_level: 5, unit: 'kg', purchase_price: 14.00, supplier: 'Slagerij De Laat', leverancier_id: lev[0].id, allergenen: [], used_in: ['Buikspek Lolly'] },
    { naam: T + ' Zalmfilet', categorie: 'Vis', current_stock: 3, min_stock: 2, par_level: 4, unit: 'kg', purchase_price: 22.00, supplier: 'Vishandel Noordzee', leverancier_id: lev[1].id, allergenen: ['Vis'], used_in: ['Gerookte Zalm op Komkommer', 'Gerookte Zalmfilet Hoofd'] },
    { naam: T + ' Witte kool', categorie: 'Groente', current_stock: 4, min_stock: 2, par_level: 4, unit: 'st', purchase_price: 1.50, supplier: 'Sligro Zwolle', leverancier_id: lev[4].id, allergenen: [], used_in: ['Coleslaw Hop & Bites'] },
    { naam: T + ' Brioche buns', categorie: 'Brood', current_stock: 12, min_stock: 24, par_level: 48, unit: 'st', purchase_price: 0.65, supplier: 'Bakkerij Hoffmann', leverancier_id: lev[3].id, allergenen: ['Gluten', 'Eieren', 'Melk'], used_in: ['Pulled Pork Sliders'] },
    { naam: T + ' Macaroni', categorie: 'Droogwaar', current_stock: 6, min_stock: 3, par_level: 5, unit: 'kg', purchase_price: 1.80, supplier: 'Sligro Zwolle', leverancier_id: lev[4].id, allergenen: ['Gluten'], used_in: ['Mac & Cheese Truffel'] },
    { naam: T + ' Cheddar', categorie: 'Zuivel', current_stock: 2, min_stock: 2, par_level: 3, unit: 'kg', purchase_price: 12.00, supplier: 'Sligro Zwolle', leverancier_id: lev[4].id, allergenen: ['Melk'], used_in: ['Mac & Cheese Truffel'] },
    { naam: T + ' Houtskool premium', categorie: 'Brandstof', current_stock: 0.5, min_stock: 3, par_level: 6, unit: 'zak', purchase_price: 18.00, supplier: 'BBQ Fuel BV', leverancier_id: lev[2].id, allergenen: [], used_in: [] },
    { naam: T + ' Houtsnippers Hickory', categorie: 'Brandstof', current_stock: 2, min_stock: 1, par_level: 3, unit: 'zak', purchase_price: 12.00, supplier: 'BBQ Fuel BV', leverancier_id: lev[2].id, allergenen: [], used_in: [] },
    { naam: T + ' Houtsnippers Appel', categorie: 'Brandstof', current_stock: 3, min_stock: 1, par_level: 3, unit: 'zak', purchase_price: 12.00, supplier: 'BBQ Fuel BV', leverancier_id: lev[2].id, allergenen: [], used_in: [] },
    { naam: T + ' Aanmaakblokjes', categorie: 'Brandstof', current_stock: 4, min_stock: 2, par_level: 4, unit: 'pak', purchase_price: 4.50, supplier: 'BBQ Fuel BV', leverancier_id: lev[2].id, allergenen: [], used_in: [] },
    { naam: T + ' Coleslaw mayo (basis)', categorie: 'Saus', current_stock: 2, min_stock: 1, par_level: 3, unit: 'liter', purchase_price: 6.50, supplier: 'Sligro Zwolle', leverancier_id: lev[4].id, allergenen: ['Eieren', 'Mosterd'], used_in: ['Coleslaw Hop & Bites'] },
    { naam: T + ' Halloumi', categorie: 'Zuivel', current_stock: 1, min_stock: 2, par_level: 3, unit: 'kg', purchase_price: 14.00, supplier: 'Sligro Zwolle', leverancier_id: lev[4].id, allergenen: ['Melk'], used_in: ['Halloumi-spies met Groenten'] },
]);

// ─── 7. Materieel ─────────────────────────────────────────────────────────────
await insert('materieel', [
    { naam: T + ' Weber Smokey Mountain 22"', type: 'BBQ', status: 'ok', aanschaf_datum: '2024-03-15', notitie: T + ' Hoofdsmoker, jaarlijkse cleaning' },
    { naam: T + ' Kamado Big Green Egg L', type: 'BBQ', status: 'onderhoud', aanschaf_datum: '2023-06-01', notitie: T + ' Vuurkorf vervangen, planning april' },
    { naam: T + ' Gas-BBQ Napoleon Prestige', type: 'BBQ', status: 'ok', aanschaf_datum: '2025-04-10', notitie: T + ' Service-grill voor events' },
    { naam: T + ' Kernthermometer Inkbird IBT-4XS', type: 'Meet', status: 'ok', aanschaf_datum: '2024-09-01', notitie: T + ' 4 probes' },
    { naam: T + ' Koelbox Yeti Tundra 65', type: 'Koeling', status: 'ok', aanschaf_datum: '2024-05-20', notitie: T + ' Voor transport koelketen' },
    { naam: T + ' Catering-tent 4x4m', type: 'Tent', status: 'ok', aanschaf_datum: '2025-02-01', notitie: T + ' Wit, met zijwanden' },
]);

// ─── 8. Events (verleden + heden + toekomst) ─────────────────────────────────
const events = await insert('events', [
    { name: T + ' Bedrijfsfeest Acme', date: daysFromNow(14), guests: 80, location: 'Industrieweg 88, Zwolle', ppp: 42.50, status: 'confirmed', client_naam: T + ' Acme Solutions', client_email: 'events@acme.nl', client_tel: '038-4567890', type: 'Zakelijk', notitie: T + ' Volledig pakket', start_time: '17:00:00', end_time: '23:00:00', veg_guests: 8, vegan_guests: 2, gluten_free_guests: 3 },
    { name: T + ' Bruiloft van Dijk', date: daysFromNow(45), guests: 120, location: 'Boerderij Dalfsen, Hoofdstraat 5', ppp: 55.00, status: 'confirmed', client_naam: T + ' Bruiloft van Dijk', client_email: 'mark.vandijk@gmail.com', client_tel: '06-87654321', type: 'Particulier', notitie: T + ' Vol diner-arrangement, met dessert', start_time: '16:00:00', end_time: '00:00:00', veg_guests: 15, vegan_guests: 4, gluten_free_guests: 6 },
    { name: T + ' Familie Pietersen 50e', date: daysFromNow(7), guests: 25, location: 'Lindenlaan 12, Zwolle', ppp: 38.00, status: 'confirmed', client_naam: T + ' Familie Pietersen', client_email: 'pietersen@hotmail.com', client_tel: '06-12345678', type: 'Particulier', notitie: T + ' Klassieker pakket, EXTRA brood (vaste wens)', start_time: '17:00:00', end_time: '22:00:00' },
    { name: T + ' Personeels-BBQ Jansen', date: daysFromNow(28), guests: 45, location: 'Ambachtsstraat 14, Zwolle', ppp: 35.00, status: 'pending', client_naam: T + ' Bouwbedrijf Jansen', client_email: 'admin@jansenbouw.nl', client_tel: '038-7788990', type: 'Zakelijk', notitie: T + ' Wachten op bevestiging menu', start_time: '17:30:00', end_time: '22:00:00' },
    { name: T + ' HCZ Eindeseizoen', date: daysFromNow(60), guests: 90, location: 'Sportlaan 3, Zwolle', ppp: 28.00, status: 'optie', client_naam: T + ' Sportclub HCZ', client_email: 'penningmeester@hcz.nl', client_tel: '038-2233445', type: 'Zakelijk', notitie: T + ' Optie, definitief 4 weken voor', start_time: '18:00:00', end_time: '23:30:00' },
    { name: T + ' Geboortefeest de Boer', date: daysFromNow(-21), guests: 18, location: 'Beukenlaan 22, Zwolle', ppp: 32.00, status: 'completed', client_naam: T + ' Familie de Boer', client_email: 'deboer.familie@kpnmail.nl', client_tel: '06-11223344', type: 'Particulier', notitie: T + ' Afgerond, factuur betaald', start_time: '15:00:00', end_time: '21:00:00' },
    { name: T + ' Buurt-BBQ Beeklust', date: daysFromNow(-7), guests: 60, location: 'Beeklaan 9, Zwolle', ppp: 22.00, status: 'completed', client_naam: T + ' Stichting Beeklust', client_email: 'bestuur@beeklust.nl', client_tel: '038-9988776', type: 'Zakelijk', notitie: T + ' Afgerond, factuur openstaand', start_time: '16:00:00', end_time: '21:00:00' },
    { name: T + ' Oogstfeest Westerveld', date: daysFromNow(120), guests: 150, location: 'Polderweg 33, Wezuperbrug', ppp: 48.00, status: 'optie', client_naam: T + ' Loonbedrijf Westerveld', client_email: 'info@westerveld-loon.nl', client_tel: '0591-345678', type: 'Zakelijk', notitie: T + ' Najaar, definitief in juli', start_time: '17:00:00', end_time: '23:00:00' },
]);

// ─── 9. Offertes ─────────────────────────────────────────────────────────────
const offertes = await insert('offertes', [
    { nummer: 'S2026-101', status: 'goedgekeurd', client_naam: T + ' Acme Solutions', client_adres: 'Industrieweg 88, 8021 AB Zwolle', datum: daysFromNow(-30), geldig_tot: daysFromNow(0), aantal_gasten: 80, basis_prijs_pp: 42.50, korting: 0, notitie: T + ' Akkoord per email', event_id: events[0].id, items: [{omschrijving:'Brisket hoofdgerecht', aantal:80, prijs:24.50},{omschrijving:'Coleslaw bijgerecht', aantal:80, prijs:3.50}] },
    { nummer: 'S2026-102', status: 'verzonden', client_naam: T + ' Bruiloft van Dijk', client_adres: 'Hoofdstraat 5, 7777 BB Dalfsen', datum: daysFromNow(-15), geldig_tot: daysFromNow(15), aantal_gasten: 120, basis_prijs_pp: 55.00, korting: 5, notitie: T + ' Wacht op bevestiging', event_id: events[1].id, items: [{omschrijving:'Volledig diner-arrangement', aantal:120, prijs:55.00}] },
    { nummer: 'S2026-103', status: 'concept', client_naam: T + ' Sportclub HCZ', client_adres: 'Sportlaan 3, 8025 SS Zwolle', datum: daysFromNow(-3), geldig_tot: daysFromNow(27), aantal_gasten: 90, basis_prijs_pp: 28.00, korting: 10, notitie: T + ' Nog niet verstuurd', event_id: events[4].id, items: [] },
    { nummer: 'S2026-104', status: 'verzonden', client_naam: T + ' Bouwbedrijf Jansen', client_adres: 'Ambachtsstraat 14, 8013 JB Zwolle', datum: daysFromNow(-12), geldig_tot: daysFromNow(3), aantal_gasten: 45, basis_prijs_pp: 35.00, korting: 0, notitie: T + ' VERLOOPT BINNENKORT - follow-up nodig', event_id: events[3].id, items: [] },
    { nummer: 'S2026-105', status: 'afgewezen', client_naam: T + ' Particulier Test', client_adres: '', datum: daysFromNow(-45), geldig_tot: daysFromNow(-15), aantal_gasten: 30, basis_prijs_pp: 38.50, korting: 0, notitie: T + ' Klant ging naar concurrent', items: [] },
    { nummer: 'S2026-106', status: 'goedgekeurd', client_naam: T + ' Familie Pietersen', client_adres: 'Lindenlaan 12, 8011 PP Zwolle', datum: daysFromNow(-20), geldig_tot: daysFromNow(-5), aantal_gasten: 25, basis_prijs_pp: 38.00, korting: 0, notitie: T + ' Vaste klant, EXTRA brood inbegrepen', event_id: events[2].id, items: [] },
]);

// ─── 10. Facturen ─────────────────────────────────────────────────────────────
await insert('facturen', [
    { nummer: 'S2026-201', status: 'betaald', client_naam: T + ' Familie de Boer', client_adres: 'Beukenlaan 22, 8014 BL Zwolle', datum: daysFromNow(-21), vervaldatum: daysFromNow(-7), event_id: events[5].id, items: [{omschrijving:'BBQ catering 18p', aantal:18, prijs:32.00}] },
    { nummer: 'S2026-202', status: 'verzonden', client_naam: T + ' Stichting Beeklust', client_adres: 'Beeklaan 9, 8016 BL Zwolle', datum: daysFromNow(-7), vervaldatum: daysFromNow(7), event_id: events[6].id, items: [{omschrijving:'Buurt-BBQ 60p', aantal:60, prijs:22.00}] },
    { nummer: 'S2026-203', status: 'verlopen', client_naam: T + ' Particulier - oude factuur', client_adres: 'Test 1, Zwolle', datum: daysFromNow(-65), vervaldatum: daysFromNow(-35), items: [{omschrijving:'BBQ 30p', aantal:30, prijs:35.00}] },
    { nummer: 'S2026-204', status: 'concept', client_naam: T + ' Acme Solutions', client_adres: 'Industrieweg 88, 8021 AB Zwolle', datum: daysFromNow(0), vervaldatum: daysFromNow(14), event_id: events[0].id, offerte_id: offertes[0].id, items: [{omschrijving:'Bedrijfsfeest 80p', aantal:80, prijs:42.50}] },
    { nummer: 'S2026-205', status: 'betaald', client_naam: T + ' Familie Pietersen', client_adres: 'Lindenlaan 12, 8011 PP Zwolle', datum: daysFromNow(-2), vervaldatum: daysFromNow(12), event_id: events[2].id, offerte_id: offertes[5].id, items: [{omschrijving:'Verjaardags-BBQ 25p', aantal:25, prijs:38.00}] },
]);

// ─── 11. Inkooplijsten ───────────────────────────────────────────────────────
await insert('inkooplijsten', [
    { event_id: events[0].id, items: [{naam:'Brisket', hoeveelheid:8, eenheid:'kg', leverancier:'Slagerij De Laat'},{naam:'Brioche buns', hoeveelheid:96, eenheid:'st', leverancier:'Bakkerij Hoffmann'},{naam:'Coleslaw mayo', hoeveelheid:3, eenheid:'liter', leverancier:'Sligro Zwolle'}] },
    { event_id: events[1].id, items: [{naam:'Procureur', hoeveelheid:12, eenheid:'kg', leverancier:'Slagerij De Laat'},{naam:'Zalmfilet', hoeveelheid:4, eenheid:'kg', leverancier:'Vishandel Noordzee'},{naam:'Brioche buns', hoeveelheid:140, eenheid:'st', leverancier:'Bakkerij Hoffmann'}] },
    { event_id: events[2].id, items: [{naam:'Spare ribs', hoeveelheid:5, eenheid:'kg', leverancier:'Slagerij De Laat'},{naam:'Mac & cheese ingrediënten', hoeveelheid:1, eenheid:'set', leverancier:'Sligro Zwolle'}] },
]);

// ─── 12. Prep_tasks ──────────────────────────────────────────────────────────
await insert('prep_tasks', [
    { event_id: events[0].id, text: T + ' Brisket pekelen 24u vooraf', dagen: -1, done: false },
    { event_id: events[0].id, text: T + ' Coleslaw maken 4u vooraf', dagen: 0, done: false },
    { event_id: events[0].id, text: T + ' Smoker opstoken 12u vooraf', dagen: 0, done: false },
    { event_id: events[0].id, text: T + ' Inkoop bij De Laat ophalen', dagen: -2, done: true },
    { event_id: events[1].id, text: T + ' Bruiloft: menu finaliseren met klant', dagen: -7, done: true },
    { event_id: events[1].id, text: T + ' Pulled pork pekel 48u', dagen: -2, done: false },
    { event_id: events[1].id, text: T + ' Brioche buns bestellen Hoffmann', dagen: -3, done: false },
    { event_id: events[2].id, text: T + ' Spare ribs trimmen', dagen: -1, done: false },
    { event_id: events[2].id, text: T + ' EXTRA brood meenemen (vaste wens Pietersen)', dagen: -1, done: false },
    { event_id: events[3].id, text: T + ' Wachten op bevestiging menu Jansen', dagen: -7, done: false },
    { event_id: events[3].id, text: T + ' Materieel-check (gas + houtskool)', dagen: -3, done: false },
    { event_id: events[5].id, text: T + ' Afronding: factuur sturen', dagen: 1, done: true },
]);

// ─── 13. Time_logs ───────────────────────────────────────────────────────────
await insert('time_logs', [
    { user_id: 'pitmaster-jan', start_time: new Date(Date.now() - 21 * 86400000).toISOString(), end_time: new Date(Date.now() - 21 * 86400000 + 6 * 3600000).toISOString(), status: 'completed', locatie: 'Beukenlaan 22, Zwolle', notitie: T + ' Geboortefeest de Boer' },
    { user_id: 'pitmaster-jan', start_time: new Date(Date.now() - 7 * 86400000).toISOString(), end_time: new Date(Date.now() - 7 * 86400000 + 7 * 3600000).toISOString(), status: 'completed', locatie: 'Beeklaan 9, Zwolle', notitie: T + ' Buurt-BBQ Beeklust' },
    { user_id: 'medewerker-tim', start_time: new Date(Date.now() - 7 * 86400000).toISOString(), end_time: new Date(Date.now() - 7 * 86400000 + 5 * 3600000).toISOString(), status: 'completed', locatie: 'Beeklaan 9, Zwolle', notitie: T + ' Service-medewerker' },
    { user_id: 'pitmaster-jan', start_time: new Date(Date.now() - 21 * 86400000 + 6 * 3600000).toISOString(), end_time: new Date(Date.now() - 21 * 86400000 + 12 * 3600000).toISOString(), status: 'completed', locatie: 'Garage Hop & Bites', notitie: T + ' Schoonmaak na event' },
]);

// ─── 14. Event_allergies ─────────────────────────────────────────────────────
await insert('event_allergies', [
    { event_id: events[0].id, name: T + ' Bestuurder Acme', allergens: ['Vegetarisch'], note: T + ' Geen vlees, wel vis OK', severity: 'normal' },
    { event_id: events[1].id, name: T + ' Tante Marie', allergens: ['Gluten'], note: T + ' Coeliakie, strict', severity: 'critical' },
    { event_id: events[1].id, name: T + ' Neefje Tom', allergens: ['Noten'], note: T + ' Pinda-allergie ernstig', severity: 'critical' },
]);

// ─── 15. Rtr_items (bus check) ───────────────────────────────────────────────
await insert('rtr_items', [
    { text: T + ' Weber Smokey Mountain', done: false },
    { text: T + ' Houtskool 2 zakken', done: false },
    { text: T + ' Aanmaakblokjes', done: false },
    { text: T + ' Kernthermometer + reserve-batterijen', done: false },
    { text: T + ' Koelbox met ijs', done: false },
    { text: T + ' Snijplanken (3x)', done: false },
    { text: T + ' Messen-set', done: false },
    { text: T + ' Werkhandschoenen + tang', done: false },
    { text: T + ' HACCP-formulier', done: false },
    { text: T + ' EHBO-doos', done: false },
]);

// ─── 16. Pack_lists ──────────────────────────────────────────────────────────
await insert('pack_lists', [
    { event_id: events[0].id, items: [{naam:'Smoker', aantal:1, gepakt:false},{naam:'Houtskool', aantal:3, gepakt:false},{naam:'Brisket (gekookt)', aantal:1, gepakt:false},{naam:'Coleslaw bakken', aantal:8, gepakt:false}] },
    { event_id: events[2].id, items: [{naam:'Smoker', aantal:1, gepakt:false},{naam:'Spare ribs', aantal:1, gepakt:false},{naam:'EXTRA brood', aantal:5, gepakt:false}] },
]);

// ─── 17. Portal_berichten ────────────────────────────────────────────────────
await insert('portal_berichten', [
    { klant_id: klanten[0].id, afzender: 'klant', naam: T + ' Familie Pietersen', bericht: T + ' Hoi! Komen jullie weer extra brood meenemen?', gelezen: true },
    { klant_id: klanten[0].id, afzender: 'team', naam: T + ' Hop & Bites', bericht: T + ' Zeker! Staat al genoteerd. Tot zondag!', gelezen: true },
    { klant_id: klanten[1].id, afzender: 'klant', naam: T + ' Acme Solutions', bericht: T + ' Kunnen we toevoegen: 2 vegan-bordjes ipv 4 vega?', gelezen: false },
    { klant_id: klanten[2].id, afzender: 'klant', naam: T + ' Bruiloft van Dijk', bericht: T + ' Vraag over de bus-aankomsttijd op 13 juni', gelezen: false },
    { klant_id: klanten[3].id, afzender: 'team', naam: T + ' Hop & Bites', bericht: T + ' Dank voor de optie! We bevestigen 4 weken vooraf.', gelezen: true },
]);

// ─── 18. Bonnen (foto-bonnen voor admin) ─────────────────────────────────────
await insert('bonnen', [
    { winkel: T + ' Slagerij De Laat', datum: daysFromNow(-2), totaal_bedrag: 187.50, status: 'verwerkt', categorie: 'Vlees', leverancier_id: lev[0].id, btw_pct: 9, btw_laag_bedrag: 16.88, netto_bedrag: 170.62, notities: T + ' Brisket + procureur', bon_items: [{naam:'Brisket', aantal:5, prijs:18.50},{naam:'Procureur', aantal:5, prijs:9.80}] },
    { winkel: T + ' Bakkerij Hoffmann', datum: daysFromNow(-3), totaal_bedrag: 62.40, status: 'verwerkt', categorie: 'Brood', leverancier_id: lev[3].id, btw_pct: 9, btw_laag_bedrag: 5.62, netto_bedrag: 56.78, notities: T + ' Brioche buns 96 stuks', bon_items: [{naam:'Brioche bun', aantal:96, prijs:0.65}] },
    { winkel: T + ' BBQ Fuel BV', datum: daysFromNow(-5), totaal_bedrag: 108.00, status: 'review', categorie: 'Brandstof', leverancier_id: lev[2].id, btw_pct: 21, btw_hoog_bedrag: 22.68, netto_bedrag: 85.32, notities: T + ' Houtskool premium 6 zakken', bon_items: [{naam:'Houtskool premium', aantal:6, prijs:18.00}] },
]);

// State opslaan voor cleanup
writeFileSync(
    join(__dirname, 'seed-state.json'),
    JSON.stringify(state, null, 2)
);

console.log('\n═══ SAMENVATTING ═══');
for (const [table, ids] of Object.entries(state)) {
    if (Array.isArray(ids) && ids.length > 0) {
        console.log(`  ${table}: ${ids.length} rows`);
    }
}
console.log(`\nState opgeslagen in scripts/seed-state.json`);
console.log(`Cleanup met:  node scripts/cleanup-seed.mjs`);
console.log(`\nAlles getagd met "${T}" voor herkenbaarheid.`);
