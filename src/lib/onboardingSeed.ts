/**
 * Pro-tier onboarding demo-data seed.
 *
 * Generieke catering-data (geen Hop & Bites-specifieke namen) die nieuwe tenants
 * direct na PersonaQuiz krijgen. Doel: alle hubs voelen levend, geen lege empty-states.
 *
 * Gebruikt de gewone supabase-client met RLS — werkt voor elke ingelogde org-member
 * zonder service-role. Helemaal client-side, geen API-route nodig.
 *
 * Trigger: vanuit PersonaQuiz.finalize() na de 3 vragen.
 * Idempotent via localStorage-flag `bbq_demo_seeded_v1`.
 */

import { supabase } from './supabase';

const FLAG_KEY = 'bbq_demo_seeded_v1';

/* Helper: dagen vanaf vandaag in YYYY-MM-DD format. */
function daysFromNow(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}

/**
 * Seed minimale demo-data voor een nieuwe org. Idempotent — slaat over als al gedaan.
 *
 * @param orgId organization_id (uit useOrg)
 * @returns true als seed gedaan, false als al gedaan of fout
 */
export async function seedDemoData(orgId: string): Promise<boolean> {
    if (!supabase || !orgId) return false;

    /* Idempotency-guard 1: localStorage-flag voorkomt dubbele seed bij refresh tijdens quiz. */
    try {
        if (localStorage.getItem(FLAG_KEY) === orgId) return false;
    } catch { /* localStorage geblokkeerd, doorgaan */ }

    try {
        /* Idempotency-guard 2: skip als org al echte data heeft (bestaande tenant zoals
           Hop & Bites). Voorkomt dubbele records voor wie al actief is. */
        const { count, error: countErr } = await supabase
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId);
        if (countErr) throw countErr;
        if ((count ?? 0) > 0) {
            /* Markeer als "gedaan" zodat we niet opnieuw checken bij volgende quiz-fire. */
            try { localStorage.setItem(FLAG_KEY, orgId); } catch { /* */ }
            return false;
        }

        /* ─── 1. Klanten — 1 particulier, 1 zakelijk ──────────────────────────── */
        const { data: klanten, error: klantenErr } = await supabase
            .from('klanten')
            .insert([
                {
                    organization_id: orgId,
                    naam: 'Familie Jansen',
                    bedrijf: '',
                    type: 'Particulier',
                    plaats: 'Demo-stad',
                    email: 'familie.jansen@demo.nl',
                    notities: 'Demo: vaste klant voor verjaardagen',
                },
                {
                    organization_id: orgId,
                    naam: 'TechBV',
                    bedrijf: 'TechBV BV',
                    type: 'Zakelijk',
                    plaats: 'Demo-stad',
                    email: 'events@techbv.demo',
                    notities: 'Demo: jaarlijks bedrijfsfeest',
                },
            ])
            .select('id, naam');
        if (klantenErr) throw klantenErr;
        const klantParticulier = klanten?.[0];
        const klantZakelijk = klanten?.[1];

        /* ─── 2. Gerechten — 5 generieke catering-items ───────────────────────── */
        const { error: gerechtenErr } = await supabase
            .from('gerechten')
            .insert([
                { organization_id: orgId, naam: 'Gemarineerde kipfilet', beschrijving: 'Mals, sappig, met kruidenrub', gang_slug: 'hoofdgerechten', actief: true, ingredienten: ['Kipfilet', 'Olijfolie', 'Kruidenmix'], allergenen: [], tags: ['Klassieker'], kostprijs_pp: 3.20, verkoopprijs: 9.50 },
                { organization_id: orgId, naam: 'Spareribs honing-mosterd', beschrijving: 'Slow-cooked met zoete glaze', gang_slug: 'hoofdgerechten', actief: true, ingredienten: ['Spareribs', 'Honing', 'Mosterd'], allergenen: ['Mosterd'], tags: ['Populair'], kostprijs_pp: 4.50, verkoopprijs: 13.00 },
                { organization_id: orgId, naam: 'Pulled pork sliders', beschrijving: 'Briochebroodje met coleslaw', gang_slug: 'bites', actief: true, ingredienten: ['Pulled pork', 'Brioche', 'Coleslaw'], allergenen: ['Gluten', 'Eieren', 'Melk'], tags: ['Populair'], kostprijs_pp: 2.40, verkoopprijs: 6.50 },
                { organization_id: orgId, naam: 'Caesar-salade', beschrijving: 'Romaine, croutons, parmezaan, dressing', gang_slug: 'voorgerechten', actief: true, ingredienten: ['Romaine', 'Croutons', 'Parmezaan'], allergenen: ['Gluten', 'Melk', 'Eieren'], tags: ['Vega'], kostprijs_pp: 1.80, verkoopprijs: 5.50 },
                { organization_id: orgId, naam: 'Brownies met vanilleijs', beschrijving: 'Warm dessert met romige bol', gang_slug: 'dessert', actief: true, ingredienten: ['Brownie', 'Vanille-ijs'], allergenen: ['Gluten', 'Melk', 'Eieren'], tags: ['Klassieker'], kostprijs_pp: 1.50, verkoopprijs: 5.00 },
            ]);
        if (gerechtenErr) throw gerechtenErr;

        /* ─── 3. Events — 1 vandaag, 1 over 5 dagen, 1 vorige week ────────────── */
        const { data: events, error: eventsErr } = await supabase
            .from('events')
            .insert([
                {
                    organization_id: orgId,
                    name: 'Verjaardag Familie Jansen 30p',
                    date: daysFromNow(0),
                    guests: 30,
                    location: 'Demo-stad',
                    ppp: 35.00,
                    status: 'confirmed',
                    type: 'Particulier',
                    client_naam: 'Familie Jansen',
                    notitie: 'Demo: live event vandaag',
                    start_time: '17:00:00',
                    end_time: '22:00:00',
                },
                {
                    organization_id: orgId,
                    name: 'Bedrijfsfeest TechBV 80p',
                    date: daysFromNow(5),
                    guests: 80,
                    location: 'Demo-stad',
                    ppp: 42.50,
                    status: 'confirmed',
                    type: 'Zakelijk',
                    client_naam: 'TechBV',
                    notitie: 'Demo: confirmed event over 5 dagen',
                    start_time: '17:00:00',
                    end_time: '23:00:00',
                    veg_guests: 10,
                },
                {
                    organization_id: orgId,
                    name: 'Bruiloft Anouk & Tim 120p',
                    date: daysFromNow(-7),
                    guests: 120,
                    location: 'Demo-stad',
                    ppp: 55.00,
                    status: 'completed',
                    type: 'Particulier',
                    client_naam: 'A. Brinkman + T. de Wit',
                    notitie: 'Demo: afgerond event vorige week',
                    start_time: '16:00:00',
                    end_time: '00:00:00',
                },
            ])
            .select('id, name');
        if (eventsErr) throw eventsErr;
        const eventVandaag = events?.[0];
        const eventTechBV = events?.[1];
        const eventBruiloft = events?.[2];

        /* ─── 4. Offertes — 1 verzonden (wacht antwoord), 1 concept ──────────── */
        const y = new Date().getFullYear();
        await supabase.from('offertes').insert([
            {
                organization_id: orgId,
                nummer: `OFF-${y}-001`,
                status: 'verzonden',
                client_naam: 'Familie Jansen',
                datum: daysFromNow(-10),
                geldig_tot: daysFromNow(20),
                aantal_gasten: 30,
                basis_prijs_pp: 35.00,
                event_id: eventVandaag?.id,
                notitie: 'Demo: offerte verzonden, wacht op antwoord',
                items: [],
                vaste_kosten: [],
            },
            {
                organization_id: orgId,
                nummer: `OFF-${y}-002`,
                status: 'concept',
                client_naam: 'TechBV',
                datum: daysFromNow(-3),
                geldig_tot: daysFromNow(27),
                aantal_gasten: 80,
                basis_prijs_pp: 42.50,
                event_id: eventTechBV?.id,
                notitie: 'Demo: concept, nog niet verstuurd',
                items: [],
                vaste_kosten: [],
            },
        ]);

        /* ─── 5. Factuur — 1 betaald (afgerond event) ────────────────────────── */
        await supabase.from('facturen').insert([
            {
                organization_id: orgId,
                nummer: `F${y}-001`,
                status: 'betaald',
                client_naam: 'A. Brinkman + T. de Wit',
                datum: daysFromNow(-7),
                vervaldatum: daysFromNow(7),
                event_id: eventBruiloft?.id,
                items: [{ omschrijving: 'Bruiloft 120p', aantal: 120, prijs: 55.00 }],
            },
        ]);

        /* ─── 6. Markeer als gedaan ──────────────────────────────────────────── */
        try { localStorage.setItem(FLAG_KEY, orgId); } catch { /* */ }
        return true;
    } catch (err) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('[seedDemoData] failed:', err);
        }
        return false;
    }
}
