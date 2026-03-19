// src/lib/bbq-context.js
// Laadt live Supabase-data per pagina en formatteert ze voor de AI systeem-prompt.

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
}

function euro(n) {
    return '€' + Number(n || 0).toFixed(2);
}

function calcOfferteTotaal(o) {
    if (o.items && Array.isArray(o.items) && o.items.length > 0) {
        var sub = o.items.reduce(function (s, item) {
            var line = (item.qty || 0) * (item.unit_price || 0);
            var btw = line * ((item.btw_rate || 0) / 100);
            return s + line + btw;
        }, 0);
        var korting = Number(o.korting || 0);
        var vaste = (o.vaste_kosten || []).reduce(function (s, k) { return s + Number(k.bedrag || 0); }, 0);
        return sub - korting + vaste;
    }
    var gasten = o.aantal_gasten || 0;
    var ppp = o.basis_prijs_pp || 0;
    var korting = Number(o.korting || 0);
    var vaste = (o.vaste_kosten || []).reduce(function (s, k) { return s + Number(k.bedrag || 0); }, 0);
    return gasten * ppp - korting + vaste;
}

// ── Page context loaders ──────────────────────────────────────────────────────

async function loadEventsContext(sb) {
    var today = new Date().toISOString().slice(0, 10);
    var { data: events } = await sb.from('events').select('*').gte('date', today).order('date').limit(10);
    var { data: recepten } = await sb.from('recepten').select('id,naam,categorie,porties,preptime').limit(50);
    return { events: events || [], recepten: recepten || [] };
}

async function loadAgendaContext(sb) {
    var { data: events } = await sb.from('events').select('id,name,date,guests,status,location').order('date').limit(20);
    var { data: tasks } = await sb.from('prep_tasks').select('*').order('created_at', { ascending: false }).limit(20);
    return { events: events || [], prep_tasks: tasks || [] };
}

async function loadOffortesContext(sb) {
    var { data } = await sb.from('offertes').select('id,nummer,status,client_naam,datum,vervaldatum,aantal_gasten,basis_prijs_pp,items,korting,vaste_kosten,menu_selectie').order('datum', { ascending: false }).limit(30);
    var offertes = data || [];
    var totaal = offertes.reduce(function (s, o) { return s + calcOfferteTotaal(o); }, 0);
    var open = offertes.filter(function (o) { return o.status === 'concept' || o.status === 'verzonden'; });
    var openTotaal = open.reduce(function (s, o) { return s + calcOfferteTotaal(o); }, 0);
    return { offertes: offertes, totaal_omzet: totaal, open_offertes: open.length, open_totaal: openTotaal };
}

async function loadFacturenContext(sb) {
    var { data } = await sb.from('facturen').select('id,nummer,client_naam,datum,vervaldatum,status,items,korting,vaste_kosten').order('datum', { ascending: false }).limit(30);
    var facturen = data || [];
    var calcTotaal = function (f) {
        if (f.items && f.items.length > 0) {
            var sub = f.items.reduce(function (s, i) { return s + (i.qty || 0) * (i.unit_price || 0) * (1 + (i.btw_rate || 0) / 100); }, 0);
            return sub - Number(f.korting || 0) + (f.vaste_kosten || []).reduce(function (s, k) { return s + Number(k.bedrag || 0); }, 0);
        }
        return 0;
    };
    var open = facturen.filter(function (f) { return f.status === 'verzonden' || f.status === 'concept'; });
    var betaald = facturen.filter(function (f) { return f.status === 'betaald'; });
    var today = new Date().toISOString().slice(0, 10);
    var vervallen = open.filter(function (f) { return f.vervaldatum && f.vervaldatum < today; });
    return {
        facturen: facturen,
        open_facturen: open.length,
        open_totaal: open.reduce(function (s, f) { return s + calcTotaal(f); }, 0),
        betaald_totaal: betaald.reduce(function (s, f) { return s + calcTotaal(f); }, 0),
        vervallen_facturen: vervallen.length
    };
}

async function loadGerechtenContext(sb) {
    var { data: gangen } = await sb.from('gangen').select('*').order('volgorde');
    var { data: gerechten } = await sb.from('gerechten').select('id,naam,gang_slug,beschrijving,tags,allergenen,kostprijs_pp,actief').order('volgorde');
    return { gangen: gangen || [], gerechten: gerechten || [], totaal: (gerechten || []).length };
}

async function loadReceptenContext(sb) {
    var { data: recepten } = await sb.from('recepten').select('*').order('naam');
    var { data: inventory } = await sb.from('inventory').select('id,naam,hoeveelheid,unit,min_par,purchase_price').order('naam');
    return { recepten: recepten || [], inventory: inventory || [] };
}

async function loadVoorraadContext(sb) {
    var { data: inventory } = await sb.from('inventory').select('*').order('naam');
    var laag = (inventory || []).filter(function (i) { return i.hoeveelheid <= i.min_par; });
    return { inventory: inventory || [], lage_voorraad: laag, laag_count: laag.length };
}

async function loadInkoopContext(sb) {
    var { data: inventory } = await sb.from('inventory').select('id,naam,hoeveelheid,min_par,unit,purchase_price,preferred_supplier').order('naam');
    var { data: gerechten } = await sb.from('gerechten').select('naam,ingredienten,ingredienten_winkels,ingredient_costs').limit(50);
    return { inventory: inventory || [], gerechten: gerechten || [] };
}

async function loadHaccpContext(sb) {
    var { data: logs } = await sb.from('haccp_logs').select('*').order('created_at', { ascending: false }).limit(50);
    var { data: events } = await sb.from('events').select('id,name,date').gte('date', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)).order('date');
    return { haccp_logs: logs || [], recent_events: events || [] };
}

async function loadServiceContext(sb) {
    var today2 = new Date().toISOString().slice(0, 10);
    var { data: events } = await sb.from('events').select('*').eq('date', today2).order('created_at');
    var { data: gerechten } = await sb.from('gerechten').select('naam,gang_slug,battle_plan_steps,target_prep_time,service_image').order('volgorde');
    return { vandaag_events: events || [], gerechten: gerechten || [] };
}

async function loadUrenContext(sb) {
    var maandAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    var { data: logs } = await sb.from('time_logs').select('*').gte('date', maandAgo).order('date', { ascending: false });
    return { uren_logs: logs || [] };
}

async function loadMaterieelContext(sb) {
    var { data: items } = await sb.from('materieel').select('*').order('naam');
    return { materieel: items || [] };
}

async function loadLogistiekContext(sb) {
    var today3 = new Date().toISOString().slice(0, 10);
    var { data: events } = await sb.from('events').select('*').gte('date', today3).order('date').limit(5);
    var { data: materieel } = await sb.from('materieel').select('id,naam,categorie,actief').order('naam');
    return { komende_events: events || [], materieel: materieel || [] };
}

async function loadBoekhoudingContext(sb) {
    var { data: offertes } = await sb.from('offertes').select('datum,status,items,korting,vaste_kosten,basis_prijs_pp,aantal_gasten').order('datum', { ascending: false }).limit(100);
    var { data: facturen } = await sb.from('facturen').select('datum,status,items,korting,vaste_kosten').order('datum', { ascending: false }).limit(100);
    var nu = new Date();
    var kwartaal = Math.floor(nu.getMonth() / 3) + 1;
    return { offertes: offertes || [], facturen: facturen || [], kwartaal: kwartaal, jaar: nu.getFullYear() };
}

async function loadDashboardContext(sb) {
    var today4 = new Date().toISOString().slice(0, 10);
    var week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    var [evRes, invRes, offRes] = await Promise.all([
        sb.from('events').select('id,name,date,guests,status').gte('date', today4).lte('date', week).order('date'),
        sb.from('inventory').select('naam,hoeveelheid,min_par,unit').lte('hoeveelheid', sb.rpc ? 9999 : 9999).order('naam'),
        sb.from('offertes').select('status,items,korting,vaste_kosten,basis_prijs_pp,aantal_gasten').order('datum', { ascending: false }).limit(20),
    ]);
    var invLaag = ((invRes.data || []).filter(function (i) { return i.hoeveelheid <= i.min_par; }));
    return {
        events_deze_week: evRes.data || [],
        lage_voorraad: invLaag,
        recente_offertes: offRes.data || []
    };
}

async function loadMenuEngineeringContext(sb) {
    var { data: gerechten } = await sb.from('gerechten').select('naam,gang_slug,kostprijs_pp,tags').order('volgorde');
    var { data: offertes } = await sb.from('offertes').select('menu_selectie,basis_prijs_pp').limit(50);
    return { gerechten: gerechten || [], offertes: offertes || [] };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function loadPageContext(pathname) {
    var sb = getSupabase();
    try {
        if (pathname === '/' || pathname === '') return await loadDashboardContext(sb);
        if (pathname.startsWith('/events')) return await loadEventsContext(sb);
        if (pathname.startsWith('/agenda')) return await loadAgendaContext(sb);
        if (pathname.startsWith('/offertes')) return await loadOffortesContext(sb);
        if (pathname.startsWith('/facturen')) return await loadFacturenContext(sb);
        if (pathname.startsWith('/gerechten')) return await loadGerechtenContext(sb);
        if (pathname.startsWith('/recepten')) return await loadReceptenContext(sb);
        if (pathname.startsWith('/voorraad')) return await loadVoorraadContext(sb);
        if (pathname.startsWith('/inkoop')) return await loadInkoopContext(sb);
        if (pathname.startsWith('/haccp')) return await loadHaccpContext(sb);
        if (pathname.startsWith('/service')) return await loadServiceContext(sb);
        if (pathname.startsWith('/uren')) return await loadUrenContext(sb);
        if (pathname.startsWith('/materieel')) return await loadMaterieelContext(sb);
        if (pathname.startsWith('/logistiek')) return await loadLogistiekContext(sb);
        if (pathname.startsWith('/boekhouding')) return await loadBoekhoudingContext(sb);
        if (pathname.startsWith('/menu-engineering')) return await loadMenuEngineeringContext(sb);
        return {};
    } catch (err) {
        console.error('[bbq-context] loadPageContext error:', err);
        return {};
    }
}

// ── Context → prompt text ─────────────────────────────────────────────────────

export function formatContext(pathname, data) {
    if (!data || Object.keys(data).length === 0) return '';

    var lines = ['\n\n--- LIVE DATA UIT HET SYSTEEM ---'];

    // Dashboard
    if (data.events_deze_week !== undefined) {
        lines.push('Events deze week: ' + (data.events_deze_week.length));
        (data.events_deze_week || []).forEach(function (e) {
            lines.push('  - ' + e.name + ' | ' + e.date + ' | ' + e.guests + ' gasten | status: ' + e.status);
        });
        lines.push('Lage voorraad: ' + (data.lage_voorraad || []).length + ' items');
        (data.lage_voorraad || []).forEach(function (i) {
            lines.push('  - ' + i.naam + ': ' + i.hoeveelheid + '/' + i.min_par + ' ' + i.unit + ' (TE LAAG)');
        });
    }

    // Events
    if (data.events && pathname && pathname.startsWith('/events')) {
        lines.push('Aankomende events (' + data.events.length + '):');
        (data.events || []).forEach(function (e) {
            lines.push('  - [' + e.id + '] ' + e.name + ' | ' + e.date + ' | ' + (e.guests || 0) + ' gasten | €' + (e.ppp || 0).toFixed(2) + '/p.p. | status: ' + e.status + (e.location ? ' | ' + e.location : ''));
            if (e.menu && e.menu.length > 0) {
                lines.push('    Menu: ' + e.menu.join(', '));
            }
        });
        if (data.recepten && data.recepten.length > 0) {
            lines.push('Beschikbare recepten (' + data.recepten.length + '): ' + data.recepten.map(function (r) { return r.naam; }).join(', '));
        }
    }

    // Offertes
    if (data.offertes && pathname && pathname.startsWith('/offertes')) {
        lines.push('Offertes (' + data.offertes.length + '):');
        lines.push('  Totale pipeline omzet: ' + euro(data.totaal_omzet));
        lines.push('  Open offertes: ' + data.open_offertes + ' | Open bedrag: ' + euro(data.open_totaal));
        (data.offertes || []).slice(0, 15).forEach(function (o) {
            var tot = calcOfferteTotaal(o);
            lines.push('  - [' + o.nummer + '] ' + o.client_naam + ' | ' + o.status + ' | ' + (o.aantal_gasten || 0) + ' gasten | ' + euro(o.basis_prijs_pp) + '/p.p. | TOTAAL: ' + euro(tot) + ' | ' + o.datum);
        });
    }

    // Facturen
    if (data.facturen && pathname && pathname.startsWith('/facturen')) {
        lines.push('Facturen (' + data.facturen.length + '):');
        lines.push('  Open: ' + data.open_facturen + ' | Open bedrag: ' + euro(data.open_totaal));
        lines.push('  Betaald totaal: ' + euro(data.betaald_totaal));
        lines.push('  Vervallen: ' + data.vervallen_facturen);
        (data.facturen || []).slice(0, 10).forEach(function (f) {
            lines.push('  - [' + f.nummer + '] ' + f.client_naam + ' | ' + f.status + ' | verval: ' + (f.vervaldatum || '—'));
        });
    }

    // Gerechten / Menu Ontwikkelaar
    if (data.gangen && pathname && pathname.startsWith('/gerechten')) {
        lines.push('Gangen: ' + (data.gangen || []).map(function (g) { return g.naam + ' (' + g.slug + ')'; }).join(', '));
        lines.push('Gerechten totaal: ' + data.totaal);
        var perGang = {};
        (data.gerechten || []).forEach(function (g) {
            if (!perGang[g.gang_slug]) perGang[g.gang_slug] = [];
            perGang[g.gang_slug].push(g.naam);
        });
        Object.keys(perGang).forEach(function (slug) {
            lines.push('  ' + slug + ': ' + perGang[slug].join(', '));
        });
    }

    // Recepten
    if (data.recepten && pathname && pathname.startsWith('/recepten')) {
        lines.push('Recepten (' + data.recepten.length + '):');
        (data.recepten || []).forEach(function (r) {
            lines.push('  - ' + r.naam + ' | ' + r.categorie + ' | ' + r.porties + ' porties | preptime: ' + r.preptime + 'min');
            if (r.ingredienten && r.ingredienten.length > 0) {
                lines.push('    Ingrediënten: ' + r.ingredienten.slice(0, 6).join(', '));
            }
        });
    }

    // Voorraad
    if (data.inventory && pathname && (pathname.startsWith('/voorraad') || pathname.startsWith('/inkoop'))) {
        lines.push('Voorraad (' + (data.inventory || []).length + ' items):');
        (data.inventory || []).forEach(function (i) {
            var status = i.hoeveelheid <= i.min_par ? ' ⚠️ LAAG' : '';
            lines.push('  - ' + i.naam + ': ' + i.hoeveelheid + ' ' + i.unit + ' (min: ' + i.min_par + ')' + status + (i.purchase_price ? ' | €' + Number(i.purchase_price).toFixed(2) : ''));
        });
        if (data.laag_count !== undefined) {
            lines.push('Lage voorraad: ' + data.laag_count + ' items');
        }
    }

    // HACCP
    if (data.haccp_logs !== undefined) {
        lines.push('Recente HACCP logs: ' + (data.haccp_logs || []).length);
        (data.haccp_logs || []).slice(0, 5).forEach(function (l) {
            lines.push('  - ' + l.product + ' | ' + l.temperatuur + '°C | ' + (l.created_at || '').slice(0, 16));
        });
        lines.push('Recente events: ' + (data.recent_events || []).map(function (e) { return e.name + ' (' + e.date + ')'; }).join(', '));
    }

    // Service
    if (data.vandaag_events !== undefined) {
        if (data.vandaag_events.length > 0) {
            lines.push('Events VANDAAG: ' + data.vandaag_events.map(function (e) { return e.name + ' | ' + e.guests + ' gasten'; }).join(', '));
        } else {
            lines.push('Geen events vandaag.');
        }
        lines.push('Gerechten in systeem: ' + (data.gerechten || []).length);
    }

    // Uren
    if (data.uren_logs !== undefined) {
        var totaalUren = (data.uren_logs || []).reduce(function (s, l) { return s + (l.uren || 0); }, 0);
        lines.push('Uren afgelopen maand: ' + totaalUren + ' uur (' + (data.uren_logs || []).length + ' registraties)');
    }

    // Materieel / Logistiek
    if (data.materieel !== undefined) {
        lines.push('Materieel items: ' + (data.materieel || []).length);
        (data.materieel || []).slice(0, 10).forEach(function (m) {
            lines.push('  - ' + m.naam + ' | ' + (m.categorie || '—') + ' | ' + (m.actief !== false ? 'beschikbaar' : 'niet beschikbaar'));
        });
    }
    if (data.komende_events !== undefined) {
        lines.push('Komende events: ' + (data.komende_events || []).map(function (e) { return e.name + ' (' + e.date + ', ' + e.guests + ' gasten)'; }).join(', '));
    }

    // Boekhouding
    if (data.kwartaal !== undefined) {
        lines.push('Huidig kwartaal: Q' + data.kwartaal + ' ' + data.jaar);
        var offerteOmzet = (data.offertes || []).reduce(function (s, o) { return s + calcOfferteTotaal(o); }, 0);
        lines.push('Totale offerte pipeline: ' + euro(offerteOmzet));
    }

    lines.push('--- EINDE LIVE DATA ---');
    return lines.join('\n');
}
