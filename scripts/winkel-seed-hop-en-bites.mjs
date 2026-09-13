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
console.log('klaar');
