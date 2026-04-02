import { normalizeIngredienten, normalizeBereidingswijze } from './utils';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FactuurItem, OfferteItem } from '@/types';

interface ActionTypeDef {
    label: string;
    table: string | null;
    op: 'insert' | 'update' | 'delete' | 'tool' | 'bulk_insert' | 'bulk_delete' | 'client_only';
    pages: string[];
    icon: string;
    color: string;
    tool?: string;
}

export interface ParsedAction {
    id: string;
    type: string;
    description: string;
    data: Record<string, unknown>;
    meta: ActionTypeDef;
    status: 'pending' | 'confirmed' | 'rejected' | 'done' | 'error' | 'executing';
}

interface ParseActionsResult {
    cleanText: string;
    actions: ParsedAction[];
}

interface FinancialTotals {
    subtotaal: number;
    btw: number;
    totaal: number;
    exBtw?: number;
}

interface ContextData {
    settings?: Record<string, unknown>;
    events?: Record<string, unknown>[];
    recenteEvents?: Record<string, unknown>[];
    active_events?: Record<string, unknown>[];
    recepten?: Record<string, unknown>[];
    gerechten?: Record<string, unknown>[];
    gangen?: Record<string, unknown>[];
    offertes?: Record<string, unknown>[];
    facturen?: Record<string, unknown>[];
    inventory?: Record<string, unknown>[];
    volgendEvent?: Record<string, unknown> | null;
    lowStock?: Record<string, unknown>[];
    vervalAlerts?: Record<string, unknown>[];
    verloopAlerts?: Record<string, unknown>[];
    leveranciers?: Record<string, unknown>[];
    inkooplijsten?: Record<string, unknown>[];
    haccp_records?: Record<string, unknown>[];
    haccp_vandaag?: Record<string, unknown>[];
    time_logs?: Record<string, unknown>[];
    materieel?: Record<string, unknown>[];
    onderhoudsAlerts?: Record<string, unknown>[];
    prep_tasks?: Record<string, unknown>[];
    rtr_items?: Record<string, unknown>[];
    pack_lists?: Record<string, unknown>[];
    weekoverzicht?: Record<string, number>;
    boekhoudingKPIs?: { totaalOmzet: number; totaalBetaald: number; totaalOpenstaand: number; totaalVerlopen: number };
    financienMaanden?: Record<string, { maand: string; omzet: number; offertes: number; uren: number }>;
    financienJaar?: number;
    folders?: Record<string, unknown>[];
    recenteOffertes?: Record<string, unknown>[];
    offerteSamenvatting?: Record<string, number>;
}

export const ACTION_TYPES: Record<string, ActionTypeDef> = {
    // ── Events ──────────────────────────────────────────────────────────────
    create_event: {
        label: 'Event aanmaken',
        table: 'events',
        op: 'insert',
        pages: ['/', '/events', '/agenda', '/offertes', '/offerte-editor', '/event-planner'],
        icon: 'fa-calendar-plus',
        color: '#3b82f6',
    },
    update_event: {
        label: 'Event bijwerken',
        table: 'events',
        op: 'update',
        pages: ['/events', '/agenda', '/service', '/event-planner'],
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
        pages: ['/gerechten', '/menu-engineering', '/ai-chat'],
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
        pages: ['/offertes', '/offerte-editor', '/event-planner'],
        icon: 'fa-file-invoice',
        color: '#22c55e',
    },
    update_offerte: {
        label: 'Offerte bijwerken',
        table: 'offertes',
        op: 'update',
        pages: ['/offertes', '/event-planner'],
        icon: 'fa-pen-to-square',
        color: '#3b82f6',
    },
    update_offerte_status: {
        label: 'Offerte status bijwerken',
        table: 'offertes',
        op: 'update',
        pages: ['/offertes', '/event-planner'],
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
export function getActionsForPage(pathname: string): (ActionTypeDef & { key: string })[] {
    return Object.entries(ACTION_TYPES)
        .filter(function (entry) { return entry[1].pages.includes(pathname); })
        .map(function (entry) { return { key: entry[0], ...entry[1] }; });
}

// ─── Geef actie-instructies voor systeem-prompt ───────────────────────────────
export function getActionInstructions(pathname: string): string {
    const actions = getActionsForPage(pathname);
    if (actions.length === 0) return '';

    const actionList = actions.map(function (a) {
        return '- ' + a.key + ': ' + a.label;
    }).join('\n');

    return [
        '',
        '## Acties die jij kunt voorstellen',
        'Je kunt een actieblok opnemen in je antwoord om de gebruiker in staat te stellen data op te slaan.',
        '',
        'Formaat (exact overnemen, inclusief <<<>>>):',
        '<<<ACTION:{"type":"ACTION_TYPE","description":"Mensleesbare omschrijving","data":{...velden...}}>>>',
        '',
        'Beschikbare actietypes voor deze pagina:',
        actionList,
        '',
        'Regels:',
        '- Vraag ALTIJD bevestiging via het actieblok — de gebruiker keurt goed of wijst af',
        '- Zet het actieblok ONDER je antwoordtekst',
        '- Gebruik exacte veldnamen uit de database',
        '- Op menu-engineering: voeg bij elk beschreven gerecht AUTOMATISCH een create_gerecht actieblok toe',
        '- Zorg dat alle strings in het JSON-blok op één regel staan — geen letterlijke newlines binnen strings',
    ].join('\n');
}

// ─── Parseer actieblokken uit AI-responstekst ─────────────────────────────────
export function parseActions(text: string | null | undefined): ParseActionsResult {
    if (!text) return { cleanText: '', actions: [] };
    const actions: ParsedAction[] = [];
    const pattern = /<<<ACTION:([\.\s\S]*?)>>>/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
        try {
            const raw = match[1]
                .replace(/:\s*"([\s\S]*?)"/g, function (_m: string, s: string) {
                    return ': "' + s.replace(/\n/g, '\\n').replace(/\r/g, '') + '"';
                })
                .replace(/[\x00-\x1F\x7F]/g, function (c: string) {
                    return c === '\n' || c === '\r' || c === '\t' ? '' : '';
                });
            const parsed = JSON.parse(raw) as { type?: string; description?: string; data?: Record<string, unknown> };
            if (parsed.type && ACTION_TYPES[parsed.type]) {
                actions.push({
                    id: Math.random().toString(36).slice(2, 8),
                    type: parsed.type,
                    description: parsed.description || ACTION_TYPES[parsed.type].label,
                    data: parsed.data || {},
                    meta: ACTION_TYPES[parsed.type],
                    status: 'pending',
                });
            } else if (parsed.type) {
                console.warn('[AI Actions] Onbekend actie-type:', parsed.type);
            }
        } catch (e) {
            console.warn('[AI Actions] Kon actieblok niet parsen:', match[1].slice(0, 80), (e as Error).message);
        }
    }

    const cleanText = text.replace(/<<<ACTION:[\.\s\S]*?>>>/g, '').trim();
    return { cleanText, actions };
}

// ─── Voer een actie uit via Supabase ─────────────────────────────────────────
export async function executeAction(action: { type: string; data: Record<string, unknown> }, supabase: SupabaseClient): Promise<Record<string, unknown> | undefined> {
    if (!supabase) throw new Error('Geen database-verbinding');
    const { type, data } = action;
    const def = ACTION_TYPES[type];
    if (!def) throw new Error('Onbekend actietype: ' + type);

    if (def.op === 'tool' || def.op === 'bulk_insert' || def.op === 'bulk_delete' || def.op === 'client_only') {
        throw new Error('Actie "' + type + '" wordt afgehandeld via speciale handler, niet via executeAction');
    }

    let result: Record<string, unknown> | undefined;

    if (def.op === 'insert') {
        const insertData: Record<string, unknown> = Object.assign({}, data);
        if (def.table === 'gerechten') {
            const rawIngs = data.ingredienten || data.ingredients || data.ingredients_list;
            if (rawIngs !== undefined) {
                insertData.ingredients_list = normalizeIngredienten(rawIngs as string | Array<Record<string, unknown>> | null);
                delete insertData.ingredienten;
                delete insertData.ingredients;
            }
            const hasBereiding = data.bereidingswijze || data.bereiding || data.stappenplan || data.instructies || data.preparation_steps;
            if (hasBereiding !== undefined) {
                insertData.preparation_steps = normalizeBereidingswijze(data as unknown as string | Record<string, unknown> | null);
                delete insertData.bereidingswijze;
                delete insertData.bereiding;
                delete insertData.stappenplan;
                delete insertData.instructies;
            }
        }
        const res = await supabase.from(def.table!).insert(insertData).select().single();
        if (res.error) throw res.error;
        result = res.data as Record<string, unknown>;
    } else if (def.op === 'update') {
        const updateData: Record<string, unknown> = Object.assign({}, data);
        delete updateData.id;

        if (def.table === 'gerechten') {
            const rawIngsUpdate = data.ingredienten || data.ingredients || data.ingredients_list;
            if (rawIngsUpdate !== undefined) {
                updateData.ingredients_list = normalizeIngredienten(rawIngsUpdate as string | Array<Record<string, unknown>> | null);
                delete updateData.ingredienten;
                delete updateData.ingredients;
            }
            const hasBereidingUpdate = data.bereidingswijze || data.bereiding || data.stappenplan || data.instructies || data.preparation_steps;
            if (hasBereidingUpdate !== undefined) {
                updateData.preparation_steps = normalizeBereidingswijze(data as unknown as string | Record<string, unknown> | null);
                delete updateData.bereidingswijze;
                delete updateData.bereiding;
                delete updateData.stappenplan;
                delete updateData.instructies;
            }
        }

        const res2 = await supabase.from(def.table!).update(updateData).eq('id', data.id as string | number).select().single();
        if (res2.error) throw res2.error;
        result = res2.data as Record<string, unknown>;
    } else if (def.op === 'delete') {
        if (!data.id) throw new Error('ID ontbreekt voor delete-actie');
        const res3 = await supabase.from(def.table!).delete().eq('id', data.id as string | number);
        if (res3.error) throw res3.error;
        result = { deleted: true, id: data.id };
    }

    return result;
}

// ─── Laad pagina-context data uit Supabase ────────────────────────────────────
export async function loadPageContextData(pathname: string, supabase: SupabaseClient | null): Promise<ContextData | null> {
    if (!supabase) return null;

    try {
        const ctx: ContextData = {};

        const settRes = await supabase.from('settings').select('bedrijfsnaam,ondertitel,default_btw,betaaltermijn,offerte_geldig,factuur_prefix,offerte_prefix').limit(1);
        if (settRes.data && settRes.data[0]) ctx.settings = settRes.data[0];

        if (pathname === '/' || pathname === '/dashboard') {
            const evs = await supabase.from('events').select('id,name,date,guests,status,location,ppp').order('date', { ascending: true }).limit(10);
            ctx.events = evs.data || [];
            const invAll = await supabase.from('inventory').select('id,naam,current_stock,min_stock,unit');
            ctx.lowStock = (invAll.data || []).filter(function (i: Record<string, unknown>) { return (i.current_stock as number) <= (i.min_stock as number); }).slice(0, 10);
            const dashOffRes = await supabase.from('offertes').select('id,nummer,status,client_naam,aantal_gasten,basis_prijs_pp,korting,items,datum').order('datum', { ascending: false }).limit(20);
            ctx.offertes = dashOffRes.data || [];
        }

        if (pathname === '/events') {
            const todayEv = new Date().toISOString().slice(0, 10);
            const evRes = await supabase.from('events')
                .select('id,name,date,guests,location,ppp,status,menu,client_naam,notitie')
                .in('status', ['optie', 'pending', 'confirmed'])
                .gte('date', todayEv)
                .order('date', { ascending: true })
                .limit(20);
            ctx.events = evRes.data || [];
            ctx.volgendEvent = (evRes.data || [])[0] || null;
            const pastEvRes = await supabase.from('events')
                .select('id,name,date,guests,status')
                .eq('status', 'completed')
                .order('date', { ascending: false })
                .limit(5);
            ctx.recenteEvents = pastEvRes.data || [];
        }

        if (pathname === '/recepten') {
            const recRes = await supabase.from('recepten').select('id,naam,categorie,porties,preptime').order('naam');
            ctx.recepten = recRes.data || [];
        }

        if (pathname === '/gerechten') {
            const gerRes = await supabase.from('gerechten').select('id,naam,gang_slug,actief').order('volgorde');
            const gangRes = await supabase.from('gangen').select('id,naam,slug,volgorde,actief').order('volgorde');
            ctx.gerechten = gerRes.data || [];
            ctx.gangen = gangRes.data || [];
        }

        if (pathname === '/menu-engineering') {
            const gerRes2 = await supabase.from('gerechten').select('id,naam,gang_slug,actief,kostprijs_pp').order('naam');
            ctx.gerechten = gerRes2.data || [];
        }

        if (pathname === '/offertes') {
            const offRes = await supabase.from('offertes').select('id,nummer,status,client_naam,datum,geldig_tot,aantal_gasten,basis_prijs_pp,korting,vaste_kosten,items').order('datum', { ascending: false }).limit(30);
            ctx.offertes = offRes.data || [];
            const nu = new Date();
            const over7dagen = new Date(nu.getTime() + 7 * 24 * 60 * 60 * 1000);
            ctx.verloopAlerts = (offRes.data || []).filter(function (o: Record<string, unknown>) {
                if (!o.geldig_tot || o.status === 'geaccepteerd' || o.status === 'goedgekeurd' || o.status === 'betaald' || o.status === 'afgewezen') return false;
                const geldigTot = new Date(o.geldig_tot as string);
                return geldigTot <= over7dagen;
            });
        }

        if (pathname === '/facturen') {
            const facRes = await supabase.from('facturen').select('id,nummer,status,client_naam,datum,vervaldatum,items').order('datum', { ascending: false }).limit(30);
            ctx.facturen = facRes.data || [];
            const nu2 = new Date();
            const over7d = new Date(nu2.getTime() + 7 * 24 * 60 * 60 * 1000);
            ctx.vervalAlerts = (facRes.data || []).filter(function (f: Record<string, unknown>) {
                if (!f.vervaldatum || f.status === 'betaald') return false;
                const vd = new Date(f.vervaldatum as string);
                return vd <= over7d;
            });
        }

        if (pathname === '/voorraad') {
            const vRes = await supabase.from('inventory').select('*').order('naam');
            ctx.inventory = vRes.data || [];
            ctx.lowStock = (vRes.data || []).filter(function (i: Record<string, unknown>) { return (i.current_stock as number) <= (i.min_stock as number); });
            const vEvRes = await supabase.from('events')
                .select('id,name,date,guests,status,menu')
                .in('status', ['optie', 'pending', 'confirmed'])
                .gte('date', new Date().toISOString().split('T')[0])
                .order('date', { ascending: true })
                .limit(5);
            ctx.events = vEvRes.data || [];
            ctx.volgendEvent = (vEvRes.data || [])[0] || null;
        }

        if (pathname === '/inkoop') {
            const levRes = await supabase.from('leveranciers').select('*').order('naam');
            const inkRes = await supabase.from('inkooplijsten').select('id,event_id,items').order('id', { ascending: false }).limit(5);
            ctx.leveranciers = levRes.data || [];
            ctx.inkooplijsten = inkRes.data || [];
        }

        if (pathname === '/haccp') {
            const hacRes = await supabase.from('haccp_records').select('*').order('datum', { ascending: false }).limit(30);
            ctx.haccp_records = hacRes.data || [];
            const hacToday = new Date().toISOString().slice(0, 10);
            const hacEvRes = await supabase.from('events')
                .select('id,name,date,status,guests')
                .in('status', ['pending', 'confirmed'])
                .gte('date', hacToday)
                .order('date', { ascending: true })
                .limit(10);
            ctx.events = hacEvRes.data || [];
            ctx.volgendEvent = (hacEvRes.data || [])[0] || null;
        }

        if (pathname === '/uren') {
            const urenRes = await supabase.from('time_logs').select('*').order('start_time', { ascending: false }).limit(50);
            ctx.time_logs = urenRes.data || [];
            const weekGeleden = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const weekLogs = (urenRes.data || []).filter(function (t: Record<string, unknown>) { return (t.start_time as string) >= weekGeleden; });
            const medewerkerUren: Record<string, number> = {};
            weekLogs.forEach(function (t: Record<string, unknown>) {
                const naam = (t.medewerker as string) || 'Onbekend';
                if (!medewerkerUren[naam]) medewerkerUren[naam] = 0;
                if (t.start_time && t.end_time) {
                    const uren = (new Date(t.end_time as string).getTime() - new Date(t.start_time as string).getTime()) / 3600000;
                    medewerkerUren[naam] += Math.max(0, uren);
                }
            });
            ctx.weekoverzicht = medewerkerUren;
        }

        if (pathname === '/materieel') {
            const matRes = await supabase.from('materieel').select('*').order('naam');
            ctx.materieel = matRes.data || [];
            const grensJaar = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            ctx.onderhoudsAlerts = (matRes.data || []).filter(function (m: Record<string, unknown>) {
                return m.status === 'defect' || m.status === 'onderhoud' ||
                    (m.aanschaf_datum && (m.aanschaf_datum as string) < grensJaar);
            });
        }

        if (pathname === '/logistiek') {
            const rtrRes = await supabase.from('rtr_items').select('*').order('id');
            const plRes = await supabase.from('pack_lists').select('id,event_id').order('id', { ascending: false }).limit(5);
            ctx.rtr_items = rtrRes.data || [];
            ctx.pack_lists = plRes.data || [];
        }

        if (pathname === '/agenda') {
            const todayAg = new Date().toISOString().slice(0, 10);
            const agEvRes = await supabase.from('events')
                .select('id,name,date,status,guests,location')
                .in('status', ['optie', 'pending', 'confirmed'])
                .gte('date', todayAg)
                .order('date', { ascending: true })
                .limit(10);
            ctx.events = agEvRes.data || [];
            ctx.volgendEvent = (agEvRes.data || [])[0] || null;
            const agEventIds = (agEvRes.data || []).map(function (e: Record<string, unknown>) { return e.id; });
            if (agEventIds.length > 0) {
                const ptRes = await supabase.from('prep_tasks').select('*').in('event_id', agEventIds as (string | number)[]).order('dagen').limit(50);
                ctx.prep_tasks = ptRes.data || [];
            } else {
                const ptFallback = await supabase.from('prep_tasks').select('*').order('id', { ascending: false }).limit(20);
                ctx.prep_tasks = ptFallback.data || [];
            }
        }

        if (pathname === '/service') {
            const vandaagSvc = new Date().toISOString().slice(0, 10);
            const svcEvRes = await supabase.from('events')
                .select('id,name,date,status,guests,location,client_naam')
                .in('status', ['confirmed', 'optie', 'pending'])
                .gte('date', vandaagSvc)
                .order('date', { ascending: true })
                .limit(5);
            ctx.active_events = svcEvRes.data || [];
            ctx.volgendEvent = (svcEvRes.data || [])[0] || null;
            const activeIds = (svcEvRes.data || []).map(function (e: Record<string, unknown>) { return e.id; });
            if (activeIds.length > 0) {
                const svcPtRes = await supabase.from('prep_tasks').select('*').in('event_id', activeIds as (string | number)[]).order('id');
                ctx.prep_tasks = svcPtRes.data || [];
            }
            const vandaag = new Date().toISOString().slice(0, 10);
            const svcHacRes = await supabase.from('haccp_records').select('*').eq('datum', vandaag).order('tijd');
            ctx.haccp_vandaag = svcHacRes.data || [];
        }

        if (pathname === '/boekhouding') {
            const offBRes = await supabase.from('offertes').select('id,nummer,status,client_naam,basis_prijs_pp,aantal_gasten,korting,items,datum').order('datum', { ascending: false }).limit(50);
            const facBRes = await supabase.from('facturen').select('id,nummer,status,client_naam,datum,vervaldatum,items').order('datum', { ascending: false }).limit(50);
            ctx.offertes = offBRes.data || [];
            ctx.facturen = facBRes.data || [];
            let totaalOmzet = 0, totaalBetaald = 0, totaalOpenstaand = 0, totaalVerlopen = 0;
            (facBRes.data || []).forEach(function (f: Record<string, unknown>) {
                const t = calcFactuurTotaal(f);
                totaalOmzet += t.totaal;
                if (f.status === 'betaald') totaalBetaald += t.totaal;
                if (f.status === 'concept' || f.status === 'verzonden' || f.status === 'verlopen') totaalOpenstaand += t.totaal;
                if (f.status === 'verlopen') totaalVerlopen += t.totaal;
            });
            ctx.boekhoudingKPIs = { totaalOmzet: totaalOmzet, totaalBetaald: totaalBetaald, totaalOpenstaand: totaalOpenstaand, totaalVerlopen: totaalVerlopen };
        }

        if (pathname === '/financien') {
            const offFinRes = await supabase.from('offertes').select('id,status,datum,basis_prijs_pp,aantal_gasten,items,vaste_kosten,menu_selectie').order('datum', { ascending: false }).limit(100);
            const urenFinRes = await supabase.from('time_logs').select('id,datum,uren,medewerker').order('datum', { ascending: false }).limit(200);
            ctx.offertes = offFinRes.data || [];
            ctx.time_logs = urenFinRes.data || [];
            const jaar = new Date().getFullYear();
            const maanden: Record<string, { maand: string; omzet: number; offertes: number; uren: number }> = {};
            for (let m = 1; m <= 12; m++) {
                const mStr = String(m).padStart(2, '0');
                maanden[mStr] = { maand: new Date(jaar, m - 1, 1).toLocaleString('nl-NL', { month: 'long' }), omzet: 0, offertes: 0, uren: 0 };
            }
            (offFinRes.data || []).filter(function (o: Record<string, unknown>) {
                return ['goedgekeurd', 'geaccepteerd', 'voltooid'].includes((o.status as string) || '') && ((o.datum as string) || '').startsWith(String(jaar));
            }).forEach(function (o: Record<string, unknown>) {
                const mStr = ((o.datum as string) || '').split('-')[1];
                if (!maanden[mStr]) return;
                maanden[mStr].omzet += calcOfferteTotaal(o).totaal;
                maanden[mStr].offertes += 1;
            });
            (urenFinRes.data || []).filter(function (u: Record<string, unknown>) { return ((u.datum as string) || '').startsWith(String(jaar)); }).forEach(function (u: Record<string, unknown>) {
                const mStr = ((u.datum as string) || '').split('-')[1];
                if (!maanden[mStr]) return;
                maanden[mStr].uren += ((u.uren as number) || 0);
            });
            ctx.financienMaanden = maanden;
            ctx.financienJaar = jaar;
        }

        if (pathname === '/price-intelligence') {
            const levPiRes = await supabase.from('leveranciers').select('id,naam,type').order('naam');
            ctx.leveranciers = levPiRes.data || [];
        }

        if (pathname === '/offerte-editor') {
            const gerEdRes = await supabase.from('gerechten').select('id,naam,gang_slug,actief,kostprijs_pp').eq('actief', true).order('gang_slug').limit(50);
            ctx.gerechten = gerEdRes.data || [];
            const gangEdRes = await supabase.from('gangen').select('id,naam,slug').eq('actief', true).order('volgorde');
            ctx.gangen = gangEdRes.data || [];
            const offEdRes = await supabase.from('offertes').select('id,nummer,status,client_naam,datum,aantal_gasten,basis_prijs_pp').order('datum', { ascending: false }).limit(5);
            ctx.recenteOffertes = offEdRes.data || [];
        }

        if (pathname === '/event-planner') {
            const offPlanRes = await supabase.from('offertes').select('id,nummer,status,client_naam,datum,geldig_tot,aantal_gasten,basis_prijs_pp,korting,items').order('datum', { ascending: false }).limit(30);
            ctx.offertes = offPlanRes.data || [];
            const todayPlan = new Date().toISOString().slice(0, 10);
            const evPlanRes = await supabase.from('events')
                .select('id,name,date,guests,status,location,client_naam,ppp')
                .gte('date', todayPlan)
                .order('date', { ascending: true })
                .limit(15);
            ctx.events = evPlanRes.data || [];
            ctx.volgendEvent = (evPlanRes.data || [])[0] || null;
            const statussen: Record<string, number> = {};
            (offPlanRes.data || []).forEach(function (o: Record<string, unknown>) {
                const status = o.status as string;
                statussen[status] = (statussen[status] || 0) + 1;
            });
            ctx.offerteSamenvatting = statussen;
        }

        return Object.keys(ctx).length > 0 ? ctx : null;
    } catch (e) {
        console.warn('[AI Context] Fout bij laden context data:', (e as Error).message);
        return null;
    }
}

// ─── Hulpfuncties voor financiele berekeningen ───────────────────────────────
function fmtEur(n: number | null | undefined): string {
    if (!n || isNaN(n)) return '\u20ac0,00';
    return '\u20ac' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcOfferteTotaal(o: Record<string, unknown>): FinancialTotals {
    const korting = parseFloat(String(o.korting)) || 0;
    if (o.items && Array.isArray(o.items) && o.items.length > 0) {
        let subtotaal = 0;
        let btw = 0;
        (o.items as Record<string, unknown>[]).forEach(function (item) {
            const line = (parseFloat(String(item.qty)) || 0) * (parseFloat(String(item.prijs)) || 0);
            subtotaal += line;
            btw += line * ((parseFloat(String(item.btw)) || 0) / 100);
        });
        return { subtotaal: subtotaal, btw: btw, totaal: subtotaal + btw - korting, exBtw: subtotaal - korting };
    }
    const omzet = (parseFloat(String(o.aantal_gasten)) || 0) * (parseFloat(String(o.basis_prijs_pp)) || 0);
    return { subtotaal: omzet, btw: 0, totaal: omzet - korting, exBtw: omzet - korting };
}

function calcFactuurTotaal(f: Record<string, unknown>): FinancialTotals {
    if (f.items && Array.isArray(f.items) && f.items.length > 0) {
        let subtotaal = 0;
        let btw = 0;
        (f.items as Record<string, unknown>[]).forEach(function (item) {
            const line = (parseFloat(String(item.qty)) || 0) * (parseFloat(String(item.prijs)) || 0);
            subtotaal += line;
            btw += line * ((parseFloat(String(item.btw)) || 0) / 100);
        });
        return { subtotaal: subtotaal, btw: btw, totaal: subtotaal + btw };
    }
    return { subtotaal: 0, btw: 0, totaal: 0 };
}

// ─── Formatteer context data als tekst voor systeem-prompt ───────────────────
export function formatContextForPrompt(contextData: ContextData | null): string {
    if (!contextData) return '';
    const lines: string[] = ['\n## Huidige pagina data (live uit de database)\n'];

    if (contextData.settings) {
        const s = contextData.settings;
        lines.push('**Bedrijf:** ' + (s.bedrijfsnaam || '?') + (s.ondertitel ? ' — ' + s.ondertitel : ''));
        lines.push('**Instellingen:** BTW ' + (s.default_btw || 21) + '% | Betaaltermijn ' + (s.betaaltermijn || 14) + ' dagen | Offerte geldig ' + (s.offerte_geldig || 30) + ' dagen');
        lines.push('');
    }

    if (contextData.events && contextData.events.length > 0) {
        lines.push('**Aankomende events (' + contextData.events.length + '):**');
        contextData.events.slice(0, 15).forEach(function (e) {
            const omzetStr = (e.ppp && e.guests) ? ' | omzet: ' + fmtEur((e.ppp as number) * (e.guests as number)) + ' (' + fmtEur(e.ppp as number) + '/p.p.)' : (e.ppp ? ' | ' + fmtEur(e.ppp as number) + '/p.p.' : '');
            let menuIds = e.menu || [];
            if (typeof menuIds === 'string') { try { menuIds = JSON.parse(menuIds); } catch (_) { menuIds = []; } }
            const menuStr = Array.isArray(menuIds) && menuIds.length > 0 ? ' | menu: ' + menuIds.length + ' recept(en)' : ' | \u26a0\ufe0f geen menu gekoppeld';
            lines.push('- [' + e.id + '] ' + (e.name || '?') + ' | ' + (e.date || '?') + ' | ' + (e.guests || 0) + ' gasten | status: ' + (e.status || '?') + omzetStr + (e.location ? ' | ' + e.location : '') + (e.client_naam ? ' | klant: ' + e.client_naam : '') + menuStr);
        });
        lines.push('');
    }
    if (contextData.recenteEvents && contextData.recenteEvents.length > 0) {
        lines.push('**Recent afgeronde events:**');
        contextData.recenteEvents.forEach(function (e) {
            lines.push('- [' + e.id + '] ' + (e.name || '?') + ' | ' + (e.date || '?') + ' | ' + (e.guests || 0) + ' gasten');
        });
        lines.push('');
    }
    if (contextData.active_events && contextData.active_events.length > 0) {
        lines.push('**Actieve events:**');
        contextData.active_events.forEach(function (e) {
            const omzetStr = (e.ppp && e.guests) ? ' | omzet: ' + fmtEur((e.ppp as number) * (e.guests as number)) : '';
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
        lines.push('**Gerechten (' + contextData.gerechten.length + ' totaal — gebruik ALTIJD de exacte [id] bij updates):**');
        contextData.gerechten.forEach(function (g) {
            lines.push('- [' + g.id + '] ' + g.naam + ' | gang: ' + (g.gang_slug || '?') + ' | actief: ' + (g.actief ? 'ja' : 'nee'));
        });
        lines.push('');
    }
    if (contextData.gangen && contextData.gangen.length > 0) {
        lines.push('**Gangen:** ' + contextData.gangen.map(function (g) { return g.naam + ' (' + g.slug + ')'; }).join(', '));
        lines.push('');
    }
    if (contextData.offertes && contextData.offertes.length > 0) {
        let offTotaalOpen = 0, offTotaalBetaald = 0, offTotaalAlles = 0;
        contextData.offertes.forEach(function (o) {
            const t = calcOfferteTotaal(o);
            offTotaalAlles += t.totaal;
            if (o.status === 'betaald' || o.status === 'goedgekeurd' || o.status === 'geaccepteerd') offTotaalBetaald += t.totaal;
            if (o.status === 'concept' || o.status === 'verzonden') offTotaalOpen += t.totaal;
        });

        lines.push('**Offertes (' + contextData.offertes.length + ') \u2014 Totaal omzet: ' + fmtEur(offTotaalAlles) + ' | Open: ' + fmtEur(offTotaalOpen) + ' | Betaald/goedgekeurd: ' + fmtEur(offTotaalBetaald) + '**');
        contextData.offertes.slice(0, 15).forEach(function (o) {
            const t = calcOfferteTotaal(o);
            const pppInfo = o.basis_prijs_pp ? ' | ' + fmtEur(o.basis_prijs_pp as number) + '/p.p.' : '';
            const kortingInfo = (parseFloat(String(o.korting)) > 0) ? ' | korting: ' + fmtEur(o.korting as number) : '';
            lines.push('- [' + o.id + '] ' + (o.nummer || '?') + ' | ' + (o.client_naam || '?') + ' | ' + (o.status || '?') + ' | ' + (o.aantal_gasten || 0) + ' gasten' + pppInfo + kortingInfo + ' | TOTAAL: ' + fmtEur(t.totaal));
        });
        lines.push('');
    }
    if (contextData.facturen && contextData.facturen.length > 0) {
        let facTotaalOpen = 0, facTotaalBetaald = 0, facTotaalAlles = 0;
        contextData.facturen.forEach(function (f) {
            const t = calcFactuurTotaal(f);
            facTotaalAlles += t.totaal;
            if (f.status === 'betaald') facTotaalBetaald += t.totaal;
            if (f.status === 'concept' || f.status === 'verzonden' || f.status === 'verlopen') facTotaalOpen += t.totaal;
        });

        lines.push('**Facturen (' + contextData.facturen.length + ') \u2014 Totaal: ' + fmtEur(facTotaalAlles) + ' | Openstaand: ' + fmtEur(facTotaalOpen) + ' | Betaald: ' + fmtEur(facTotaalBetaald) + '**');
        contextData.facturen.slice(0, 15).forEach(function (f) {
            const t = calcFactuurTotaal(f);
            const totaalStr = t.totaal > 0 ? ' | TOTAAL: ' + fmtEur(t.totaal) : '';
            const vervalStr = f.vervaldatum ? ' | vervalt: ' + f.vervaldatum : '';
            lines.push('- [' + f.id + '] ' + (f.nummer || '?') + ' | ' + (f.client_naam || '?') + ' | ' + (f.status || '?') + vervalStr + totaalStr);
        });
        lines.push('');
    }
    if (contextData.inventory && contextData.inventory.length > 0) {
        lines.push('**Voorraad (' + contextData.inventory.length + ' items):**');
        contextData.inventory.slice(0, 10).forEach(function (i) {
            const alert = (i.current_stock as number) <= (i.min_stock as number) ? ' \u26a0\ufe0f LAAG' : '';
            lines.push('- [' + i.id + '] ' + i.naam + ' | ' + i.current_stock + ' ' + (i.unit || '') + ' (min: ' + i.min_stock + ')' + alert);
        });
        lines.push('');
    }
    if (contextData.volgendEvent) {
        const ev = contextData.volgendEvent;
        lines.push('**Volgend event (gebruik dit bij inkoop-vragen):**');
        lines.push('- ID: ' + ev.id + ' | ' + (ev.name || '?') + ' | ' + (ev.date || '?') + ' | ' + (ev.guests || ev.aantal_personen || '?') + ' gasten | status: ' + (ev.status || '?') + (ev.location ? ' | ' + ev.location : ''));
        lines.push('');
    }
    if (contextData.lowStock && contextData.lowStock.length > 0) {
        lines.push('**\u26a0\ufe0f Lage voorraad (' + contextData.lowStock.length + ' items):**');
        contextData.lowStock.forEach(function (i) {
            lines.push('- ' + i.naam + ': ' + i.current_stock + '/' + i.min_stock + ' ' + (i.unit || ''));
        });
        lines.push('');
    }
    if (contextData.vervalAlerts && contextData.vervalAlerts.length > 0) {
        lines.push('**\u26a0\ufe0f Facturen die binnenkort vervallen of al verlopen zijn (' + contextData.vervalAlerts.length + '):**');
        contextData.vervalAlerts.forEach(function (f) {
            const t = calcFactuurTotaal(f);
            lines.push('- [' + f.id + '] ' + (f.nummer || '?') + ' | ' + (f.client_naam || '?') + ' | vervalt: ' + (f.vervaldatum || '?') + ' | status: ' + (f.status || '?') + ' | TOTAAL: ' + fmtEur(t.totaal));
        });
        lines.push('');
    }
    if (contextData.verloopAlerts && contextData.verloopAlerts.length > 0) {
        lines.push('**\u26a0\ufe0f Offertes die binnenkort verlopen of al verlopen zijn (' + contextData.verloopAlerts.length + '):**');
        contextData.verloopAlerts.forEach(function (o) {
            const t = calcOfferteTotaal(o);
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
            lines.push('- ' + (h.datum || '?') + ' ' + (h.tijd || '') + ' | ' + (h.wat || '?') + ' | ' + (h.temp || '?') + '\u00b0C | ' + (h.status || '?'));
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
    if (contextData.haccp_vandaag && contextData.haccp_vandaag.length > 0) {
        lines.push('**HACCP registraties vandaag (' + contextData.haccp_vandaag.length + '):**');
        contextData.haccp_vandaag.forEach(function (h) {
            lines.push('- ' + (h.tijd || '?') + ' | ' + (h.wat || '?') + ' | ' + (h.temp || '?') + '\u00b0C | ' + (h.status || '?'));
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
        lines.push('**\u26a0\ufe0f Materieel dat onderhoud nodig heeft (' + contextData.onderhoudsAlerts.length + '):**');
        contextData.onderhoudsAlerts.forEach(function (m) {
            lines.push('- [' + m.id + '] ' + m.naam + ' | aanschaf: ' + (m.aanschaf_datum || 'onbekend') + ' | status: ' + (m.status || '?') + (m.notitie ? ' | ' + m.notitie : ''));
        });
        lines.push('');
    }
    if (contextData.boekhoudingKPIs) {
        const kpi = contextData.boekhoudingKPIs;
        lines.push('**Boekhouding KPIs:**');
        lines.push('- Totale omzet (facturen): ' + fmtEur(kpi.totaalOmzet));
        lines.push('- Betaald: ' + fmtEur(kpi.totaalBetaald));
        lines.push('- Openstaand: ' + fmtEur(kpi.totaalOpenstaand));
        lines.push('- Verlopen (niet betaald): ' + fmtEur(kpi.totaalVerlopen));
        lines.push('');
    }
    if (contextData.financienMaanden) {
        lines.push('**Financi\u00ebn ' + contextData.financienJaar + ' \u2014 maandoverzicht:**');
        Object.values(contextData.financienMaanden).forEach(function (m) {
            if (m.omzet > 0 || m.uren > 0) {
                const arbeidskosten = m.uren * 35;
                const netto = m.omzet - arbeidskosten;
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

    if (contextData.recenteOffertes && contextData.recenteOffertes.length > 0) {
        lines.push('**Recente offertes (ter referentie \u2014 ' + contextData.recenteOffertes.length + '):**');
        contextData.recenteOffertes.forEach(function (o) {
            lines.push('- [' + o.id + '] ' + (o.nummer || '?') + ' | ' + (o.client_naam || '?') + ' | ' + (o.status || '?') + ' | ' + (o.aantal_gasten || 0) + ' gasten | ' + (o.basis_prijs_pp ? '\u20ac' + o.basis_prijs_pp + '/p.p.' : 'geen prijs'));
        });
        lines.push('');
    }
    if (contextData.offerteSamenvatting && Object.keys(contextData.offerteSamenvatting).length > 0) {
        lines.push('**Offerte statusverdeling:**');
        Object.entries(contextData.offerteSamenvatting).forEach(function (entry) {
            lines.push('- ' + entry[0] + ': ' + entry[1] + ' offerte(s)');
        });
        lines.push('');
    }

    return lines.join('\n');
}
