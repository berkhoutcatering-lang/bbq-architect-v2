// Elke actie beschrijft een database-operatie die de AI kan voorstellen.
// De gebruiker moet altijd bevestigen voor uitvoering.
import { normalizeIngredienten, normalizeBereidingswijze } from './utils';

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
    getUpcomingEvents: {
        label: 'Aankomende events ophalen',
        table: 'events',
        op: 'select',
        pages: ['/agenda', '/events'],
        icon: 'fa-calendar-days',
        color: '#3b82f6', // Blauw
    },
    get_weather_forecast: {
        label: 'Weersvoorspelling Checken',
        table: 'weer',
        op: 'select',
        pages: ['/agenda', '/events', '/ai-chat'],
        icon: 'fa-cloud-sun-rain',
        color: '#0ea5e9', // Luchtblauw
    },
    analyzeMenuBalance: {
        label: 'Menu Balans Analyseren',
        table: 'gerechten',
        op: 'select',
        pages: ['/menu-engineering', '/ai-chat'],
        icon: 'fa-scale-balanced',
        color: '#a855f7', // Purper
    },
    engineer_menu_profitability: {
        label: 'Winstoptimalisatie Toepassen (Plowhorses)',
        table: 'gerechten', // Optioneel updates direct op recepten/gerechten
        op: 'update',
        pages: ['/menu-engineering', '/recepten', '/ai-chat'],
        icon: 'fa-money-bill-trend-up',
        color: '#8b5cf6', // Violet for Genius Actions
    },
    plan_event_full: {
        label: 'Event End-to-End Inplannen',
        table: 'events',
        op: 'insert',
        pages: ['/agenda', '/events', '/ai-chat'],
        icon: 'fa-calendar-check',
        color: '#8b5cf6', // Violet for Genius Actions
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
        pages: ['/gerechten', '/menu-engineering'],
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
        label: 'Voorraad item bijwerken',
        table: 'inventory',
        op: 'update',
        pages: ['/voorraad'],
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
    process_receipt: {
        label: 'Bonnetje Verwerken & Voorraad Updaten',
        table: 'inventory',
        op: 'insert', // Aangepaste backend logic neemt dit over
        pages: ['/ai-chat', '/inkoop', '/voorraad'],
        icon: 'fa-receipt',
        color: '#8b5cf6', // Violet
    },
    optimize_shopping_list: {
        label: 'Boodschappenlijst Genereren (Netto Inkoop)',
        table: 'inkooplijsten',
        op: 'insert',
        pages: ['/inkoop', '/ai-chat', '/events'],
        icon: 'fa-cart-shopping',
        color: '#8b5cf6', // Violet for Genius Actions
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
    predict_staff_needs: {
        label: 'Formatie Voorspellen (AI Staff Planner)',
        table: 'personeels_planning',
        op: 'insert',
        pages: ['/uren', '/events', '/ai-chat'],
        icon: 'fa-users-gear',
        color: '#8b5cf6', // Violet
    },
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
        color: '#f59e0b', // Amber
    },
    plan_logistics_route: {
        label: 'Logistieke Route & Callsheet (AI Route Planner)',
        table: 'timeline_events',
        op: 'insert',
        pages: ['/logistiek', '/ai-chat', '/events'],
        icon: 'fa-route',
        color: '#8b5cf6', // Violet
    },
    predict_hardware_needs: {
        label: 'Hardware Voorspelling (Bus-Check)',
        table: 'event_materieel',
        op: 'insert',
        pages: ['/logistiek', '/events', '/ai-chat'],
        icon: 'fa-truck-fast',
        color: '#8b5cf6', // Violet for Genius Actions
    },

    // ── Prep-taken ───────────────────────────────────────────────────────────
    shift_service_timeline: {
        label: 'Service Planning Verschuiven (Floor Manager)',
        table: 'timeline_events',
        op: 'update',
        pages: ['/service', '/events', '/ai-chat'],
        icon: 'fa-clock-rotate-left',
        color: '#8b5cf6', // Violet for Master AI Tools
    },
    create_prep_task: {
        label: 'Prep-taak aanmaken',
        table: 'prep_tasks',
        op: 'insert',
        pages: ['/agenda', '/events', '/service'],
        icon: 'fa-list-check',
        color: '#22c55e',
    },

    // ── Offertes ─────────────────────────────────────────────────────────────
    generate_smart_quote: {
        label: 'Slimme Offerte Genereren',
        table: 'offertes',
        op: 'insert',
        pages: ['/offertes', '/agenda', '/menu-engineering'],
        icon: 'fa-brain',
        color: '#8b5cf6', // Violet for Genius Actions
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

    // ── Smart Data Center ────────────────────────────────────────────────────
    import_vault_recipe: {
        label: 'Importeer naar Vault (Bedenk recept)',
        table: 'recepten',
        op: 'insert',
        pages: ['/ai-chat', '/gerechten', '/recepten', '/menu-engineering'], // Beschikbaar in de Studio, Recepten, en Menu Engineering
        icon: 'fa-file-import',
        color: '#22c55e',
    },
    render_recipe_matrix: {
        label: 'Interactieve Recepten Trechter',
        table: 'recepten', // Virtual table handler
        op: 'custom',
        pages: ['/ai-chat', '/gerechten', '/recepten', '/menu-engineering'],
        icon: 'fa-table-list',
        color: '#8b5cf6', // Purple
    },
};

// ─── Geef beschikbare acties terug voor een pagina ────────────────────────────
export function getActionsForPage(pathname) {
    return Object.entries(ACTION_TYPES)
        .filter(function (entry) { return entry[1].pages.includes(pathname); })
        .map(function (entry) { return Object.assign({ key: entry[0] }, entry[1]); });
}

// ─── Veldschema's per actietype (voor expliciete AI-instructies) ─────────────
var ACTION_SCHEMAS = {
    create_gerecht: {
        voorbeeld: '<<<ACTION:{"type":"create_gerecht","description":"Gerecht aanmaken: Pulled Pork Slider","data":{"naam":"Pulled Pork Slider","gang_slug":"bite","beschrijving":"Zacht, gerookt pulled pork op een briochebroodje met zelfgemaakte coleslaw en BBQ-glaze. Rokerig, zoet en licht pittig.","ingredienten":["200g varkensschouder","2 briochebroodjes","50g rode kool","30ml appelazijn","15ml honing","10g mosterd","5g zout","3g paprikapoeder","2g knoflookpoeder","1g cayennepeper"],"allergenen":["Gluten","Mosterd","Eieren"],"bereidingswijze":"1. Wrijf de varkensschouder in met paprika, knoflookpoeder, zout en cayenne. 2. Rook de schouder op 110°C gedurende 8-10 uur tot kerntemperatuur 93°C. 3. Trek het vlees met twee vorken uit elkaar en meng met BBQ-glaze. 4. Snijd rode kool fijn en marineer 30 min in appelazijn, honing en mosterd. 5. Serveer pulled pork op gesneden briochebroodje met coleslaw.","tags":["Populair","BBQ"],"kostprijs_pp":1.85}}>>>',
        regels: [
            'VERPLICHTE velden for create_gerecht:',
            '  naam           → exacte gerechtnaam',
            '  gang_slug      → één van: bite, borrelhapje, starter, voorgerecht, tussengerecht, hoofdgerecht, bijgerecht, dessert',
            '  beschrijving   → 2-3 zinnen smaakprofiel (zuren, texturen, umami)',
            '  ingredienten   → ARRAY van strings, minimaal 6 ingrediënten met hoeveelheid+eenheid+naam',
            '  allergenen     → ARRAY volgens Nederlandse Warenwet (Gluten, Melk, Eieren, Vis, Noten, Soja, Selderij, Mosterd, etc.)',
            '  bereidingswijze → GENUMMERD stappenplan, minimaal 4 stappen, professionele kokstaal',
            '  kostprijs_pp   → foodcost per persoon in euro (getal)',
        ],
    },
    update_gerecht: {
        voorbeeld: '<<<ACTION:{"type":"update_gerecht","description":"Gerecht bijwerken: naam of id","data":{"id":"uuid-van-gerecht","naam":"Nieuwe Naam","beschrijving":"Bijgewerkt smaakprofiel...","ingredienten":["Ingrediënt 1","Ingrediënt 2"],"bereidingswijze":"1. Stap één. 2. Stap twee.","allergenen":["Gluten"],"kostprijs_pp":2.50}}>>>',
        regels: [
            'Geef altijd id mee (of naam als id onbekend is).',
            'Vul alleen de velden in die gewijzigd worden.',
            'ingredienten en bereidingswijze: geef ALTIJD volledige nieuwe waarde mee, nooit gedeeltelijk.',
        ],
    },
};

// ─── Geef actie-instructies voor systeem-prompt ───────────────────────────────
export function getActionInstructions(pathname) {
    var actions = getActionsForPage(pathname);
    if (actions.length === 0) return '';

    var actionList = actions.map(function (a) {
        return '- ' + a.key + ': ' + a.label;
    }).join('\n');

    var schemaBlocks = actions
        .filter(function (a) { return ACTION_SCHEMAS[a.key]; })
        .map(function (a) {
            var s = ACTION_SCHEMAS[a.key];
            return [
                '',
                '### Schema: ' + a.key,
                s.regels.join('\n'),
                'Voorbeeld (gebruik dit formaat exact):',
                s.voorbeeld,
            ].join('\n');
        }).join('\n');

    return [
        '',
        '## Acties die jij kunt voorstellen',
        'Wanneer de gebruiker expliciet vraagt om iets aan te maken, bij te werken of te verwijderen,',
        'kun je een actieblok opnemen in je antwoord. ALLEEN bij expliciete verzoeken, NOOIT automatisch.',
        '',
        'Algemeen formaat (exact overnemen, inclusief <<<>>> en ZONDER markdown backticks):',
        '<<<ACTION:{"type":"ACTION_TYPE","description":"Mensleesbare omschrijving","data":{...velden...}}>>>',
        '',
        'Beschikbare actietypes voor deze pagina:',
        actionList,
        schemaBlocks,
        '',
        'Regels:',
        '- Vraag ALTIJD eerst bevestiging via het actieblok — de gebruiker keurt goed of wijst af',
        '- Zet het actieblok ONDER je antwoordtekst',
        '- Gebruik exacte veldnamen uit de database',
        '- VERBODEN: lege ingredienten-arrays, lege bereidingswijze, placeholder-tekst zoals "..." of "stap 1..."',
        '- Gebruik geen acties voor informatie-vragen, enkel voor daadwerkelijke wijzigingen',
    ].join('\n');
}

// ─── Herstel veelvoorkomende LLM JSON-fouten ─────────────────────────────────
function repairJson(str) {
    // Stap 1: Vervang enkelvoudige aanhalingstekens door dubbele (bewust van context)
    var result = '';
    var i = 0;
    var len = str.length;
    var inDoubleQuote = false;

    while (i < len) {
        var ch = str[i];
        if (inDoubleQuote) {
            if (ch === '\\') { result += ch + (str[i + 1] || ''); i += 2; continue; }
            if (ch === '"') inDoubleQuote = false;
            result += ch; i++;
        } else if (ch === '"') {
            inDoubleQuote = true; result += ch; i++;
        } else if (ch === "'") {
            // Enkelvoudig aanhalingsteken → dubbel aanhalingsteken
            result += '"'; i++;
            while (i < len) {
                var c = str[i];
                if (c === "'") { result += '"'; i++; break; }
                if (c === '"') { result += '\\"'; }
                else if (c === '\\') { result += c; i++; if (i < len) { result += str[i]; i++; } continue; }
                else { result += c; }
                i++;
            }
        } else { result += ch; i++; }
    }

    // Stap 2: Fix sleutels zonder aanhalingstekens: {naam: → {"naam":
    result = result.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');

    // Stap 3: Fix waarden zonder aanhalingstekens: "eenheid": stks → "eenheid": "stks"
    result = result.replace(/:\s*([a-zA-Z_][a-zA-Z0-9_]*)(\s*[,}\]])/g, function (match, val, end) {
        if (['true', 'false', 'null'].indexOf(val) >= 0) return match;
        return ': "' + val + '"' + end;
    });

    // Stap 4: Verwijder trailing commas
    result = result.replace(/,(\s*[}\]])/g, '$1');

    return result;
}

// ─── Parseer actieblokken uit AI-responstekst ─────────────────────────────────
export function parseActions(text) {
    if (!text) return { cleanText: '', actions: [] };
    var actions = [];
    var pattern = /<<<ACTION:([\s\S]*?)>>>/g;
    var match;

    while ((match = pattern.exec(text)) !== null) {
        try {
            var rawJsonString = match[1].trim();
            // Verwijder markdown code blokken als de AI die per ongeluk toevoegt
            rawJsonString = rawJsonString.replace(/^```(json)?\s*/i, '').replace(/\s*```$/i, '');

            // Herstel veelvoorkomende LLM JSON-fouten (enkelvoudige quotes, ontbrekende quotes)
            var repairedJsonString = repairJson(rawJsonString);
            var parsed = JSON.parse(repairedJsonString);
            if (parsed.type && ACTION_TYPES[parsed.type]) {
                actions.push({
                    id: Math.random().toString(36).slice(2, 8),
                    type: parsed.type,
                    description: parsed.description || ACTION_TYPES[parsed.type].label,
                    data: parsed.data || {},
                    meta: ACTION_TYPES[parsed.type],
                    status: 'pending',
                });
            }
        } catch (e) {
            console.warn('[AI Actions] Kon actieblok niet parsen:', e.message);
            console.warn('[AI Actions] Ontvangen string:', match[1]);
            // Voeg een fake actie toe met een foutmelding zodat de UI (en developer) dit ziet
            actions.push({
                id: 'error-' + Math.random().toString(36).slice(2, 8),
                type: 'error',
                description: 'Parsen mislukt: ' + e.message,
                data: { raw: match[1] },
                status: 'failed'
            });
        }
    }

    var cleanText = text.replace(/<<<ACTION:[\s\S]*?>>>/g, '').trim();
    return { cleanText: cleanText, actions: actions };
}

// ─── Voer een actie uit via Supabase ─────────────────────────────────────────
export async function executeAction(action, supabase) {
    if (!supabase) throw new Error('Geen database-verbinding');
    var type = action.type;
    var data = action.data;
    var def = ACTION_TYPES[type];
    if (!def) throw new Error('Onbekend actietype: ' + type);

    var result;

    if (def.op === 'insert') {
        var insertData = Object.assign({}, data);
        if (def.table === 'gerechten') {
            var rawIngs = data.ingredienten || data.ingredients || data.ingredients_list;
            if (rawIngs !== undefined) {
                insertData.ingredients_list = normalizeIngredienten(rawIngs);
                delete insertData.ingredienten;
                delete insertData.ingredients;
            }
            var hasBereiding = data.bereidingswijze || data.bereiding || data.stappenplan || data.instructies || data.preparation_steps;
            if (hasBereiding !== undefined) {
                insertData.preparation_steps = normalizeBereidingswijze(data);
                delete insertData.bereidingswijze;
                delete insertData.bereiding;
                delete insertData.stappenplan;
                delete insertData.instructies;
            }
        }
        var res = await supabase.from(def.table).insert(insertData).select().single();
        if (res.error) throw res.error;
        result = res.data;
    } else if (def.op === 'update') {
        if (!data.id) throw new Error('ID ontbreekt voor update-actie');
        var updateData = Object.assign({}, data);
        delete updateData.id;

        if (def.table === 'gerechten') {
            var rawIngsUpdate = data.ingredienten || data.ingredients || data.ingredients_list;
            if (rawIngsUpdate !== undefined) {
                updateData.ingredients_list = normalizeIngredienten(rawIngsUpdate);
                delete updateData.ingredienten;
                delete updateData.ingredients;
            }
            var hasBereidingUpdate = data.bereidingswijze || data.bereiding || data.stappenplan || data.instructies || data.preparation_steps;
            if (hasBereidingUpdate !== undefined) {
                updateData.preparation_steps = normalizeBereidingswijze(data);
                delete updateData.bereidingswijze;
                delete updateData.bereiding;
                delete updateData.stappenplan;
                delete updateData.instructies;
            }
        }

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

        // ── OMNISCIENT COPILOT: Laad altijd globale 'Vault' data ─────────────
        var vaultInvRes = await supabase.from('inventory').select('id,naam,purchase_price,unit,yield_factor,categorie').order('naam');
        var vaultRecRes = await supabase.from('recepten').select('id,naam,categorie,porties').order('naam');

        if (vaultInvRes.data) ctx.vault_inventory = vaultInvRes.data;
        if (vaultRecRes.data) ctx.vault_recepten = vaultRecRes.data;

        if (pathname === '/' || pathname === '/dashboard') {
            var evs = await supabase.from('events').select('id,name,date,guests,status,location').order('date', { ascending: true }).limit(10);
            ctx.events = evs.data || [];
            var invAll = await supabase.from('inventory').select('id,naam,current_stock,min_stock,unit');
            ctx.lowStock = (invAll.data || []).filter(function (i) { return i.current_stock <= i.min_stock; }).slice(0, 10);
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
            var offRes = await supabase.from('offertes').select('id,nummer,status,client_naam,datum,aantal_gasten,basis_prijs_pp').order('datum', { ascending: false }).limit(20);
            ctx.offertes = offRes.data || [];
        }

        if (pathname === '/financien') {
            var fOff = await supabase.from('offertes').select('id,status,datum,aantal_gasten,basis_prijs_pp,vaste_kosten,menu_selectie').in('status', ['goedgekeurd', 'geaccepteerd', 'voltooid']);
            var fGer = await supabase.from('gerechten').select('id,naam,ingredient_costs');
            var fUr = await supabase.from('time_logs').select('id,start_time,end_time,status').in('status', ['completed', 'signed']);
            ctx.financien_omzet_events = fOff.data || [];
            ctx.financien_foodcosts = fGer.data || [];
            ctx.financien_uren = fUr.data || [];
        }

        if (pathname === '/facturen') {
            var facRes = await supabase.from('facturen').select('id,nummer,status,client_naam,datum,vervaldatum').order('datum', { ascending: false }).limit(20);
            ctx.facturen = facRes.data || [];
        }

        if (pathname === '/voorraad') {
            var vRes = await supabase.from('inventory').select('*').order('naam');
            ctx.inventory = vRes.data || [];
            ctx.lowStock = (vRes.data || []).filter(function (i) { return i.current_stock <= i.min_stock; });
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
        }

        if (pathname === '/uren') {
            var urenRes = await supabase.from('time_logs').select('*').order('start_time', { ascending: false }).limit(20);
            ctx.time_logs = urenRes.data || [];
        }

        if (pathname === '/materieel') {
            var matRes = await supabase.from('materieel').select('*').order('naam');
            ctx.materieel = matRes.data || [];
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
        }

        if (pathname === '/boekhouding') {
            var offBRes = await supabase.from('offertes').select('id,status,basis_prijs_pp,aantal_gasten,datum').order('datum', { ascending: false }).limit(30);
            var facBRes = await supabase.from('facturen').select('id,status,datum').order('datum', { ascending: false }).limit(30);
            ctx.offertes = offBRes.data || [];
            ctx.facturen = facBRes.data || [];
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

// ─── Formatteer context data als tekst voor systeem-prompt ───────────────────
export function formatContextForPrompt(contextData) {
    if (!contextData) return '';
    var lines = ['\n## DATA VAULT (ALTIJD BESCHIKBAAR)\n'];

    if (contextData.vault_inventory && contextData.vault_inventory.length > 0) {
        lines.push('**INKOOP CSV (Prijs/Eenheid):**');
        var invList = contextData.vault_inventory.map(function (i) {
            return '- ' + i.naam + ': \u20AC' + (i.purchase_price || 0).toFixed(2) + ' per ' + i.unit + ' (Yield factor: ' + (i.yield_factor || 1.0) + ', Categorie: ' + (i.categorie || '?') + ')';
        });
        // We tonen de eerste 100 voor context
        lines.push(invList.slice(0, 100).join('\n'));
        lines.push('');
    }

    if (contextData.vault_recepten && contextData.vault_recepten.length > 0) {
        lines.push('**HUIDIGE RECEPTEN LIJST:**');
        lines.push(contextData.vault_recepten.map(function (r) { return r.naam; }).join(', '));
        lines.push('');
    }

    lines.push('## Huidige pagina specifieke data\n');

    if (contextData.events && contextData.events.length > 0) {
        lines.push('**Events (' + contextData.events.length + '):**');
        contextData.events.slice(0, 8).forEach(function (e) {
            lines.push('- [' + e.id + '] ' + e.name + ' | ' + (e.date || '?') + ' | ' + (e.guests || 0) + ' gasten | status: ' + (e.status || '?'));
        });
        lines.push('');
    }
    if (contextData.active_events && contextData.active_events.length > 0) {
        lines.push('**Actieve events:**');
        contextData.active_events.forEach(function (e) {
            lines.push('- [' + e.id + '] ' + e.name + ' | ' + (e.date || '?') + ' | ' + (e.guests || 0) + ' gasten');
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
        lines.push('**Offertes (' + contextData.offertes.length + '):**');
        contextData.offertes.slice(0, 8).forEach(function (o) {
            lines.push('- [' + o.id + '] ' + (o.nummer || '?') + ' | ' + (o.client_naam || '?') + ' | ' + (o.status || '?') + ' | ' + (o.aantal_gasten || 0) + ' gasten');
        });
        lines.push('');
    }
    if (contextData.facturen && contextData.facturen.length > 0) {
        lines.push('**Facturen (' + contextData.facturen.length + '):**');
        contextData.facturen.slice(0, 8).forEach(function (f) {
            lines.push('- [' + f.id + '] ' + (f.nummer || '?') + ' | ' + (f.client_naam || '?') + ' | ' + (f.status || '?'));
        });
        lines.push('');
    }
    if (contextData.inventory && contextData.inventory.length > 0) {
        lines.push('**Voorraad (' + contextData.inventory.length + ' items):**');
        contextData.inventory.slice(0, 10).forEach(function (i) {
            var alert = i.current_stock <= i.min_stock ? ' \u26A0\uFE0F LAAG' : '';
            lines.push('- [' + i.id + '] ' + i.naam + ' | ' + i.current_stock + ' ' + (i.unit || '') + ' (min: ' + i.min_stock + ')' + alert);
        });
        lines.push('');
    }
    if (contextData.lowStock && contextData.lowStock.length > 0) {
        lines.push('**\u26A0\uFE0F Lage voorraad (' + contextData.lowStock.length + ' items):**');
        contextData.lowStock.forEach(function (i) {
            lines.push('- ' + i.naam + ': ' + i.current_stock + '/' + i.min_stock + ' ' + (i.unit || ''));
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
            lines.push('- ' + (h.datum || '?') + ' ' + (h.tijd || '') + ' | ' + (h.wat || '?') + ' | ' + (h.temp || '?') + '\u00B0C | ' + (h.status || '?'));
        });
        lines.push('');
    }
    if (contextData.time_logs && contextData.time_logs.length > 0) {
        lines.push('**Urenregistraties (' + contextData.time_logs.length + ' recent):**');
        contextData.time_logs.slice(0, 5).forEach(function (t) {
            lines.push('- [' + t.id + '] ' + (t.start_time || '?') + ' \u2192 ' + (t.end_time || 'lopend') + ' | ' + (t.status || '?'));
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
            lines.push('- [' + p.id + '] Event ' + (p.event_id || '?') + ': ' + (p.text || '?') + ' | ' + (p.done ? '\u2713 klaar' : 'open') + ' | ' + (p.dagen || '?') + ' dagen voor');
        });
        lines.push('');
    }
    if (contextData.rtr_items && contextData.rtr_items.length > 0) {
        lines.push('**Bus RTR-items (' + contextData.rtr_items.length + '):** ' + contextData.rtr_items.filter(function (r) { return r.done; }).length + '/' + contextData.rtr_items.length + ' afgevinkt');
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
