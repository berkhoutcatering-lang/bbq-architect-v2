// ─── AI Actie-definities ──────────────────────────────────────────────────────
// Elke actie beschrijft een database-operatie die de AI kan voorstellen.
// De gebruiker moet altijd bevestigen voor uitvoering.

export var ACTION_TYPES = {
    // ── Events ──────────────────────────────────────────────────────────────
    create_event: {
        label: 'Event aanmaken',
        table: 'events',
        op: 'insert',
        pages: ['/', '/events', '/agenda', '/offertes'],
        icon: 'fa-calendar-plus',
        color: '#3b82f6',
    },
    update_event: {
        label: 'Event bijwerken',
        table: 'events',
        op: 'update',
        pages: ['/events', '/agenda', '/service'],
        icon: 'fa-calendar-check',
        color: '#f59e0b',
    },
    delete_event: {
        label: 'Event verwijderen',
        table: 'events',
        op: 'delete',
        pages: ['/events'],
        icon: 'fa-calendar-xmark',
        color: '#ef4444',
    },

    // ── Recepten ─────────────────────────────────────────────────────────────
    create_recept: {
        label: 'Recept aanmaken',
        table: 'recepten',
        op: 'insert',
        pages: ['/recepten'],
        icon: 'fa-book-open',
        color: '#22c55e',
    },
    update_recept: {
        label: 'Recept bijwerken',
        table: 'recepten',
        op: 'update',
        pages: ['/recepten'],
        icon: 'fa-pen-to-square',
        color: '#f59e0b',
    },
    delete_recept: {
        label: 'Recept verwijderen',
        table: 'recepten',
        op: 'delete',
        pages: ['/recepten'],
        icon: 'fa-trash',
        color: '#ef4444',
    },

    // ── Gerechten ────────────────────────────────────────────────────────────
    create_gerecht: {
        label: 'Gerecht aanmaken',
        table: 'gerechten',
        op: 'insert',
        pages: ['/gerechten'],
        icon: 'fa-utensils',
        color: '#a78bfa',
    },
    update_gerecht: {
        label: 'Gerecht bijwerken',
        table: 'gerechten',
        op: 'update',
        pages: ['/gerechten', '/menu-engineering'],
        icon: 'fa-pen-to-square',
        color: '#f59e0b',
    },
    delete_gerecht: {
        label: 'Gerecht verwijderen',
        table: 'gerechten',
        op: 'delete',
        pages: ['/gerechten'],
        icon: 'fa-trash',
        color: '#ef4444',
    },

    // ── Voorraad ─────────────────────────────────────────────────────────────
    create_voorraad: {
        label: 'Voorraad item aanmaken',
        table: 'inventory',
        op: 'insert',
        pages: ['/voorraad', '/inkoop'],
        icon: 'fa-box-open',
        color: '#4ECDC4',
    },
    update_voorraad: {
        label: 'Voorraad bijwerken',
        table: 'inventory',
        op: 'update',
        pages: ['/voorraad', '/inkoop', '/service'],
        icon: 'fa-boxes-stacked',
        color: '#f59e0b',
    },
    delete_voorraad: {
        label: 'Voorraad item verwijderen',
        table: 'inventory',
        op: 'delete',
        pages: ['/voorraad'],
        icon: 'fa-trash',
        color: '#ef4444',
    },

    // ── Leveranciers ─────────────────────────────────────────────────────────
    create_leverancier: {
        label: 'Leverancier toevoegen',
        table: 'leveranciers',
        op: 'insert',
        pages: ['/inkoop', '/price-intelligence'],
        icon: 'fa-truck',
        color: '#3b82f6',
    },
    update_leverancier: {
        label: 'Leverancier bijwerken',
        table: 'leveranciers',
        op: 'update',
        pages: ['/inkoop'],
        icon: 'fa-pen-to-square',
        color: '#f59e0b',
    },

    // ── HACCP ────────────────────────────────────────────────────────────────
    create_haccp: {
        label: 'Temperatuurmeting registreren',
        table: 'haccp_records',
        op: 'insert',
        pages: ['/haccp', '/service'],
        icon: 'fa-temperature-half',
        color: '#ef4444',
    },

    // ── Uren ─────────────────────────────────────────────────────────────────
    create_urenlog: {
        label: 'Uren registreren',
        table: 'time_logs',
        op: 'insert',
        pages: ['/uren'],
        icon: 'fa-clock',
        color: '#a78bfa',
    },
    update_urenlog: {
        label: 'Urenregistratie bijwerken',
        table: 'time_logs',
        op: 'update',
        pages: ['/uren'],
        icon: 'fa-pen-to-square',
        color: '#f59e0b',
    },
    delete_urenlog: {
        label: 'Urenregistratie verwijderen',
        table: 'time_logs',
        op: 'delete',
        pages: ['/uren'],
        icon: 'fa-trash',
        color: '#ef4444',
    },

    // ── Inkooplijsten ────────────────────────────────────────────────────────
    create_inkooplijst: {
        label: 'Inkooplijst aanmaken',
        table: 'inkooplijsten',
        op: 'insert',
        pages: ['/inkoop'],
        icon: 'fa-basket-shopping',
        color: '#22c55e',
    },
    update_inkooplijst: {
        label: 'Inkooplijst bijwerken',
        table: 'inkooplijsten',
        op: 'update',
        pages: ['/inkoop'],
        icon: 'fa-pen-to-square',
        color: '#f59e0b',
    },

    // ── Logistiek RTR ────────────────────────────────────────────────────────
    update_rtr_item: {
        label: 'Bus-check item bijwerken',
        table: 'rtr_items',
        op: 'update',
        pages: ['/logistiek', '/service'],
        icon: 'fa-truck-ramp-box',
        color: '#f59e0b',
    },

    // ── Materieel ────────────────────────────────────────────────────────────
    create_materieel: {
        label: 'Materieel toevoegen',
        table: 'materieel',
        op: 'insert',
        pages: ['/materieel', '/logistiek'],
        icon: 'fa-wrench',
        color: '#4ECDC4',
    },
    update_materieel: {
        label: 'Materieel bijwerken',
        table: 'materieel',
        op: 'update',
        pages: ['/materieel'],
        icon: 'fa-pen-to-square',
        color: '#f59e0b',
    },

    // ── Prep-taken ───────────────────────────────────────────────────────────
    create_prep_task: {
        label: 'Prep-taak aanmaken',
        table: 'prep_tasks',
        op: 'insert',
        pages: ['/agenda', '/events', '/service'],
        icon: 'fa-list-check',
        color: '#22c55e',
    },
    update_prep_task: {
        label: 'Prep-taak bijwerken',
        table: 'prep_tasks',
        op: 'update',
        pages: ['/agenda', '/service'],
        icon: 'fa-pen-to-square',
        color: '#f59e0b',
    },
    delete_prep_task: {
        label: 'Prep-taak verwijderen',
        table: 'prep_tasks',
        op: 'delete',
        pages: ['/agenda'],
        icon: 'fa-trash',
        color: '#ef4444',
    },

    // ── Offertes ─────────────────────────────────────────────────────────────
    create_offerte: {
        label: 'Offerte aanmaken',
        table: 'offertes',
        op: 'insert',
        pages: ['/offertes'],
        icon: 'fa-file-invoice',
        color: '#22c55e',
    },
    update_offerte: {
        label: 'Offerte bijwerken',
        table: 'offertes',
        op: 'update',
        pages: ['/offertes'],
        icon: 'fa-pen-to-square',
        color: '#3b82f6',
    },
    update_offerte_status: {
        label: 'Offerte status bijwerken',
        table: 'offertes',
        op: 'update',
        pages: ['/offertes'],
        icon: 'fa-file-invoice',
        color: '#f59e0b',
    },

    // ── Facturen ─────────────────────────────────────────────────────────────
    create_factuur: {
        label: 'Factuur aanmaken',
        table: 'facturen',
        op: 'insert',
        pages: ['/facturen'],
        icon: 'fa-receipt',
        color: '#22c55e',
    },
    update_factuur: {
        label: 'Factuur bijwerken',
        table: 'facturen',
        op: 'update',
        pages: ['/facturen'],
        icon: 'fa-pen-to-square',
        color: '#3b82f6',
    },
    update_factuur_status: {
        label: 'Factuur status bijwerken',
        table: 'facturen',
        op: 'update',
        pages: ['/facturen'],
        icon: 'fa-receipt',
        color: '#f59e0b',
    },

    // ── AI Gesprekken ────────────────────────────────────────────────────────
    save_conversation: {
        label: 'Gesprek opslaan',
        table: 'ai_conversations',
        op: 'insert',
        pages: ['/ai-chat'],
        icon: 'fa-floppy-disk',
        color: '#FFBF00',
    },
    create_folder: {
        label: 'Gespreksmap aanmaken',
        table: 'ai_conversation_folders',
        op: 'insert',
        pages: ['/ai-chat'],
        icon: 'fa-folder-plus',
        color: '#FFBF00',
    },

    // ── System Operator Tools ────────────────────────────────────────────────
    generate_prep_list: {
        label: 'Prep-lijst genereren',
        table: null,
        op: 'tool',
        pages: ['/', '/events', '/agenda', '/service'],
        icon: 'fa-list-check',
        color: '#22c55e',
        tool: 'generatePrepList',
    },
    bulk_create_gerechten: {
        label: 'Gerechten toevoegen aan Menu Ontwikkelaar',
        table: 'gerechten',
        op: 'bulk_insert',
        pages: ['/', '/gerechten', '/menu-engineering', '/ai-chat'],
        icon: 'fa-utensils',
        color: '#a78bfa',
        tool: 'bulkCreateGerechten',
    },
    filter_gerechten: {
        label: 'Gerechten verwijderen/verbergen',
        table: 'gerechten',
        op: 'bulk_delete',
        pages: ['/gerechten', '/menu-engineering', '/ai-chat'],
        icon: 'fa-filter',
        color: '#ef4444',
        tool: 'filterGerechten',
    },
    mark_weak_dishes: {
        label: 'Zwakke gerechten markeren',
        table: null,
        op: 'client_only',
        pages: ['/', '/gerechten', '/menu-engineering', '/ai-chat'],
        icon: 'fa-star-half-stroke',
        color: '#f59e0b',
    },
};

// ─── Geef beschikbare acties terug voor een pagina ────────────────────────────
export function getActionsForPage(pathname) {
    return Object.entries(ACTION_TYPES)
        .filter(function (entry) { return entry[1].pages.includes(pathname); })
        .map(function (entry) { return { key: entry[0], ...entry[1] }; });
}

// ─── Geef actie-instructies voor systeem-prompt ───────────────────────────────
export function getActionInstructions(pathname) {
    var actions = getActionsForPage(pathname);
    if (actions.length === 0) return '';

    var actionList = actions.map(function (a) {
        return '- ' + a.key + ': ' + a.label;
    }).join('\n');

    return [
        '',
        '## Acties die jij kunt voorstellen',
        'Wanneer de gebruiker expliciet vraagt om iets aan te maken, bij te werken of te verwijderen,',
        'kun je een actieblok opnemen in je antwoord. ALLEEN bij expliciete verzoeken, NOOIT automatisch.',
        '',
        'Formaat (exact overnemen, inclusief <<<>>>):',
        '<<<ACTION:{"type":"ACTION_TYPE","description":"Mensleesbare omschrijving van wat er gaat gebeuren","data":{...velden...}}>>>',
        '',
        'Beschikbare actietypes voor deze pagina:',
        actionList,
        '',
        'Regels:',
        '- Vraag ALTIJD eerst bevestiging via het actieblok — de gebruiker keurt goed of wijst af',
        '- Zet het actieblok ONDER je antwoordtekst',
        '- Gebruik exacte veldnamen uit de database',
        '- Vul alleen velden in die je zeker weet van de gebruiker',
        '- Gebruik geen acties voor informatie-vragen, enkel voor daadwerkelijke wijzigingen',
    ].join('\n');
}

// ─── Parseer actieblokken uit AI-responstekst ─────────────────────────────────
export function parseActions(text) {
    if (!text) return { cleanText: '', actions: [] };
    var actions = [];
    var pattern = /<<<ACTION:([\s\S]*?)>>>/g;
    var match;

    while ((match = pattern.exec(text)) !== null) {
        try {
            var parsed = JSON.parse(match[1]);
            if (parsed.type && ACTION_TYPES[parsed.type]) {
                actions.push({
                    id: Math.random().toString(36).slice(2, 8),
                    type: parsed.type,
                    description: parsed.description || ACTION_TYPES[parsed.type].label,
                    data: parsed.data || {},
                    meta: ACTION_TYPES[parsed.type],
                    status: 'pending', // 'pending' | 'approved' | 'rejected' | 'done' | 'error'
                });
            }
        } catch (e) {
            console.warn('[AI Actions] Kon actieblok niet parsen:', match[1]);
        }
    }

    var cleanText = text.replace(/<<<ACTION:[\s\S]*?>>>/g, '').trim();
    return { cleanText, actions };
}

// ─── Voer een actie uit via Supabase ─────────────────────────────────────────
export async function executeAction(action, supabase) {
    if (!supabase) throw new Error('Geen database-verbinding');
    var { type, data } = action;
    var def = ACTION_TYPES[type];
    if (!def) throw new Error('Onbekend actietype: ' + type);

    if (def.op === 'tool' || def.op === 'bulk_insert' || def.op === 'bulk_delete' || def.op === 'client_only') {
        throw new Error('Actie "' + type + '" wordt afgehandeld via speciale handler, niet via executeAction');
    }

    var result;

    if (def.op === 'insert') {
        var res = await supabase.from(def.table).insert(data).select().single();
        if (res.error) throw res.error;
        result = res.data;
    } else if (def.op === 'update') {
        if (!data.id) throw new Error('ID ontbreekt voor update-actie');
        var updateData = Object.assign({}, data);
        delete updateData.id;
        var res2 = await supabase.from(def.table).update(updateData).eq('id', data.id).select().single();
        if (res2.error) throw res2.error;
        result = res2.data;
    } else if (def.op === 'delete') {
        if (!data.id) throw new Error('ID ontbreekt voor delete-actie');
        var res3 = await supabase.from(def.table).delete().eq('id', data.id);
        if (res3.error) throw res3.error;
        result = { deleted: true, id: data.id };
    }

    return result;
}

// ─── Laad pagina-context data uit Supabase ────────────────────────────────────
export async function loadPageContextData(pathname, supabase) {
    if (!supabase) return null;

    try {
        var ctx = {};

        if (pathname === '/' || pathname === '/dashboard') {
            var evs = await supabase.from('events').select('id,name,date,guests,status,location,ppp').order('date', { ascending: true }).limit(10);
            ctx.events = evs.data || [];
            var invAll = await supabase.from('inventory').select('id,naam,current_stock,min_stock,unit');
            ctx.lowStock = (invAll.data || []).filter(function (i) { return i.current_stock <= i.min_stock; }).slice(0, 10);
            var dashOffRes = await supabase.from('offertes').select('id,nummer,status,client_naam,aantal_gasten,basis_prijs_pp,korting,items,datum').order('datum', { ascending: false }).limit(20);
            ctx.offertes = dashOffRes.data || [];
        }

        if (pathname === '/events') {
            var evRes = await supabase.from('events').select('*').order('date', { ascending: true });
            ctx.events = evRes.data || [];
        }

        if (pathname === '/recepten') {
            var recRes = await supabase.from('recepten').select('id,naam,categorie,porties,preptime').order('naam');
            ctx.recepten = recRes.data || [];
        }

        if (pathname === '/gerechten') {
            var gerRes = await supabase.from('gerechten').select('id,naam,gang_slug,actief').order('volgorde');
            var gangRes = await supabase.from('gangen').select('id,naam,slug,volgorde,actief').order('volgorde');
            ctx.gerechten = gerRes.data || [];
            ctx.gangen = gangRes.data || [];
        }

        if (pathname === '/menu-engineering') {
            var gerRes2 = await supabase.from('gerechten').select('id,naam,gang_slug,ingredient_costs').order('naam');
            ctx.gerechten = gerRes2.data || [];
        }

        if (pathname === '/offertes') {
            var offRes = await supabase.from('offertes').select('id,nummer,status,client_naam,datum,geldig_tot,aantal_gasten,basis_prijs_pp,korting,vaste_kosten,items').order('datum', { ascending: false }).limit(30);
            ctx.offertes = offRes.data || [];
            // Verloopwaarschuwingen: offertes waarvan geldig_tot binnen 7 dagen verloopt of al verlopen is
            var nu = new Date();
            var over7dagen = new Date(nu.getTime() + 7 * 24 * 60 * 60 * 1000);
            ctx.verloopAlerts = (offRes.data || []).filter(function (o) {
                if (!o.geldig_tot || o.status === 'goedgekeurd' || o.status === 'betaald' || o.status === 'afgewezen') return false;
                var geldigTot = new Date(o.geldig_tot);
                return geldigTot <= over7dagen;
            });
        }

        if (pathname === '/facturen') {
            var facRes = await supabase.from('facturen').select('id,nummer,status,client_naam,datum,vervaldatum,items').order('datum', { ascending: false }).limit(30);
            ctx.facturen = facRes.data || [];
            // Vervaldatum-waarschuwingen: facturen die verlopen zijn of binnen 7 dagen vervallen (niet betaald)
            var nu2 = new Date();
            var over7d = new Date(nu2.getTime() + 7 * 24 * 60 * 60 * 1000);
            ctx.vervalAlerts = (facRes.data || []).filter(function (f) {
                if (!f.vervaldatum || f.status === 'betaald') return false;
                var vd = new Date(f.vervaldatum);
                return vd <= over7d;
            });
        }

        if (pathname === '/voorraad') {
            var vRes = await supabase.from('inventory').select('*').order('naam');
            ctx.inventory = vRes.data || [];
            ctx.lowStock = (vRes.data || []).filter(function (i) { return i.current_stock <= i.min_stock; });
            // Laad aankomende events zodat AI inkooplijst kan genereren zonder te vragen
            var vEvRes = await supabase.from('events').select('id,name,date,aantal_personen,status,menu_items').in('status', ['concept', 'bevestigd', 'actief']).gte('date', new Date().toISOString().split('T')[0]).order('date', { ascending: true }).limit(5);
            ctx.events = vEvRes.data || [];
            ctx.volgendEvent = (vEvRes.data || [])[0] || null;
        }

        if (pathname === '/inkoop') {
            var levRes = await supabase.from('leveranciers').select('*').order('naam');
            var inkRes = await supabase.from('inkooplijsten').select('id,event_id,items').order('id', { ascending: false }).limit(5);
            ctx.leveranciers = levRes.data || [];
            ctx.inkooplijsten = inkRes.data || [];
        }

        if (pathname === '/haccp') {
            var hacRes = await supabase.from('haccp_records').select('*').order('datum', { ascending: false }).limit(30);
            ctx.haccp_records = hacRes.data || [];
            // Haal ook aankomende events op zodat AI kan zien welke events nog geen HACCP-registratie hebben
            var hacEvRes = await supabase.from('events').select('id,name,date,status').in('status', ['bevestigd', 'actief']).order('date', { ascending: true }).limit(10);
            ctx.events = hacEvRes.data || [];
        }

        if (pathname === '/uren') {
            var urenRes = await supabase.from('time_logs').select('*').order('start_time', { ascending: false }).limit(50);
            ctx.time_logs = urenRes.data || [];
            // Weekoverzicht: bereken totaal uren per medewerker voor de afgelopen 7 dagen
            var weekGeleden = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            var weekLogs = (urenRes.data || []).filter(function (t) { return t.start_time >= weekGeleden; });
            var medewerkerUren = {};
            weekLogs.forEach(function (t) {
                var naam = t.medewerker || 'Onbekend';
                if (!medewerkerUren[naam]) medewerkerUren[naam] = 0;
                if (t.start_time && t.end_time) {
                    var uren = (new Date(t.end_time) - new Date(t.start_time)) / 3600000;
                    medewerkerUren[naam] += Math.max(0, uren);
                }
            });
            ctx.weekoverzicht = medewerkerUren;
        }

        if (pathname === '/materieel') {
            var matRes = await supabase.from('materieel').select('*').order('naam');
            ctx.materieel = matRes.data || [];
            // Onderhoudswaarschuwingen: items waarvan last_maintenance > 90 dagen geleden of ontbreekt
            var grens = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            ctx.onderhoudsAlerts = (matRes.data || []).filter(function (m) {
                return !m.last_maintenance || m.last_maintenance < grens;
            });
        }

        if (pathname === '/logistiek') {
            var rtrRes = await supabase.from('rtr_items').select('*').order('id');
            var plRes = await supabase.from('pack_lists').select('id,event_id').order('id', { ascending: false }).limit(5);
            ctx.rtr_items = rtrRes.data || [];
            ctx.pack_lists = plRes.data || [];
        }

        if (pathname === '/agenda') {
            var agEvRes = await supabase.from('events').select('id,name,date,status').order('date', { ascending: true }).limit(10);
            var ptRes = await supabase.from('prep_tasks').select('*').order('id', { ascending: false }).limit(20);
            ctx.events = agEvRes.data || [];
            ctx.prep_tasks = ptRes.data || [];
        }

        if (pathname === '/service') {
            var svcEvRes = await supabase.from('events').select('id,name,date,status,guests').eq('status', 'actief');
            ctx.active_events = svcEvRes.data || [];
            // Haal prep-taken op voor actieve events
            var activeIds = (svcEvRes.data || []).map(function (e) { return e.id; });
            if (activeIds.length > 0) {
                var svcPtRes = await supabase.from('prep_tasks').select('*').in('event_id', activeIds).order('id');
                ctx.prep_tasks = svcPtRes.data || [];
            }
            // HACCP van vandaag
            var vandaag = new Date().toISOString().slice(0, 10);
            var svcHacRes = await supabase.from('haccp_records').select('*').eq('datum', vandaag).order('tijd');
            ctx.haccp_vandaag = svcHacRes.data || [];
        }

        if (pathname === '/boekhouding') {
            var offBRes = await supabase.from('offertes').select('id,nummer,status,client_naam,basis_prijs_pp,aantal_gasten,korting,items,datum').order('datum', { ascending: false }).limit(50);
            var facBRes = await supabase.from('facturen').select('id,nummer,status,client_naam,datum,vervaldatum,items').order('datum', { ascending: false }).limit(50);
            ctx.offertes = offBRes.data || [];
            ctx.facturen = facBRes.data || [];
            // Bereken KPIs
            var totaalOmzet = 0, totaalBetaald = 0, totaalOpenstaand = 0, totaalVerlopen = 0;
            (facBRes.data || []).forEach(function (f) {
                var t = calcFactuurTotaal(f);
                totaalOmzet += t.totaal;
                if (f.status === 'betaald') totaalBetaald += t.totaal;
                if (f.status === 'verzonden') totaalOpenstaand += t.totaal;
                if (f.status === 'verlopen') totaalVerlopen += t.totaal;
            });
            ctx.boekhoudingKPIs = { totaalOmzet: totaalOmzet, totaalBetaald: totaalBetaald, totaalOpenstaand: totaalOpenstaand, totaalVerlopen: totaalVerlopen };
        }

        if (pathname === '/financien') {
            var offFinRes = await supabase.from('offertes').select('id,status,datum,basis_prijs_pp,aantal_gasten,items,vaste_kosten,menu_selectie').order('datum', { ascending: false }).limit(100);
            var urenFinRes = await supabase.from('time_logs').select('id,datum,uren,medewerker').order('datum', { ascending: false }).limit(200);
            ctx.offertes = offFinRes.data || [];
            ctx.urenLogs = urenFinRes.data || [];
            // Bereken maandsamenvatting huidig jaar
            var jaar = new Date().getFullYear();
            var maanden = {};
            for (var m = 1; m <= 12; m++) {
                var mStr = String(m).padStart(2, '0');
                maanden[mStr] = { maand: new Date(jaar, m - 1, 1).toLocaleString('nl-NL', { month: 'long' }), omzet: 0, offertes: 0, uren: 0 };
            }
            (offFinRes.data || []).filter(function (o) {
                return ['goedgekeurd', 'geaccepteerd', 'voltooid'].includes(o.status || '') && (o.datum || '').startsWith(String(jaar));
            }).forEach(function (o) {
                var mStr = (o.datum || '').split('-')[1];
                if (!maanden[mStr]) return;
                maanden[mStr].omzet += ((o.aantal_gasten || 0) * (o.basis_prijs_pp || 0));
                maanden[mStr].offertes += 1;
            });
            (urenFinRes.data || []).filter(function (u) { return (u.datum || '').startsWith(String(jaar)); }).forEach(function (u) {
                var mStr = (u.datum || '').split('-')[1];
                if (!maanden[mStr]) return;
                maanden[mStr].uren += (u.uren || 0);
            });
            ctx.financienMaanden = maanden;
            ctx.financienJaar = jaar;
        }

        if (pathname === '/price-intelligence') {
            var levPiRes = await supabase.from('leveranciers').select('id,naam,type').order('naam');
            ctx.leveranciers = levPiRes.data || [];
        }

        return Object.keys(ctx).length > 0 ? ctx : null;
    } catch (e) {
        console.warn('[AI Context] Fout bij laden context data:', e.message);
        return null;
    }
}

// ─── Hulpfuncties voor financiële berekeningen ───────────────────────────────
function fmtEur(n) {
    if (!n || isNaN(n)) return '€0,00';
    return '€' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcOfferteTotaal(o) {
    var korting = parseFloat(o.korting) || 0;
    // Als er regelitems zijn, bereken via items (meest accuraat)
    if (o.items && Array.isArray(o.items) && o.items.length > 0) {
        var subtotaal = 0;
        var btw = 0;
        o.items.forEach(function (item) {
            var line = (parseFloat(item.qty) || 0) * (parseFloat(item.prijs) || 0);
            subtotaal += line;
            btw += line * ((parseFloat(item.btw) || 0) / 100);
        });
        return { subtotaal: subtotaal, btw: btw, totaal: subtotaal + btw - korting, exBtw: subtotaal - korting };
    }
    // Fallback: gasten * prijs pp
    var omzet = (parseFloat(o.aantal_gasten) || 0) * (parseFloat(o.basis_prijs_pp) || 0);
    return { subtotaal: omzet, btw: 0, totaal: omzet - korting, exBtw: omzet - korting };
}

function calcFactuurTotaal(f) {
    if (f.items && Array.isArray(f.items) && f.items.length > 0) {
        var subtotaal = 0;
        var btw = 0;
        f.items.forEach(function (item) {
            var line = (parseFloat(item.qty) || 0) * (parseFloat(item.prijs) || 0);
            subtotaal += line;
            btw += line * ((parseFloat(item.btw) || 0) / 100);
        });
        return { subtotaal: subtotaal, btw: btw, totaal: subtotaal + btw };
    }
    return { subtotaal: 0, btw: 0, totaal: 0 };
}

// ─── Formatteer context data als tekst voor systeem-prompt ───────────────────
export function formatContextForPrompt(contextData) {
    if (!contextData) return '';
    var lines = ['\n## Huidige pagina data (live uit de database)\n'];

    if (contextData.events && contextData.events.length > 0) {
        lines.push('**Events (' + contextData.events.length + '):**');
        contextData.events.slice(0, 10).forEach(function (e) {
            var omzetStr = (e.ppp && e.guests) ? ' | omzet: ' + fmtEur(e.ppp * e.guests) + ' (' + fmtEur(e.ppp) + '/p.p.)' : (e.ppp ? ' | ' + fmtEur(e.ppp) + '/p.p.' : '');
            lines.push('- [' + e.id + '] ' + (e.name || '?') + ' | ' + (e.date || '?') + ' | ' + (e.guests || 0) + ' gasten | status: ' + (e.status || '?') + omzetStr + (e.location ? ' | ' + e.location : ''));
        });
        lines.push('');
    }
    if (contextData.active_events && contextData.active_events.length > 0) {
        lines.push('**Actieve events:**');
        contextData.active_events.forEach(function (e) {
            var omzetStr = (e.ppp && e.guests) ? ' | omzet: ' + fmtEur(e.ppp * e.guests) : '';
            lines.push('- [' + e.id + '] ' + (e.name || '?') + ' | ' + (e.date || '?') + ' | ' + (e.guests || 0) + ' gasten' + omzetStr);
        });
        lines.push('');
    }
    if (contextData.recepten && contextData.recepten.length > 0) {
        lines.push('**Recepten (' + contextData.recepten.length + '):**');
        contextData.recepten.slice(0, 10).forEach(function (r) {
            lines.push('- [' + r.id + '] ' + r.naam + ' | ' + (r.categorie || '?') + ' | ' + (r.porties || '?') + ' porties');
        });
        lines.push('');
    }
    if (contextData.gerechten && contextData.gerechten.length > 0) {
        lines.push('**Gerechten (' + contextData.gerechten.length + '):**');
        contextData.gerechten.slice(0, 10).forEach(function (g) {
            lines.push('- [' + g.id + '] ' + g.naam + ' | gang: ' + (g.gang_slug || '?') + ' | actief: ' + (g.actief ? 'ja' : 'nee'));
        });
        lines.push('');
    }
    if (contextData.gangen && contextData.gangen.length > 0) {
        lines.push('**Gangen:** ' + contextData.gangen.map(function (g) { return g.naam + ' (' + g.slug + ')'; }).join(', '));
        lines.push('');
    }
    if (contextData.offertes && contextData.offertes.length > 0) {
        // Bereken totalen per status
        var offTotaalOpen = 0, offTotaalBetaald = 0, offTotaalAlles = 0;
        contextData.offertes.forEach(function (o) {
            var t = calcOfferteTotaal(o);
            offTotaalAlles += t.totaal;
            if (o.status === 'betaald' || o.status === 'goedgekeurd') offTotaalBetaald += t.totaal;
            if (o.status === 'concept' || o.status === 'verzonden') offTotaalOpen += t.totaal;
        });

        lines.push('**Offertes (' + contextData.offertes.length + ') — Totaal omzet: ' + fmtEur(offTotaalAlles) + ' | Open: ' + fmtEur(offTotaalOpen) + ' | Betaald/goedgekeurd: ' + fmtEur(offTotaalBetaald) + '**');
        contextData.offertes.slice(0, 15).forEach(function (o) {
            var t = calcOfferteTotaal(o);
            var pppInfo = o.basis_prijs_pp ? ' | ' + fmtEur(o.basis_prijs_pp) + '/p.p.' : '';
            var kortingInfo = (parseFloat(o.korting) > 0) ? ' | korting: ' + fmtEur(o.korting) : '';
            lines.push('- [' + o.id + '] ' + (o.nummer || '?') + ' | ' + (o.client_naam || '?') + ' | ' + (o.status || '?') + ' | ' + (o.aantal_gasten || 0) + ' gasten' + pppInfo + kortingInfo + ' | TOTAAL: ' + fmtEur(t.totaal));
        });
        lines.push('');
    }
    if (contextData.facturen && contextData.facturen.length > 0) {
        // Bereken totalen
        var facTotaalOpen = 0, facTotaalBetaald = 0, facTotaalAlles = 0;
        contextData.facturen.forEach(function (f) {
            var t = calcFactuurTotaal(f);
            facTotaalAlles += t.totaal;
            if (f.status === 'betaald') facTotaalBetaald += t.totaal;
            if (f.status === 'verzonden' || f.status === 'verlopen') facTotaalOpen += t.totaal;
        });

        lines.push('**Facturen (' + contextData.facturen.length + ') — Totaal: ' + fmtEur(facTotaalAlles) + ' | Openstaand: ' + fmtEur(facTotaalOpen) + ' | Betaald: ' + fmtEur(facTotaalBetaald) + '**');
        contextData.facturen.slice(0, 15).forEach(function (f) {
            var t = calcFactuurTotaal(f);
            var totaalStr = t.totaal > 0 ? ' | TOTAAL: ' + fmtEur(t.totaal) : '';
            var vervalStr = f.vervaldatum ? ' | vervalt: ' + f.vervaldatum : '';
            lines.push('- [' + f.id + '] ' + (f.nummer || '?') + ' | ' + (f.client_naam || '?') + ' | ' + (f.status || '?') + vervalStr + totaalStr);
        });
        lines.push('');
    }
    if (contextData.inventory && contextData.inventory.length > 0) {
        lines.push('**Voorraad (' + contextData.inventory.length + ' items):**');
        contextData.inventory.slice(0, 10).forEach(function (i) {
            var alert = i.current_stock <= i.min_stock ? ' ⚠️ LAAG' : '';
            lines.push('- [' + i.id + '] ' + i.naam + ' | ' + i.current_stock + ' ' + (i.unit || '') + ' (min: ' + i.min_stock + ')' + alert);
        });
        lines.push('');
    }
    if (contextData.volgendEvent) {
        var ev = contextData.volgendEvent;
        lines.push('**Volgend event (gebruik dit bij inkoop-vragen):**');
        lines.push('- ID: ' + ev.id + ' | ' + (ev.name || '?') + ' | ' + (ev.date || '?') + ' | ' + (ev.aantal_personen || '?') + ' personen | status: ' + (ev.status || '?'));
        lines.push('');
    }
    if (contextData.lowStock && contextData.lowStock.length > 0) {
        lines.push('**⚠️ Lage voorraad (' + contextData.lowStock.length + ' items):**');
        contextData.lowStock.forEach(function (i) {
            lines.push('- ' + i.naam + ': ' + i.current_stock + '/' + i.min_stock + ' ' + (i.unit || ''));
        });
        lines.push('');
    }
    if (contextData.vervalAlerts && contextData.vervalAlerts.length > 0) {
        lines.push('**⚠️ Facturen die binnenkort vervallen of al verlopen zijn (' + contextData.vervalAlerts.length + '):**');
        contextData.vervalAlerts.forEach(function (f) {
            var t = calcFactuurTotaal(f);
            lines.push('- [' + f.id + '] ' + (f.nummer || '?') + ' | ' + (f.client_naam || '?') + ' | vervalt: ' + (f.vervaldatum || '?') + ' | status: ' + (f.status || '?') + ' | TOTAAL: ' + fmtEur(t.totaal));
        });
        lines.push('');
    }
    if (contextData.verloopAlerts && contextData.verloopAlerts.length > 0) {
        lines.push('**⚠️ Offertes die binnenkort verlopen of al verlopen zijn (' + contextData.verloopAlerts.length + '):**');
        contextData.verloopAlerts.forEach(function (o) {
            var t = calcOfferteTotaal(o);
            lines.push('- [' + o.id + '] ' + (o.nummer || '?') + ' | ' + (o.client_naam || '?') + ' | geldig t/m: ' + (o.geldig_tot || '?') + ' | status: ' + (o.status || '?') + ' | TOTAAL: ' + fmtEur(t.totaal));
        });
        lines.push('');
    }
    if (contextData.leveranciers && contextData.leveranciers.length > 0) {
        lines.push('**Leveranciers (' + contextData.leveranciers.length + '):** ' + contextData.leveranciers.slice(0, 8).map(function (l) { return l.naam; }).join(', '));
        lines.push('');
    }
    if (contextData.haccp_records && contextData.haccp_records.length > 0) {
        lines.push('**HACCP records (' + contextData.haccp_records.length + ' recent):**');
        contextData.haccp_records.slice(0, 5).forEach(function (h) {
            lines.push('- ' + (h.datum || '?') + ' ' + (h.tijd || '') + ' | ' + (h.wat || '?') + ' | ' + (h.temp || '?') + '°C | ' + (h.status || '?'));
        });
        lines.push('');
    }
    if (contextData.time_logs && contextData.time_logs.length > 0) {
        lines.push('**Urenregistraties (' + contextData.time_logs.length + ' recent):**');
        contextData.time_logs.slice(0, 5).forEach(function (t) {
            lines.push('- [' + t.id + '] ' + (t.start_time || '?') + ' → ' + (t.end_time || 'lopend') + ' | ' + (t.status || '?'));
        });
        lines.push('');
    }
    if (contextData.materieel && contextData.materieel.length > 0) {
        lines.push('**Materieel (' + contextData.materieel.length + '):**');
        contextData.materieel.slice(0, 8).forEach(function (m) {
            lines.push('- [' + m.id + '] ' + m.naam + ' | type: ' + (m.type || '?') + ' | status: ' + (m.status || '?'));
        });
        lines.push('');
    }
    if (contextData.prep_tasks && contextData.prep_tasks.length > 0) {
        lines.push('**Prep-taken (' + contextData.prep_tasks.length + '):**');
        contextData.prep_tasks.slice(0, 6).forEach(function (p) {
            lines.push('- [' + p.id + '] Event ' + (p.event_id || '?') + ': ' + (p.text || '?') + ' | ' + (p.done ? '✓ klaar' : 'open') + ' | ' + (p.dagen || '?') + ' dagen voor');
        });
        lines.push('');
    }
    if (contextData.rtr_items && contextData.rtr_items.length > 0) {
        lines.push('**Bus RTR-items (' + contextData.rtr_items.length + '):** ' + contextData.rtr_items.filter(function (r) { return r.done; }).length + '/' + contextData.rtr_items.length + ' afgevinkt');
        lines.push('');
    }
    if (contextData.haccp_vandaag && contextData.haccp_vandaag.length > 0) {
        lines.push('**HACCP registraties vandaag (' + contextData.haccp_vandaag.length + '):**');
        contextData.haccp_vandaag.forEach(function (h) {
            lines.push('- ' + (h.tijd || '?') + ' | ' + (h.wat || '?') + ' | ' + (h.temp || '?') + '°C | ' + (h.status || '?'));
        });
        lines.push('');
    }
    if (contextData.weekoverzicht && Object.keys(contextData.weekoverzicht).length > 0) {
        lines.push('**Uren deze week per medewerker:**');
        Object.entries(contextData.weekoverzicht).forEach(function (entry) {
            lines.push('- ' + entry[0] + ': ' + entry[1].toFixed(1) + 'u');
        });
        lines.push('');
    }
    if (contextData.onderhoudsAlerts && contextData.onderhoudsAlerts.length > 0) {
        lines.push('**⚠️ Materieel dat onderhoud nodig heeft (' + contextData.onderhoudsAlerts.length + '):**');
        contextData.onderhoudsAlerts.forEach(function (m) {
            lines.push('- [' + m.id + '] ' + m.naam + ' | laatste onderhoud: ' + (m.last_maintenance || 'onbekend') + ' | status: ' + (m.status || '?'));
        });
        lines.push('');
    }
    if (contextData.boekhoudingKPIs) {
        var kpi = contextData.boekhoudingKPIs;
        lines.push('**Boekhouding KPIs:**');
        lines.push('- Totale omzet (facturen): ' + fmtEur(kpi.totaalOmzet));
        lines.push('- Betaald: ' + fmtEur(kpi.totaalBetaald));
        lines.push('- Openstaand: ' + fmtEur(kpi.totaalOpenstaand));
        lines.push('- Verlopen (niet betaald): ' + fmtEur(kpi.totaalVerlopen));
        lines.push('');
    }
    if (contextData.financienMaanden) {
        lines.push('**Financiën ' + contextData.financienJaar + ' — maandoverzicht:**');
        Object.values(contextData.financienMaanden).forEach(function (m) {
            if (m.omzet > 0 || m.uren > 0) {
                var arbeidskosten = m.uren * 35;
                var netto = m.omzet - arbeidskosten;
                lines.push('- ' + m.maand + ': omzet ' + fmtEur(m.omzet) + ' | ' + m.offertes + ' events | ' + m.uren + 'u arbeid (' + fmtEur(arbeidskosten) + ') | netto ~' + fmtEur(netto));
            }
        });
        lines.push('');
    }
    if (contextData.folders && contextData.folders.length > 0) {
        lines.push('**Gespreksmappen:**');
        contextData.folders.forEach(function (f) {
            lines.push('- [' + f.id + '] ' + f.naam + ' (' + (f.gesprekken || 0) + ' gesprekken)');
        });
        lines.push('');
    }

    return lines.join('\n');
}
