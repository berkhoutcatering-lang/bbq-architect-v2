/**
 * Catalogus van de kassa voor Hop & Bites (organizations.slug = 'hop-en-bites').
 *
 * Idempotent: bestaande slugs worden bijgewerkt op de vaste velden; een prijs
 * die Mathijs later invult blijft staan (alleen de Kerst-Box-prijs is een
 * besluit en wordt wél gezet). Alleen wat vaststaat krijgt een prijs; de rest
 * staat erin met prijs null en actief=false, zodat er straks alleen een getal
 * ingevuld hoeft te worden.
 *
 * Bronnen: OVERDRACHT-BBQ-ARCHITECT-WEBSHOP.md + de besluiten van 13 sep 2026:
 *   Kerst-Box € 23,50 p.p., minimaal 2, geen maximum, dag 23 of 24 december,
 *   twee doosmaten (klein tot en met doos_klein_max, groot = 5).
 *   [BEVESTIGEN] doos_klein_max staat op 3 — de website noemt "2–3".
 *   [BEVESTIGEN] capaciteit per dag: 25 dozen, overgenomen van de bestaande
 *   afhaalmomenten van de-eettocht (23 en 24 december).
 *
 *   node scripts/winkel-seed-hop-en-bites.mjs
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

const { data: org, error: orgFout } = await sb.from('organizations').select('id').eq('slug', 'hop-en-bites').single();
if (orgFout || !org) throw new Error('organisatie hop-en-bites niet gevonden');
const o = org.id;

/* Instellingen: verzendtarief en gratis-grens nog niet definitief → null =
   verzenden staat uit tot Mathijs ze zet. Alleen aanmaken als ze ontbreken. */
const { data: inst } = await sb.from('winkel_instellingen').select('organization_id, site_url').eq('organization_id', o).maybeSingle();
if (!inst) {
    const { error } = await sb.from('winkel_instellingen').insert({ organization_id: o, verzendkosten_cents: null, gratis_verzenden_vanaf_cents: null, kassa_open: true, site_url: 'https://hopbites.nl' });
    if (error) throw error;
} else if (!inst.site_url) {
    // De website (metadataBase in app/layout.tsx van de website-repo).
    const { error } = await sb.from('winkel_instellingen').update({ site_url: 'https://hopbites.nl' }).eq('organization_id', o);
    if (error) throw error;
}

/* Vaste velden per artikel. `prijs_cents` gaat alleen mee als hij een besluit is. */
const vast = (a) => ({ organization_id: o, ...a });
const artikelen = [
    // Bites
    vast({ slug: 'borrel-journey', naam: 'Borrel Journey', eenheid: 'per persoon', telt: 'personen', prijs_cents: 1495, btw_pct: 9, minimum: 8, maximum: 80, verzendbaar: false, gekoeld: true, moment_soort: 'moment', moment_groep: 'agenda', capaciteit_soort: 'regel', actief: true }),
    vast({ slug: 'hop-en-bites-plank', naam: 'Hop & Bites plank', eenheid: 'per persoon', telt: 'personen', btw_pct: 9, minimum: 8, maximum: 80, verzendbaar: false, gekoeld: true, moment_soort: 'moment', moment_groep: 'agenda', capaciteit_soort: 'regel' }),
    // Kerst-Box: twee varianten, zelfde prijs; vegetarisch niet publiek (menu nog geheim)
    vast({ slug: 'kerst-box', naam: 'Kerst-Box', eenheid: 'per persoon', telt: 'personen', prijs_cents: 2350, btw_pct: 9, minimum: 2, maximum: null, verzendbaar: false, gekoeld: true, moment_soort: 'dag', moment_groep: 'kerst-box', afhaalmoment_tekst: 'Afhalen op 23 of 24 december', capaciteit_soort: 'dozen', doos_klein_max: 3, doos_groot: 5, actief: true, publiek: true }),
    vast({ slug: 'kerst-box-vegetarisch', naam: 'Kerst-Box vegetarisch', eenheid: 'per persoon', telt: 'personen', prijs_cents: 2350, btw_pct: 9, minimum: 2, maximum: null, verzendbaar: false, gekoeld: true, moment_soort: 'dag', moment_groep: 'kerst-box', afhaalmoment_tekst: 'Afhalen op 23 of 24 december', capaciteit_soort: 'dozen', doos_klein_max: 3, doos_groot: 5, actief: true, publiek: false }),
    // Losse producten en geschenken: prijs volgt
    vast({ slug: 'bbq-amandelen', naam: 'BBQ-amandelen', eenheid: 'per zak', telt: 'stuks', btw_pct: 9, minimum: 1, maximum: 20, verzendbaar: true, gekoeld: false, moment_soort: 'geen', capaciteit_soort: 'aantal' }),
    vast({ slug: 'barbecuesaus', naam: 'Barbecuesaus', eenheid: 'per fles', telt: 'stuks', btw_pct: 9, minimum: 1, maximum: 20, verzendbaar: true, gekoeld: false, moment_soort: 'geen', capaciteit_soort: 'aantal' }),
    vast({ slug: 'white-alabama', naam: 'White Alabama', eenheid: 'per fles', telt: 'stuks', btw_pct: 9, minimum: 1, maximum: 20, verzendbaar: false, gekoeld: true, moment_soort: 'geen', capaciteit_soort: 'aantal' }),
    vast({ slug: 'geschenkbox', naam: 'Geschenkbox', eenheid: 'per doos', telt: 'stuks', btw_pct: 9, minimum: 1, maximum: 20, verzendbaar: false, gekoeld: false, moment_soort: 'geen', capaciteit_soort: 'aantal' }),
    vast({ slug: 'borrelbox', naam: 'Borrelbox', eenheid: 'per doos', telt: 'stuks', btw_pct: 9, minimum: 1, maximum: 20, verzendbaar: false, gekoeld: true, moment_soort: 'geen', capaciteit_soort: 'aantal' }),
    vast({ slug: 'pit-en-rook', naam: 'Pit & Rook', eenheid: 'per doos', telt: 'stuks', btw_pct: 9, minimum: 1, maximum: 20, verzendbaar: true, gekoeld: false, moment_soort: 'geen', capaciteit_soort: 'aantal' }),
    // Bevatten bier: 21% btw op de hele doos zolang er geen splitsing is. [BEVESTIGEN]
    vast({ slug: 'drenthe-bieravond', naam: 'Drenthe bieravond', eenheid: 'per doos', telt: 'stuks', btw_pct: 21, minimum: 1, maximum: 20, verzendbaar: false, gekoeld: false, moment_soort: 'geen', capaciteit_soort: 'aantal' }),
    vast({ slug: 'voor-papa', naam: 'Voor papa', eenheid: 'per doos', telt: 'stuks', btw_pct: 21, minimum: 1, maximum: 20, verzendbaar: false, gekoeld: false, moment_soort: 'geen', capaciteit_soort: 'aantal' }),
];

const { data: bestaand } = await sb.from('winkel_artikelen').select('slug').eq('organization_id', o);
const bekend = new Set((bestaand ?? []).map((r) => r.slug));

for (const a of artikelen) {
    if (bekend.has(a.slug)) {
        // Bestaat al: vaste velden bijwerken, prijs/actief/voorraad met rust laten
        // (behalve de Kerst-Box-prijs: dat is een besluit).
        const { prijs_cents, actief, ...rest } = a;
        const update = a.slug.startsWith('kerst-box') ? { ...rest, prijs_cents } : rest;
        void actief;
        const { error } = await sb.from('winkel_artikelen').update(update).eq('organization_id', o).eq('slug', a.slug);
        if (error) throw error;
        console.log('bijgewerkt', a.slug);
    } else {
        const { error } = await sb.from('winkel_artikelen').insert({ actief: false, ...a });
        if (error) throw error;
        console.log('aangemaakt', a.slug, a.prijs_cents == null ? '(prijs volgt)' : `€ ${(a.prijs_cents / 100).toFixed(2)}`);
    }
}

/* Afhaaldagen Kerst-Box: 23 en 24 december, geen tijdvak. Groep 'kerst-box'
   wordt door beide varianten gedeeld (dagen én capaciteit). */
const { data: dagen } = await sb.from('winkel_momenten').select('id').eq('organization_id', o).eq('groep', 'kerst-box');
if (!dagen?.length) {
    const { error } = await sb.from('winkel_momenten').insert([
        { organization_id: o, groep: 'kerst-box', datum: '2026-12-23', van: null, tot: null, capaciteit: 25, actief: true },
        { organization_id: o, groep: 'kerst-box', datum: '2026-12-24', van: null, tot: null, capaciteit: 25, actief: true },
    ]);
    if (error) throw error;
    console.log('afhaaldagen Kerst-Box aangemaakt: 23 en 24 december, 25 dozen per dag');
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sinterklaas 2026 — opdracht docs/OVERDRACHT-BBQ-ARCHITECT-SINTERKLAAS.md
   (26 september). Acht artikelen, alle actief=false tot Mathijs ze aanzet.
   De pakketten zijn templates met slots; alleen amandelen, crackers en de
   geschenkdoos hebben een product — welke bieren, wijnen, worsten en
   marmelades erin gaan vult Mathijs in via /verkoop/webshop. Tot dan is een
   pakket niet verkoopbaar (leeg slot). Prijzen uit de bijlage van de opdracht;
   "ca."-bedragen blijven leeg.
   ═══════════════════════════════════════════════════════════════════════════ */

const sintArtikelen = [
    vast({ slug: 'sinterklaas-borrelplank', naam: 'Sinterklaas-borrelplank', eenheid: 'per persoon', telt: 'personen', prijs_cents: 1495, btw_pct: 9, minimum: 2, maximum: null, verzendbaar: false, gekoeld: true, moment_soort: 'moment', moment_groep: 'sint-plank', capaciteit_soort: 'aantal', schaal_verdeling: true, doos_klein_max: 3, doos_groot: 5, verpakking_klein_cents: 225, verpakking_groot_cents: 300, alcohol: false, segment: null }),
    vast({ slug: 'sint-bier-20', naam: 'Bierpakket € 20', eenheid: 'per stuk', telt: 'stuks', prijs_cents: 2000, btw_pct: 21, minimum: 1, maximum: null, verzendbaar: false, gekoeld: false, moment_soort: 'moment', moment_groep: 'sint-pakket', capaciteit_soort: 'aantal', alcohol: true, segment: 'bier' }),
    vast({ slug: 'sint-bier-35', naam: 'Bierpakket € 35', eenheid: 'per stuk', telt: 'stuks', prijs_cents: 3500, btw_pct: 21, minimum: 1, maximum: null, verzendbaar: false, gekoeld: false, moment_soort: 'moment', moment_groep: 'sint-pakket', capaciteit_soort: 'aantal', alcohol: true, segment: 'bier' }),
    vast({ slug: 'sint-bier-50', naam: 'Bierpakket € 50', eenheid: 'per stuk', telt: 'stuks', prijs_cents: 5000, btw_pct: 21, minimum: 1, maximum: null, verzendbaar: false, gekoeld: false, moment_soort: 'moment', moment_groep: 'sint-pakket', capaciteit_soort: 'aantal', alcohol: true, segment: 'bier' }),
    vast({ slug: 'sint-wijn-35', naam: 'Wijnpakket € 35', eenheid: 'per stuk', telt: 'stuks', prijs_cents: 3500, btw_pct: 21, minimum: 1, maximum: null, verzendbaar: false, gekoeld: false, moment_soort: 'moment', moment_groep: 'sint-pakket', capaciteit_soort: 'aantal', alcohol: true, segment: 'wijn' }),
    vast({ slug: 'sint-wijn-50', naam: 'Wijnpakket € 50', eenheid: 'per stuk', telt: 'stuks', prijs_cents: 5000, btw_pct: 21, minimum: 1, maximum: null, verzendbaar: false, gekoeld: false, moment_soort: 'moment', moment_groep: 'sint-pakket', capaciteit_soort: 'aantal', alcohol: true, segment: 'wijn' }),
    vast({ slug: 'sint-bier-wijn-35', naam: 'Bier & wijn € 35', eenheid: 'per stuk', telt: 'stuks', prijs_cents: 3500, btw_pct: 21, minimum: 1, maximum: null, verzendbaar: false, gekoeld: false, moment_soort: 'moment', moment_groep: 'sint-pakket', capaciteit_soort: 'aantal', alcohol: true, segment: 'combi' }),
    vast({ slug: 'sint-bier-wijn-50', naam: 'Bier & wijn € 50', eenheid: 'per stuk', telt: 'stuks', prijs_cents: 5000, btw_pct: 21, minimum: 1, maximum: null, verzendbaar: false, gekoeld: false, moment_soort: 'moment', moment_groep: 'sint-pakket', capaciteit_soort: 'aantal', alcohol: true, segment: 'combi' }),
];
const { data: bestaandSint } = await sb.from('winkel_artikelen').select('id, slug').eq('organization_id', o).in('slug', sintArtikelen.map((a) => a.slug));
const sintOpSlug = new Map((bestaandSint ?? []).map((r) => [r.slug, r.id]));
for (const a of sintArtikelen) {
    if (sintOpSlug.has(a.slug)) {
        /* Bestaat al: vaste velden bijwerken; prijs, actief en voorraad met rust laten. */
        const { prijs_cents, ...rest } = a;
        void prijs_cents;
        const { error } = await sb.from('winkel_artikelen').update(rest).eq('organization_id', o).eq('slug', a.slug);
        if (error) throw error;
        console.log('bijgewerkt', a.slug);
    } else {
        const { data, error } = await sb.from('winkel_artikelen').insert({ actief: false, ...a }).select('id').single();
        if (error) throw error;
        sintOpSlug.set(a.slug, data.id);
        console.log('aangemaakt', a.slug, `€ ${(a.prijs_cents / 100).toFixed(2)} (uit, tot je hem aanzet)`);
    }
}

/* Producten die vaststaan. Op naam idempotent. Bier, wijn, worst en marmelade
   maakt Mathijs zelf aan — hier niets verzinnen. */
const prod = (naam, type, extra) => ({ organization_id: o, naam, type, eenheid: 'stuk', prijs_per: 1, btw_pct: 9, alcohol: false, actief: true, ...extra });
const sintProducten = [
    /* € 15/kg incl. btw → 150 incl. per 100 g → 138 excl. (9 %). Winkel: 100 g € 2,95. */
    prod('BBQ-amandelen', 'amandelen', { eenheid: 'gram', prijs_per: 100, winkelprijs_incl_cents: 295, inkoop_excl_cents: 138, herkomst: 'eigen' }),
    /* Inkoop "ca. € 0,55 + bakje € 0,15": blijft leeg tot het zeker is. */
    prod('Pizza-dipcrackers 60 g (bakje)', 'crackers', { winkelprijs_incl_cents: 250, inkoop_excl_cents: null }),
    prod('Geschenkdoos + vulling (€ 20)', 'doos', { inkoop_excl_cents: 200, btw_pct: 21 }),
    prod('Geschenkdoos + vulling (€ 35)', 'doos', { inkoop_excl_cents: 250, btw_pct: 21 }),
    prod('Geschenkdoos + vulling (€ 50)', 'doos', { inkoop_excl_cents: 300, btw_pct: 21 }),
    /* Marmelades uit de bijlage (per pot). Welke in Bier € 50 en Wijn € 50 gaat is nog open. */
    prod('Marmelade ui', 'marmelade', { winkelprijs_incl_cents: 495, inkoop_excl_cents: 195 }),
    prod('Marmelade rode peper', 'marmelade', { winkelprijs_incl_cents: 495, inkoop_excl_cents: 225 }),
    prod('Marmelade vijg', 'marmelade', { winkelprijs_incl_cents: 495, inkoop_excl_cents: 225 }),
    prod('Marmelade rode wijn', 'marmelade', { winkelprijs_incl_cents: 495, inkoop_excl_cents: 225 }),
    /* De plank-onderdelen, in grammen. Geen prijzen bekend behalve de amandelen. */
    prod('Pastrami (Beef Club 29)', 'vleeswaar', { eenheid: 'gram', prijs_per: 100 }),
    prod('Eigen grillworst', 'vleeswaar', { eenheid: 'gram', prijs_per: 100, herkomst: 'eigen' }),
    prod('Droge worst, soort 1 (plank)', 'worst', { eenheid: 'gram', prijs_per: 100 }),
    prod('Droge worst, soort 2 (plank)', 'worst', { eenheid: 'gram', prijs_per: 100 }),
    prod('Droge worst, soort 3 (plank)', 'worst', { eenheid: 'gram', prijs_per: 100 }),
    prod('Coppa', 'vleeswaar', { eenheid: 'gram', prijs_per: 100 }),
    prod('Serranoham', 'vleeswaar', { eenheid: 'gram', prijs_per: 100 }),
    prod('Drentse hooikaas', 'kaas', { eenheid: 'gram', prijs_per: 100 }),
    prod('Spaanse schapenkaas', 'kaas', { eenheid: 'gram', prijs_per: 100 }),
    prod('Amsterdamse uien (uitgelekt)', 'zuur', { eenheid: 'gram', prijs_per: 100 }),
    prod('Cornichons (uitgelekt)', 'zuur', { eenheid: 'gram', prijs_per: 100 }),
    prod('Pizza-dipcrackers (los)', 'krokant', { eenheid: 'gram', prijs_per: 100 }),
    prod('Chili-rijstcrackers', 'krokant', { eenheid: 'gram', prijs_per: 100 }),
    prod("Mexicano's", 'krokant', { eenheid: 'gram', prijs_per: 100 }),
];
const { data: bestaandProd } = await sb.from('winkel_producten').select('id, naam').eq('organization_id', o);
const prodOpNaam = new Map((bestaandProd ?? []).map((r) => [r.naam, r.id]));
for (const p of sintProducten) {
    if (prodOpNaam.has(p.naam)) continue;
    const { data, error } = await sb.from('winkel_producten').insert(p).select('id').single();
    if (error) throw error;
    prodOpNaam.set(p.naam, data.id);
    console.log('product', p.naam);
}
const pid = (naam) => prodOpNaam.get(naam) ?? null;

/* Slots per artikel. Alleen aangemaakt als het artikel nog geen slots heeft,
   zodat wat Mathijs daarna invult blijft staan. */
const S = (slot_type, naam, hoeveelheid, extra = {}) => ({ slot_type, naam, hoeveelheid, eenheid: 'stuk', per: 'stuk', standaard_product_id: null, ...extra });
const g = (naam, hoeveelheid, product = naam) => S('amandelen', naam, hoeveelheid, { eenheid: 'gram', per: 'persoon', standaard_product_id: pid(product) });
const amandelen = (gram) => S('amandelen', 'BBQ-amandelen', gram, { eenheid: 'gram', standaard_product_id: pid('BBQ-amandelen') });
const crackers = () => S('crackers', 'Pizza-dipcrackers (bakje 60 g)', 1, { standaard_product_id: pid('Pizza-dipcrackers 60 g (bakje)') });
const doos = (prijs) => S('doos', 'Geschenkdoos', 1, { standaard_product_id: pid(`Geschenkdoos + vulling (€ ${prijs})`) });
const sintSlots = {
    'sinterklaas-borrelplank': [
        ['vleeswaar', 'Pastrami (Beef Club 29)', 20], ['vleeswaar', 'Eigen grillworst', 40],
        ['worst', 'Droge worst, soort 1 (plank)', 10], ['worst', 'Droge worst, soort 2 (plank)', 10], ['worst', 'Droge worst, soort 3 (plank)', 10],
        ['vleeswaar', 'Coppa', 10], ['vleeswaar', 'Serranoham', 10],
        ['kaas', 'Drentse hooikaas', 30], ['kaas', 'Spaanse schapenkaas', 25],
        ['zuur', 'Amsterdamse uien (uitgelekt)', 20], ['zuur', 'Cornichons (uitgelekt)', 20],
        ['krokant', 'Pizza-dipcrackers (los)', 10], ['krokant', 'Chili-rijstcrackers', 10], ['krokant', "Mexicano's", 10],
        ['amandelen', 'BBQ-amandelen', 15],
    ].map(([t, naam, gram]) => S(t, naam, gram, { eenheid: 'gram', per: 'persoon', standaard_product_id: pid(naam) })),
    'sint-bier-20': [S('bier', 'Voordelig bier (groothandel)', 1), S('bier', 'Hop & Bites-advies bier', 1), S('bier', 'Lokaal bier', 1), S('worst', 'Droge worst', 1), amandelen(100), doos(20)],
    'sint-bier-35': [S('bier', 'Bier', 5), S('worst', 'Droge worst', 1), amandelen(150), crackers(), doos(35)],
    'sint-bier-50': [S('bier', 'Bier', 4), S('bier', 'Bijzonder bier (Mr. Hop)', 1), S('worst', 'Droge worst', 2), amandelen(200), crackers(), S('marmelade', 'Marmelade (Cerveza of rode peper)', 1), doos(50)],
    'sint-wijn-35': [S('wijn', 'Wijn', 2), S('worst', 'Droge worst', 1), amandelen(150), crackers(), doos(35)],
    'sint-wijn-50': [S('wijn', 'Wijn', 2), S('worst', 'Droge worst, smaak 1', 1), S('worst', 'Droge worst, smaak 2', 1), S('worst', 'Droge worst, smaak 3', 1), amandelen(200), crackers(), S('marmelade', 'Marmelade (vijg of rode wijn)', 1), doos(50)],
    'sint-bier-wijn-35': [S('wijn', 'Wijn', 1), S('bier', 'Lokaal bier', 3), S('worst', 'Droge worst', 1), amandelen(150), crackers(), doos(35)],
    'sint-bier-wijn-50': [S('wijn', 'Wijn', 1), S('bier', 'Bier', 2), S('bier', 'Bijzonder bier (Mr. Hop)', 1), S('worst', 'Droge worst', 2), amandelen(200), crackers(), S('marmelade', 'Marmelade ui', 1, { standaard_product_id: pid('Marmelade ui') }), doos(50)],
};
void g;
for (const [slug, slots] of Object.entries(sintSlots)) {
    const artikelId = sintOpSlug.get(slug);
    if (!artikelId) continue;
    const { count } = await sb.from('winkel_artikel_slots').select('id', { count: 'exact', head: true }).eq('artikel_id', artikelId);
    if (count && count > 0) { console.log('slots bestaan al', slug); continue; }
    const { error } = await sb.from('winkel_artikel_slots').insert(slots.map((sl, i) => ({ organization_id: o, artikel_id: artikelId, volgorde: i + 1, ...sl })));
    if (error) throw error;
    console.log('slots', slug, slots.length, slots.some((x) => !x.standaard_product_id) ? '(nog niet verkoopbaar: slots zonder product)' : '');
}

/* Reservering: € 2,50 per order (besluit 26 september). Alleen zetten als hij leeg is. */
{
    const { data: i } = await sb.from('winkel_instellingen').select('reservering_bedrag_cents').eq('organization_id', o).maybeSingle();
    if (i && i.reservering_bedrag_cents == null) {
        const { error } = await sb.from('winkel_instellingen').update({ reservering_bedrag_cents: 250 }).eq('organization_id', o);
        if (error) throw error;
        console.log('reserveringsbedrag: € 2,50 per order');
    }
}
console.log('klaar');
