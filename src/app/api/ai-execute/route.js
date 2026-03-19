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
    var eventRes;
    if (event_id) {
        eventRes = await supabase.from('events').select('*').eq('id', event_id).single();
    } else {
        var today = new Date().toISOString().slice(0, 10);
        eventRes = await supabase.from('events')
            .select('*')
            .gte('date', today)
            .order('date', { ascending: true })
            .limit(1)
            .single();
    }

    if (eventRes.error || !eventRes.data) {
        return { error: 'Geen event gevonden' };
    }

    var event = eventRes.data;
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

// ─── TOOL: Haal cross-module context op ──────────────────────────────────────
async function getCrossModuleContext(params) {
    var ctx = {};

    // Aankomende events met gekoppelde recepten
    var today = new Date().toISOString().slice(0, 10);
    var nextWeek = addDays(today, 7);
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

    var results = [];
    var errors = [];

    for (var i = 0; i < gerechten.length; i++) {
        var g = gerechten[i];
        var res = await supabase.from('gerechten').insert({
            naam: g.naam,
            gang_slug: g.gang_slug,
            beschrijving: g.beschrijving || '',
            bereidingswijze: g.bereidingswijze || '',
            actief: g.actief !== undefined ? g.actief : true,
            volgorde: g.volgorde || i + 1,
        }).select().single();
        if (res.error) {
            errors.push({ naam: g.naam, error: res.error.message });
        } else {
            results.push(res.data);
        }
    }

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
            default:
                return NextResponse.json({ error: 'Onbekende tool: ' + tool }, { status: 400 });
        }

        return NextResponse.json({ success: true, result });

    } catch (error) {
        console.error('[AI Execute] Fout:', error);
        return NextResponse.json({ error: 'Serverfout: ' + error.message }, { status: 500 });
    }
}
