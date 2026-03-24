import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// ─── TOOL: Genereer slimme inkooplijst op basis van event + recepten ─────────
async function generateInkooplijst(params) {
    var event_id = params.event_id;
    if (!event_id) return { error: 'event_id is verplicht' };

    // Haal event op
    var eventRes = await supabase.from('events').select('*').eq('id', event_id).single();
    if (eventRes.error || !eventRes.data) return { error: 'Event niet gevonden (id: ' + event_id + ')' };
    var event = eventRes.data;
    var gasten = event.guests || 1;

    // Haal recepten voor dit event op
    var menuIds = event.menu || [];
    var recepten = [];
    if (menuIds.length > 0) {
        var recRes = await supabase.from('recepten').select('*').in('id', menuIds);
        recepten = recRes.data || [];
    }

    // Haal huidige voorraad op
    var invRes = await supabase.from('inventory').select('naam,current_stock,unit,purchase_price');
    var inventory = invRes.data || [];
    var invMap = {};
    inventory.forEach(function (i) { invMap[(i.naam || '').toLowerCase().trim()] = i; });

    // Bereken benodigde hoeveelheden per ingrediënt
    var ingredientMap = {};
    recepten.forEach(function (recept) {
        var multiplier = gasten / (recept.porties || 1);
        var ingredienten = recept.ingredienten || [];
        if (typeof ingredienten === 'string') {
            try { ingredienten = JSON.parse(ingredienten); } catch (e) { ingredienten = []; }
        }
        ingredienten.forEach(function (ing) {
            var key = (ing.naam || '').toLowerCase().trim();
            if (!key) return;
            if (!ingredientMap[key]) {
                ingredientMap[key] = {
                    naam: ing.naam,
                    benodigdheid: 0,
                    eenheid: ing.eenheid || '',
                    in_voorraad: invMap[key] ? (invMap[key].current_stock || 0) : 0,
                    prijs_pp: invMap[key] ? (invMap[key].purchase_price || 0) : 0,
                    te_bestellen: 0,
                    voor_recepten: [],
                };
            }
            ingredientMap[key].benodigdheid += (parseFloat(ing.hoeveelheid) || 0) * multiplier;
            if (!ingredientMap[key].voor_recepten.includes(recept.naam)) {
                ingredientMap[key].voor_recepten.push(recept.naam);
            }
        });
    });

    // Bereken te_bestellen = benodigdheid - in_voorraad (minimaal 0)
    Object.values(ingredientMap).forEach(function (ing) {
        ing.te_bestellen = Math.max(0, ing.benodigdheid - ing.in_voorraad);
        ing.benodigdheid = Math.round(ing.benodigdheid * 100) / 100;
        ing.te_bestellen = Math.round(ing.te_bestellen * 100) / 100;
        ing.in_voorraad = Math.round(ing.in_voorraad * 100) / 100;
    });

    var items = Object.values(ingredientMap)
        .filter(function (i) { return i.benodigdheid > 0; })
        .sort(function (a, b) { return a.naam.localeCompare(b.naam); });

    var totaalKosten = items.reduce(function (sum, i) { return sum + (i.te_bestellen * i.prijs_pp); }, 0);

    return {
        event: { id: event.id, naam: event.name, datum: event.date, gasten: gasten, locatie: event.location },
        items: items,
        totaal_items: items.length,
        te_bestellen_items: items.filter(function (i) { return i.te_bestellen > 0; }).length,
        al_in_voorraad: items.filter(function (i) { return i.te_bestellen === 0; }).length,
        geschatte_inkoop_kosten: Math.round(totaalKosten * 100) / 100,
        recepten_count: recepten.length,
    };
}

// ─── TOOL: Genereer event briefing ───────────────────────────────────────────
async function generateEventBriefing(params) {
    var event_id = params.event_id;
    if (!event_id) return { error: 'event_id is verplicht' };

    var eventRes = await supabase.from('events').select('*').eq('id', event_id).single();
    if (eventRes.error || !eventRes.data) return { error: 'Event niet gevonden' };
    var event = eventRes.data;

    // Recepten
    var menuIds = event.menu || [];
    var recepten = [];
    if (menuIds.length > 0) {
        var recRes = await supabase.from('recepten').select('id,naam,categorie,porties,preptime').in('id', menuIds);
        recepten = recRes.data || [];
    }

    // Prep-taken
    var prepRes = await supabase.from('prep_tasks').select('*').eq('event_id', event_id).order('dagen');
    var prep_tasks = prepRes.data || [];

    // Offerte
    var offRes = await supabase.from('offertes').select('id,nummer,status,basis_prijs_pp,aantal_gasten,korting,items').eq('event_id', event_id).limit(1);
    var offerte = offRes.data && offRes.data[0] ? offRes.data[0] : null;

    // HACCP-records voor dit event
    var hacRes = await supabase.from('haccp_records').select('id,datum,tijd,wat,temp,status').eq('event_id', event_id).order('datum').limit(20);
    var haccp = hacRes.data || [];

    return {
        briefing_datum: new Date().toISOString().slice(0, 10),
        event: {
            id: event.id,
            naam: event.name,
            datum: event.date,
            gasten: event.guests,
            locatie: event.location,
            status: event.status,
            contactpersoon: event.contactpersoon || event.contact || null,
            telefoon: event.telefoon || event.phone || null,
            notities: event.notes || event.notities || null,
        },
        menu: recepten,
        prep_taken_klaar: prep_tasks.filter(function (t) { return t.done; }).length,
        prep_taken_open: prep_tasks.filter(function (t) { return !t.done; }).length,
        prep_tasks: prep_tasks.slice(0, 12),
        offerte: offerte,
        haccp_count: haccp.length,
    };
}

// ─── TOOL: Winstgevendheid per event ─────────────────────────────────────────
async function getEventWinstgevendheid(params) {
    var event_id = params.event_id;
    if (!event_id) return { error: 'event_id is verplicht' };

    var eventRes = await supabase.from('events').select('*').eq('id', event_id).single();
    if (eventRes.error || !eventRes.data) return { error: 'Event niet gevonden' };
    var event = eventRes.data;

    // Facturen voor dit event
    var facRes = await supabase.from('facturen').select('*').eq('event_id', event_id);
    var facturen = facRes.data || [];

    // Uren voor dit event
    var urenRes = await supabase.from('time_logs').select('*').eq('event_id', event_id);
    var time_logs = urenRes.data || [];

    // Inkooplijsten voor dit event
    var inkoopRes = await supabase.from('inkooplijsten').select('*').eq('event_id', event_id);
    var inkoop = inkoopRes.data || [];

    // Helper: bereken totaal van items-array
    function calcItemsTotaal(items) {
        if (!items) return 0;
        if (typeof items === 'string') { try { items = JSON.parse(items); } catch (e) { return 0; } }
        return (Array.isArray(items) ? items : []).reduce(function (s, i) {
            return s + (parseFloat(i.prijs || i.price || 0) * parseFloat(i.qty || i.aantal || 1));
        }, 0);
    }

    var omzet = facturen.reduce(function (s, f) { return s + calcItemsTotaal(f.items); }, 0);
    var inkoopKosten = inkoop.reduce(function (s, l) { return s + calcItemsTotaal(l.items); }, 0);

    var DEFAULT_UURLOON = 15;
    var totaalUren = 0;
    var arbeidskosten = 0;
    time_logs.forEach(function (t) {
        if (t.start_time && t.end_time) {
            var uren = Math.max(0, (new Date(t.end_time) - new Date(t.start_time)) / 3600000);
            totaalUren += uren;
            arbeidskosten += uren * (parseFloat(t.uurloon) || DEFAULT_UURLOON);
        }
    });

    var brutoMarge = omzet - inkoopKosten;
    var nettoMarge = omzet - inkoopKosten - arbeidskosten;
    var brutoMargePerc = omzet > 0 ? Math.round(brutoMarge / omzet * 100) : null;
    var nettoMargePerc = omzet > 0 ? Math.round(nettoMarge / omzet * 100) : null;

    function fmt(n) { return Math.round(n * 100) / 100; }

    return {
        event: { id: event.id, naam: event.name, datum: event.date, gasten: event.guests },
        omzet: fmt(omzet),
        inkoopKosten: fmt(inkoopKosten),
        arbeidskosten: fmt(arbeidskosten),
        totaalUren: Math.round(totaalUren * 10) / 10,
        brutoMarge: fmt(brutoMarge),
        nettoMarge: fmt(nettoMarge),
        brutoMargePerc: brutoMargePerc,
        nettoMargePerc: nettoMargePerc,
        facturen_count: facturen.length,
        inkoop_count: inkoop.length,
        urenlog_count: time_logs.length,
        datakwaliteit: {
            heeft_facturen: facturen.length > 0,
            heeft_inkoop: inkoop.length > 0,
            heeft_uren: urenRes.data && urenRes.data.length > 0,
        },
    };
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { tool, params } = body;
        let result;

        switch (tool) {
            case 'generateInkooplijst':
                result = await generateInkooplijst(params || {});
                break;
            case 'generateEventBriefing':
                result = await generateEventBriefing(params || {});
                break;
            case 'getEventWinstgevendheid':
                result = await getEventWinstgevendheid(params || {});
                break;
            default:
                return NextResponse.json({ error: 'Onbekende tool: ' + tool }, { status: 400 });
        }

        return NextResponse.json({ result });
    } catch (err) {
        console.error('[AI Execute API] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
