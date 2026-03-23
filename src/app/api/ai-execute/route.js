import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

var supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ─── Datum-helper ─────────────────────────────────────────────────────────────
function fmtDatum(dateStr) {
    if (!dateStr) return '?';
    var d = new Date(dateStr);
    var dagen = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
    var maanden = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    return dagen[d.getDay()] + ' ' + d.getDate() + ' ' + maanden[d.getMonth()];
}

function addDays(dateStr, n) {
    var d = new Date(dateStr);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}

// ─── TOOL: Genereer prep-lijst voor een event ─────────────────────────────────
async function generatePrepList(params) {
    var event_id = params.event_id;

    // Haal event op (of het eerstvolgende event als geen ID)
    var eventData = null;
    if (event_id) {
        var byId = await supabase.from('events').select('*').eq('id', event_id).single();
        if (!byId.error) eventData = byId.data;
    } else {
        var today = new Date().toISOString().slice(0, 10);
        var upcoming = await supabase.from('events')
            .select('*')
            .gte('date', today)
            .order('date', { ascending: true })
            .limit(1);
        if (!upcoming.error && upcoming.data && upcoming.data.length > 0) {
            eventData = upcoming.data[0];
        }
    }

    if (!eventData) {
        return { error: 'Geen aankomend event gevonden. Voeg eerst een event toe via de Events-pagina.' };
    }

    var event = eventData;
    var menuIds = event.menu || [];

    // Haal gekoppelde recepten op
    var recepten = [];
    if (menuIds.length > 0) {
        var recRes = await supabase.from('recepten').select('*').in('id', menuIds);
        recepten = recRes.data || [];
    }

    // Bereken gecombineerde ingrediëntenlijst (MEP)
    var ingredientMap = {};
    recepten.forEach(function (recept) {
        var multiplier = (event.guests || 1) / (recept.porties || 1);
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
                    hoeveelheid: 0,
                    eenheid: ing.eenheid || '',
                    voor_recepten: [],
                };
            }
            ingredientMap[key].hoeveelheid += (parseFloat(ing.hoeveelheid) || 0) * multiplier;
            if (!ingredientMap[key].voor_recepten.includes(recept.naam)) {
                ingredientMap[key].voor_recepten.push(recept.naam);
            }
        });
    });

    var mepLijst = Object.values(ingredientMap).sort(function (a, b) {
        return a.naam.localeCompare(b.naam);
    });

    // Bouw prep-tijdlijn
    var timeline = [];

    // -3 dagen: rubben, marineren
    var isVlees = recepten.some(function (r) {
        return r.categorie === 'Vlees' || r.categorie === 'Marinade';
    });
    if (isVlees) {
        var d3 = addDays(event.date, -3);
        var d3Taken = recepten
            .filter(function (r) { return r.categorie === 'Vlees' || r.categorie === 'Marinade' || r.categorie === 'Rub'; })
            .map(function (r) { return r.naam + ' — rubben/marineren (trekt 48u)'; });
        if (d3Taken.length > 0) {
            timeline.push({ dag: fmtDatum(d3) + ' (3 dagen voor)', taken: d3Taken });
        }
    }

    // -2 dagen: inkoop + grote prep
    var d2 = addDays(event.date, -2);
    var d2Taken = ['Inkoop doen (vers vlees, groente, specerijen)'];
    recepten.filter(function (r) { return (r.preptime || 0) > 60; }).forEach(function (r) {
        d2Taken.push(r.naam + ' — grote voorbereidingen (' + r.preptime + ' min)');
    });
    d2Taken.push('Sauzen en dressings maken');
    d2Taken.push('Droge ingrediënten afwegen en labelen');
    timeline.push({ dag: fmtDatum(d2) + ' (2 dagen voor)', taken: d2Taken });

    // -1 dag: mise-en-place + materieel
    var d1 = addDays(event.date, -1);
    var d1Taken = ['Bus inladen en materieel checken', 'Koelboxen vullen (ijs, koelblokken)'];
    recepten.filter(function (r) { return (r.preptime || 0) <= 60; }).forEach(function (r) {
        d1Taken.push(r.naam + ' — mise-en-place');
    });
    d1Taken.push('BBQ\'s controleren (kolen/gas, roosters schoon)');
    d1Taken.push('HACCP-formulieren klaarleggen');
    if (event.guests > 75) {
        d1Taken.push('Extra personeel bevestigen (' + event.guests + ' gasten = grote bezetting)');
    }
    timeline.push({ dag: fmtDatum(d1) + ' (dag voor)', taken: d1Taken });

    // Event dag
    var eventTaken = [
        'Aankomst locatie + opbouw (' + (event.location || 'locatie') + ')',
        'Temperatuurcheck alle producten (HACCP)',
        'BBQ\'s aansteken (voorverhitten 45 min)',
    ];
    recepten.forEach(function (r) {
        eventTaken.push(r.naam + ' — bereidingsstart');
    });
    eventTaken.push('Service starten', 'Tussentijdse HACCP-controles', 'Afbouw + koelketen bewaken');
    timeline.push({ dag: fmtDatum(event.date) + ' (eventdag)', taken: eventTaken });

    return {
        event: {
            id: event.id,
            naam: event.name,
            datum: event.date,
            gasten: event.guests,
            locatie: event.location,
            status: event.status,
        },
        recepten: recepten.map(function (r) {
            return { id: r.id, naam: r.naam, categorie: r.categorie, porties: r.porties, preptime: r.preptime };
        }),
        prep_timeline: timeline,
        mep_lijst: mepLijst,
    };
}

// ─── TOOL: Genereer slimme inkooplijst op basis van event + recepten ─────────
async function generateInkooplijst(params) {
    var event_id = params.event_id;

    // Haal event op — fallback op eerstvolgende event als geen ID meegegeven
    var eventRes;
    if (event_id) {
        eventRes = await supabase.from('events').select('*').eq('id', event_id).single();
    } else {
        var todayInk = new Date().toISOString().slice(0, 10);
        var fallbackRes = await supabase.from('events').select('*')
            .in('status', ['optie', 'pending', 'confirmed'])
            .gte('date', todayInk)
            .order('date', { ascending: true })
            .limit(1)
            .single();
        eventRes = fallbackRes;
    }
    if (!eventRes || eventRes.error || !eventRes.data) return { error: 'Geen aankomend event gevonden. Voeg eerst een event toe via de Events-pagina.' };
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

    var eventRes;
    if (event_id) {
        eventRes = await supabase.from('events').select('*').eq('id', event_id).single();
    } else {
        var todayBrf = new Date().toISOString().slice(0, 10);
        var fallbackBrf = await supabase.from('events').select('*')
            .in('status', ['optie', 'pending', 'confirmed'])
            .gte('date', todayBrf)
            .order('date', { ascending: true })
            .limit(1)
            .single();
        eventRes = fallbackBrf;
    }
    if (!eventRes || eventRes.error || !eventRes.data) return { error: 'Geen aankomend event gevonden.' };
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

    var eventRes;
    if (event_id) {
        eventRes = await supabase.from('events').select('*').eq('id', event_id).single();
    } else {
        var todayWst = new Date().toISOString().slice(0, 10);
        var fallbackWst = await supabase.from('events').select('*')
            .in('status', ['optie', 'pending', 'confirmed'])
            .gte('date', todayWst)
            .order('date', { ascending: true })
            .limit(1)
            .single();
        eventRes = fallbackWst;
    }
    if (!eventRes || eventRes.error || !eventRes.data) return { error: 'Geen aankomend event gevonden.' };
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
            heeft_uren: time_logs.length > 0,
        },
    };
}

// ─── TOOL: Haal cross-module context op ──────────────────────────────────────
async function getCrossModuleContext(params) {
    var ctx = {};

    // Aankomende events met gekoppelde recepten
    var today = new Date().toISOString().slice(0, 10);
    var nextWeek = addDays(today, 14);
    var evRes = await supabase.from('events').select('id,name,date,guests,status,location,menu,ppp')
        .gte('date', today).lte('date', nextWeek).order('date', { ascending: true });
    ctx.events = evRes.data || [];

    // Alle recepten (summary)
    var recRes = await supabase.from('recepten').select('id,naam,categorie,porties,preptime').order('naam');
    ctx.recepten = recRes.data || [];

    // Gangen (voor dish generator)
    var gangRes = await supabase.from('gangen').select('id,naam,slug,volgorde,actief').order('volgorde');
    ctx.gangen = (gangRes.data || []).filter(function (g) { return g.actief !== false; });

    // Gerechten (bestaand menu)
    var gerRes = await supabase.from('gerechten').select('id,naam,gang_slug,actief').order('naam');
    ctx.gerechten = gerRes.data || [];

    // Lage voorraad
    var invRes = await supabase.from('inventory').select('naam,current_stock,min_stock,unit');
    ctx.low_stock = (invRes.data || []).filter(function (i) { return i.current_stock <= i.min_stock; });

    return ctx;
}

// ─── TOOL: Bulk insert gerechten ──────────────────────────────────────────────
async function bulkCreateGerechten(params) {
    var gerechten = params.gerechten || [];
    if (gerechten.length === 0) return { error: 'Geen gerechten opgegeven' };

    // Parallel inserts voor snelheid
    var settled = await Promise.allSettled(
        gerechten.map(function (g, i) {
            return supabase.from('gerechten').insert({
                naam: g.naam,
                gang_slug: g.gang_slug,
                beschrijving: g.beschrijving || '',
                bereidingswijze: g.bereidingswijze || '',
                actief: g.actief !== undefined ? g.actief : false,
                volgorde: g.volgorde || i + 1,
            }).select().single();
        })
    );

    var results = [];
    var errors = [];
    settled.forEach(function (outcome, i) {
        if (outcome.status === 'fulfilled' && !outcome.value.error) {
            results.push(outcome.value.data);
        } else {
            var msg = outcome.status === 'rejected'
                ? outcome.reason.message
                : outcome.value.error.message;
            errors.push({ naam: gerechten[i].naam, error: msg });
        }
    });

    return { inserted: results.length, errors: errors, ids: results.map(function (r) { return r.id; }) };
}

// ─── TOOL: Verwijder/verberg gerechten ───────────────────────────────────────
async function filterGerechten(params) {
    var ids = params.ids_to_remove || [];
    var deactivate = params.deactivate_only !== false; // default: deactivate, don't delete

    if (ids.length === 0) return { error: 'Geen IDs opgegeven' };

    var results = [];
    for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var res;
        if (deactivate) {
            res = await supabase.from('gerechten').update({ actief: false }).eq('id', id);
        } else {
            res = await supabase.from('gerechten').delete().eq('id', id);
        }
        if (!res.error) results.push(id);
    }

    return {
        processed: results.length,
        action: deactivate ? 'gedeactiveerd' : 'verwijderd',
        ids: results,
    };
}

// ─── API Handler ──────────────────────────────────────────────────────────────
export async function POST(req) {
    try {
        var body = await req.json();
        var { tool, params } = body;

        if (!tool) {
            return NextResponse.json({ error: 'Geen tool opgegeven' }, { status: 400 });
        }

        var result;

        switch (tool) {
            case 'generatePrepList':
                result = await generatePrepList(params || {});
                break;
            case 'getCrossModuleContext':
                result = await getCrossModuleContext(params || {});
                break;
            case 'bulkCreateGerechten':
                result = await bulkCreateGerechten(params || {});
                break;
            case 'filterGerechten':
                result = await filterGerechten(params || {});
                break;
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

        return NextResponse.json({ success: true, result });

    } catch (error) {
        console.error('[AI Execute] Fout:', error);
        return NextResponse.json({ error: 'Serverfout: ' + error.message }, { status: 500 });
    }
}
