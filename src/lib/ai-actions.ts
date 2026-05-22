import { normalizeBereidingswijze } from './utils';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FactuurItem, OfferteItem } from '@/types';

// Converteer AI ingredienten data naar text[] array voor Supabase
function normalizeIngredientenArray(raw: unknown): string[] {
    if (!raw) return [];
    if (typeof raw === 'string') return raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!Array.isArray(raw)) return [];
    return raw.map(function (i: unknown): string {
        if (typeof i === 'string') return i;
        if (typeof i === 'object' && i !== null) {
            var obj = i as { hoeveelheid?: string | number; eenheid?: string; naam?: string };
            return (obj.hoeveelheid ? obj.hoeveelheid + (obj.eenheid ? ' ' + obj.eenheid + ' ' : ' ') : '') + (obj.naam || JSON.stringify(i));
        }
        return String(i);
    }).filter(Boolean);
}

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
    klanten?: Record<string, unknown>[];
    klantStats?: Record<string, { events: number; omzet: number; laatste: string }>;
    prepVoortgang?: { totaal: number; klaar: number; percentage: number };
    event?: Record<string, unknown>;
    menu_recepten?: Record<string, unknown>[];
    event_allergies?: Record<string, unknown>[];
    klantgesprek_seasonGerechten?: Record<string, unknown>[];
    klantgesprek_avgPpp?: number;
}

export const ACTION_TYPES: Record<string, ActionTypeDef> = {
    // ── Events ──────────────────────────────────────────────────────────────
    create_event: {
        label: 'Event aanmaken',
        table: 'events',
        op: 'insert',
        pages: ['/', '/events', '/agenda', '/offertes'],
        icon: 'CalendarPlus',
        color: '#3b82f6',
    },
    update_event: {
        label: 'Event bijwerken',
        table: 'events',
        op: 'update',
        pages: ['/events', '/agenda', '/events/[id]/service'],
        icon: 'CalendarCheck',
        color: '#f59e0b',
    },
    delete_event: {
        label: 'Event verwijderen',
        table: 'events',
        op: 'delete',
        pages: ['/events'],
        icon: 'CalendarX',
        color: '#ef4444',
    },

    // ── Recepten ─────────────────────────────────────────────────────────────
    create_recept: {
        label: 'Recept aanmaken',
        table: 'recepten',
        op: 'insert',
        pages: ['/recepten'],
        icon: 'BookOpen',
        color: '#22c55e',
    },
    update_recept: {
        label: 'Recept bijwerken',
        table: 'recepten',
        op: 'update',
        pages: ['/recepten'],
        icon: 'Pencil',
        color: '#f59e0b',
    },
    delete_recept: {
        label: 'Recept verwijderen',
        table: 'recepten',
        op: 'delete',
        pages: ['/recepten'],
        icon: 'Trash2',
        color: '#ef4444',
    },

    // ── Gerechten ────────────────────────────────────────────────────────────
    create_gerecht: {
        label: 'Gerecht aanmaken',
        table: 'gerechten',
        op: 'insert',
        pages: ['/gerechten', '/gerechten/menu-analyse', '/ai-chat'],
        icon: 'UtensilsCrossed',
        color: '#a78bfa',
    },
    update_gerecht: {
        label: 'Gerecht bijwerken',
        table: 'gerechten',
        op: 'update',
        pages: ['/gerechten', '/gerechten/menu-analyse'],
        icon: 'Pencil',
        color: '#f59e0b',
    },
    delete_gerecht: {
        label: 'Gerecht verwijderen',
        table: 'gerechten',
        op: 'delete',
        pages: ['/gerechten'],
        icon: 'Trash2',
        color: '#ef4444',
    },

    // ── Voorraad ─────────────────────────────────────────────────────────────
    create_voorraad: {
        label: 'Voorraad item aanmaken',
        table: 'inventory',
        op: 'insert',
        pages: ['/voorraad', '/inkoop'],
        icon: 'PackageOpen',
        color: '#4ECDC4',
    },
    update_voorraad: {
        label: 'Voorraad item bijwerken',
        table: 'inventory',
        op: 'update',
        pages: ['/voorraad'],
        icon: 'Package',
        color: '#f59e0b',
    },
    delete_voorraad: {
        label: 'Voorraad item verwijderen',
        table: 'inventory',
        op: 'delete',
        pages: ['/voorraad'],
        icon: 'Trash2',
        color: '#ef4444',
    },
    process_receipt: {
        label: 'Bonnetje Verwerken & Voorraad Updaten',
        table: 'inventory',
        op: 'delete',
        pages: ['/voorraad'],
        icon: 'Trash2',
        color: '#ef4444',
    },

    // ── Leveranciers ─────────────────────────────────────────────────────────
    create_leverancier: {
        label: 'Leverancier toevoegen',
        table: 'leveranciers',
        op: 'insert',
        pages: ['/inkoop', '/price-intelligence'],
        icon: 'Truck',
        color: '#3b82f6',
    },
    update_leverancier: {
        label: 'Leverancier bijwerken',
        table: 'leveranciers',
        op: 'update',
        pages: ['/inkoop'],
        icon: 'Pencil',
        color: '#f59e0b',
    },

    // ── HACCP ────────────────────────────────────────────────────────────────
    create_haccp: {
        label: 'Temperatuurmeting registreren',
        table: 'haccp_records',
        op: 'insert',
        pages: ['/haccp', '/events/[id]/service'],
        icon: 'Thermometer',
        color: '#ef4444',
    },

    // ── Uren ─────────────────────────────────────────────────────────────────
    create_urenlog: {
        label: 'Uren registreren',
        table: 'time_logs',
        op: 'insert',
        pages: ['/uren'],
        icon: 'Clock',
        color: '#a78bfa',
    },
    update_urenlog: {
        label: 'Urenregistratie bijwerken',
        table: 'time_logs',
        op: 'update',
        pages: ['/uren'],
        icon: 'Pencil',
        color: '#f59e0b',
    },
    delete_urenlog: {
        label: 'Urenregistratie verwijderen',
        table: 'time_logs',
        op: 'delete',
        pages: ['/uren'],
        icon: 'Trash2',
        color: '#ef4444',
    },

    // ── Materieel ────────────────────────────────────────────────────────────
    create_materieel: {
        label: 'Materieel toevoegen',
        table: 'materieel',
        op: 'insert',
        pages: ['/materieel', '/logistiek'],
        icon: 'Wrench',
        color: '#4ECDC4',
    },
    update_materieel: {
        label: 'Materieel bijwerken',
        table: 'materieel',
        op: 'update',
        pages: ['/materieel'],
        icon: 'Pencil',
        color: '#f59e0b',
    },

    // ── Prep-taken ───────────────────────────────────────────────────────────
    create_prep_task: {
        label: 'Prep-taak aanmaken',
        table: 'prep_tasks',
        op: 'insert',
        pages: ['/agenda', '/events', '/events/[id]/service'],
        icon: 'ListChecks',
        color: '#22c55e',
    },
    update_prep_task: {
        label: 'Prep-taak bijwerken',
        table: 'prep_tasks',
        op: 'update',
        pages: ['/agenda', '/events/[id]/service'],
        icon: 'Pencil',
        color: '#f59e0b',
    },
    delete_prep_task: {
        label: 'Prep-taak verwijderen',
        table: 'prep_tasks',
        op: 'delete',
        pages: ['/agenda'],
        icon: 'Trash2',
        color: '#ef4444',
    },

    // ── Offertes ─────────────────────────────────────────────────────────────
    create_offerte: {
        label: 'Offerte aanmaken',
        table: 'offertes',
        op: 'insert',
        pages: ['/offertes'],
        icon: 'FileText',
        color: '#22c55e',
    },
    update_offerte: {
        label: 'Offerte bijwerken',
        table: 'offertes',
        op: 'update',
        pages: ['/offertes'],
        icon: 'Pencil',
        color: '#3b82f6',
    },
    update_offerte_status: {
        label: 'Offerte status bijwerken',
        table: 'offertes',
        op: 'update',
        pages: ['/offertes'],
        icon: 'FileText',
        color: '#f59e0b',
    },

    // ── Facturen ─────────────────────────────────────────────────────────────
    create_factuur: {
        label: 'Factuur aanmaken',
        table: 'facturen',
        op: 'insert',
        pages: ['/facturen'],
        icon: 'Receipt',
        color: '#22c55e',
    },
    update_factuur: {
        label: 'Factuur bijwerken',
        table: 'facturen',
        op: 'update',
        pages: ['/facturen'],
        icon: 'Pencil',
        color: '#3b82f6',
    },
    update_factuur_status: {
        label: 'Factuur status bijwerken',
        table: 'facturen',
        op: 'update',
        pages: ['/facturen'],
        icon: 'Receipt',
        color: '#f59e0b',
    },

    // ── AI Gesprekken ────────────────────────────────────────────────────────
    save_conversation: {
        label: 'Gesprek opslaan',
        table: 'ai_conversations',
        op: 'insert',
        pages: ['/ai-chat'],
        icon: 'Save',
        color: '#FFBF00',
    },
    create_folder: {
        label: 'Gespreksmap aanmaken',
        table: 'ai_conversation_folders',
        op: 'insert',
        pages: ['/ai-chat'],
        icon: 'FolderPlus',
        color: '#FFBF00',
    },

    // ── System Operator Tools ────────────────────────────────────────────────
    generate_prep_list: {
        label: 'Prep-lijst genereren',
        table: null,
        op: 'tool',
        pages: ['/', '/events', '/agenda', '/events/[id]/service'],
        icon: 'ListChecks',
        color: '#22c55e',
        tool: 'generatePrepList',
    },
    generate_inkooplijst: {
        label: 'Inkooplijst berekenen',
        table: null,
        op: 'tool',
        pages: ['/', '/events', '/inkoop', '/voorraad'],
        icon: 'ShoppingCart',
        color: '#3b82f6',
        tool: 'generateInkooplijst',
    },
    generate_event_briefing: {
        label: 'Event briefing genereren',
        table: null,
        op: 'tool',
        pages: ['/', '/events', '/agenda', '/events/[id]/service'],
        icon: 'ClipboardList',
        color: '#a78bfa',
        tool: 'generateEventBriefing',
    },
    get_event_winstgevendheid: {
        label: 'Winstgevendheid berekenen',
        table: null,
        op: 'tool',
        pages: ['/', '/events', '/facturen', '/financien'],
        icon: 'LineChart',
        color: '#22c55e',
        tool: 'getEventWinstgevendheid',
    },
    bulk_create_gerechten: {
        label: 'Gerechten toevoegen aan Menu Ontwikkelaar',
        table: 'gerechten',
        op: 'bulk_insert',
        pages: ['/', '/gerechten', '/gerechten/menu-analyse', '/ai-chat'],
        icon: 'UtensilsCrossed',
        color: '#a78bfa',
        tool: 'bulkCreateGerechten',
    },
    brainstorm_gerechten_concepts: {
        label: 'Concepten — kies welke je wilt uitwerken',
        table: null,
        op: 'client_only',
        pages: ['/', '/gerechten', '/gerechten/menu-analyse', '/ai-chat'],
        icon: 'Sparkles',
        color: '#f59e0b',
    },
    info_blocks: {
        label: 'Antwoord in blokken',
        table: null,
        op: 'client_only',
        pages: ['*'],
        icon: 'Layers',
        color: '#a78bfa',
    },
    bulk_create_materieel: {
        label: 'Materieel toevoegen',
        table: 'materieel',
        op: 'bulk_insert',
        pages: ['/materieel', '/ai-chat'],
        icon: 'Boxes',
        color: '#06b6d4',
        tool: 'bulkCreateMaterieel',
    },
    filter_gerechten: {
        label: 'Gerechten verwijderen/verbergen',
        table: 'gerechten',
        op: 'bulk_delete',
        pages: ['/gerechten', '/gerechten/menu-analyse', '/ai-chat'],
        icon: 'Filter',
        color: '#ef4444',
        tool: 'filterGerechten',
    },
    mark_weak_dishes: {
        label: 'Zwakke gerechten markeren',
        table: null,
        op: 'client_only',
        pages: ['/', '/gerechten', '/gerechten/menu-analyse', '/ai-chat'],
        icon: 'StarHalf',
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
// Brace-balanced parser — robuust tegen ">>>" of "<<<" binnen JSON-strings (bv
// in foto-prompts of beschrijvingen). Een naïeve regex zou daar verkeerd
// breaken; deze loopt door de string, telt brace-depth, respecteert string-
// escapes, en pakt pas JSON op zodra de balans klopt.
export function parseActions(text: string | null | undefined): ParseActionsResult {
    if (!text) return { cleanText: '', actions: [] };
    const actions: ParsedAction[] = [];
    const ranges: Array<{ start: number; end: number }> = []; // [start, end) inclusive end-marker

    let i = 0;
    while (i < text.length) {
        const start = text.indexOf('<<<ACTION:', i);
        if (start < 0) break;
        const jsonStart = start + '<<<ACTION:'.length;
        // Skip leading whitespace
        let j = jsonStart;
        while (j < text.length && /\s/.test(text[j])) j++;
        if (text[j] !== '{') { i = start + 10; continue; }

        // Brace-balanced scan met respect voor strings + escapes
        let depth = 0;
        let inString = false;
        let escaped = false;
        let jsonEnd = -1;
        for (let k = j; k < text.length; k++) {
            const c = text[k];
            if (escaped) { escaped = false; continue; }
            if (c === '\\') { escaped = true; continue; }
            if (c === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (c === '{') depth++;
            else if (c === '}') {
                depth--;
                if (depth === 0) { jsonEnd = k; break; }
            }
        }
        if (jsonEnd < 0) break; // onafgesloten JSON — wacht op meer streaming chunks

        // Verwacht ">>>" (of ">>") na de JSON, evt met whitespace ertussen
        let after = jsonEnd + 1;
        while (after < text.length && /\s/.test(text[after])) after++;
        const closeMatch = text.slice(after, after + 3);
        if (!/^>{2,3}/.test(closeMatch)) { i = start + 10; continue; }
        const closeLen = closeMatch.startsWith('>>>') ? 3 : 2;
        const blockEnd = after + closeLen;

        const jsonStr = text.slice(j, jsonEnd + 1);
        try {
            const parsed = JSON.parse(jsonStr) as { type?: string; description?: string; data?: Record<string, unknown> };
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
            console.warn('[AI Actions] Kon actieblok niet parsen:', jsonStr.slice(0, 80), (e as Error).message);
        }
        ranges.push({ start, end: blockEnd });
        i = blockEnd;
    }

    // cleanText: knip alle gevonden ACTION-ranges weg (van achteren naar voren).
    let cleanText = text;
    for (let r = ranges.length - 1; r >= 0; r--) {
        cleanText = cleanText.slice(0, ranges[r].start) + cleanText.slice(ranges[r].end);
    }
    return { cleanText: cleanText.trim(), actions };
}

// ─── Voer een actie uit via Supabase ─────────────────────────────────────────
export async function executeAction(action: { type: string; data: Record<string, unknown> }, supabase: SupabaseClient, orgId?: string | null, aiConversationId?: number | null): Promise<Record<string, unknown> | undefined> {
    if (!supabase) throw new Error('Geen database-verbinding');
    const { type, data } = action;
    const def = ACTION_TYPES[type];
    if (!def) throw new Error('Onbekend actietype: ' + type);

    if (def.op === 'tool' || def.op === 'bulk_insert' || def.op === 'bulk_delete' || def.op === 'client_only') {
        throw new Error('Actie "' + type + '" wordt afgehandeld via speciale handler, niet via executeAction');
    }

    let result: Record<string, unknown> | undefined;

    // Generic synoniem-mapper: vertaalt AI-variaties naar echte DB kolomnamen
    // Wordt gebruikt door zowel insert als update
    function normalizeForTable(table: string, rec: Record<string, unknown>) {
        const mapField = (synonyms: string[], target: string) => {
            if (rec[target] !== undefined) return; // target staat al goed
            for (const s of synonyms) {
                if (rec[s] !== undefined) {
                    rec[target] = rec[s];
                    delete rec[s];
                    return;
                }
            }
        };

        if (table === 'events') {
            mapField(['aantal_gasten', 'gasten'], 'guests');
            mapField(['naam'], 'name');
            mapField(['datum'], 'date');
            mapField(['locatie'], 'location');
            mapField(['prijs_pp', 'prijs_per_persoon'], 'ppp');
            const allowed = ['name', 'date', 'guests', 'location', 'ppp', 'status', 'client_naam', 'client_adres', 'notitie', 'menu', 'menu_items', 'theme'];
            Object.keys(rec).forEach(k => { if (!allowed.includes(k)) delete rec[k]; });
        }
        if (table === 'offertes') {
            mapField(['klant_naam', 'naam', 'client'], 'client_naam');
            mapField(['klant_adres', 'adres'], 'client_adres');
            mapField(['guests', 'gasten'], 'aantal_gasten');
            mapField(['prijs_pp', 'basis_prijs'], 'basis_prijs_pp');
            const allowed = ['nummer', 'status', 'client_naam', 'client_adres', 'datum', 'geldig_tot', 'notitie', 'items', 'aantal_gasten', 'basis_prijs_pp', 'korting', 'vaste_kosten', 'menu_selectie'];
            Object.keys(rec).forEach(k => { if (!allowed.includes(k)) delete rec[k]; });
        }
        if (table === 'facturen') {
            mapField(['klant_naam', 'naam', 'client'], 'client_naam');
            mapField(['klant_adres', 'adres'], 'client_adres');
            const allowed = ['nummer', 'status', 'client_naam', 'client_adres', 'datum', 'vervaldatum', 'items'];
            Object.keys(rec).forEach(k => { if (!allowed.includes(k)) delete rec[k]; });
        }
        if (table === 'recepten') {
            mapField(['name', 'titel'], 'naam');
            mapField(['category'], 'categorie');
            mapField(['portions', 'servings'], 'porties');
            mapField(['prep_time', 'bereidingstijd'], 'preptime');
            const allowed = ['naam', 'categorie', 'porties', 'preptime', 'ingredienten', 'instructies', 'notitie'];
            Object.keys(rec).forEach(k => { if (!allowed.includes(k)) delete rec[k]; });
        }
        if (table === 'inventory') {
            mapField(['name'], 'naam');
            mapField(['category'], 'categorie');
            mapField(['stock', 'voorraad'], 'current_stock');
            mapField(['min', 'minimum', 'minimaal'], 'min_stock');
            mapField(['eenheid'], 'unit');
            mapField(['price', 'prijs', 'inkoopprijs'], 'purchase_price');
            mapField(['leverancier'], 'supplier');
            const allowed = ['naam', 'categorie', 'current_stock', 'min_stock', 'unit', 'purchase_price', 'supplier', 'yield_factor'];
            Object.keys(rec).forEach(k => { if (!allowed.includes(k)) delete rec[k]; });
        }
        if (table === 'materieel') {
            mapField(['name'], 'naam');
            mapField(['datum', 'aanschaf', 'bought_on'], 'aanschaf_datum');
            const allowed = ['naam', 'type', 'status', 'aanschaf_datum', 'notitie', 'logboek'];
            Object.keys(rec).forEach(k => { if (!allowed.includes(k)) delete rec[k]; });
        }
        if (table === 'haccp_records') {
            mapField(['omschrijving', 'beschrijving', 'product'], 'wat');
            mapField(['temperatuur', 'temperature'], 'temp');
            const allowed = ['event_id', 'datum', 'tijd', 'wat', 'temp', 'type', 'notitie', 'status'];
            Object.keys(rec).forEach(k => { if (!allowed.includes(k)) delete rec[k]; });
        }
        if (table === 'leveranciers') {
            mapField(['name'], 'naam');
            mapField(['telefoon', 'phone'], 'tel');
            const allowed = ['naam', 'type', 'contact', 'email', 'tel'];
            Object.keys(rec).forEach(k => { if (!allowed.includes(k)) delete rec[k]; });
        }
    }

    if (def.op === 'insert') {
        const insertData: Record<string, unknown> = Object.assign({}, data);
        normalizeForTable(def.table!, insertData);
        if (def.table === 'gerechten') {
            // Normaliseer ingredienten: AI kan sturen als ingredienten, ingredients, ingredients_list, ingrediënten
            const rawIngs = data.ingredienten || data.ingredients || data.ingredients_list || (data as any)['ingrediënten'];
            if (rawIngs !== undefined) {
                // gerechten.ingredienten is een text[] ARRAY in Supabase
                insertData.ingredienten = normalizeIngredientenArray(rawIngs);
                delete insertData.ingredients;
                delete insertData.ingredients_list;
                delete (insertData as any)['ingrediënten'];
            }
            // Normaliseer bereidingswijze: AI kan sturen als diverse namen
            const hasBereiding = data.bereidingswijze || data.bereiding || data.stappenplan || data.instructies || data.preparation_steps;
            if (hasBereiding !== undefined) {
                insertData.bereidingswijze = normalizeBereidingswijze(data as unknown as string | Record<string, unknown> | null);
                delete insertData.bereiding;
                delete insertData.stappenplan;
                delete insertData.instructies;
                delete insertData.preparation_steps;
            }
            // Allowlist: alleen kolommen die daadwerkelijk in de gerechten tabel bestaan
            var allowedGerechtCols: Record<string, boolean> = {
                naam: true, beschrijving: true, gang_slug: true, volgorde: true, actief: true,
                foto_url: true, ingredienten: true, bereidingswijze: true, allergenen: true, tags: true,
                kostprijs_pp: true, service_image: true, battle_plan_steps: true, target_prep_time: true,
                hardware_items: true, ingredienten_winkels: true, ingredient_costs: true,
                verkoopprijs: true, pos_enabled: true, pos_categorie: true, pos_prijs: true,
                pos_volgorde: true, btw_tarief: true, organization_id: true, ai_conversation_id: true
            };
            Object.keys(insertData).forEach(function (k) { if (!allowedGerechtCols[k]) delete insertData[k]; });
        }
        // RLS org_insert policy vereist dat organization_id matcht met user_org_ids().
        // Zonder dit failt élke insert met 42501.
        if (orgId && !insertData.organization_id) {
            insertData.organization_id = orgId;
        }
        // Audit trail: koppel insert aan het gesprek dat hem aanmaakte, zodat
        // we later kunnen herleiden (en rollbacken) welke AI-chat welke data
        // heeft geproduceerd. Null bij Operator (geen persisted conversation).
        if (aiConversationId && (def.table === 'gerechten' || def.table === 'events' || def.table === 'offertes' || def.table === 'recepten')) {
            insertData.ai_conversation_id = aiConversationId;
        }
        const res = await supabase.from(def.table!).insert(insertData).select().single();
        if (res.error) throw res.error;
        result = res.data as Record<string, unknown>;
    } else if (def.op === 'update') {
        const updateData: Record<string, unknown> = Object.assign({}, data);
        delete updateData.id;
        normalizeForTable(def.table!, updateData);

        if (def.table === 'gerechten') {
            const rawIngsUpdate = data.ingredienten || data.ingredients || data.ingredients_list || (data as any)['ingrediënten'];
            if (rawIngsUpdate !== undefined) {
                updateData.ingredienten = normalizeIngredientenArray(rawIngsUpdate);
                delete updateData.ingredients;
                delete updateData.ingredients_list;
                delete (updateData as any)['ingrediënten'];
            }
            const hasBereidingUpdate = data.bereidingswijze || data.bereiding || data.stappenplan || data.instructies || data.preparation_steps;
            if (hasBereidingUpdate !== undefined) {
                updateData.bereidingswijze = normalizeBereidingswijze(data as unknown as string | Record<string, unknown> | null);
                delete updateData.bereiding;
                delete updateData.stappenplan;
                delete updateData.instructies;
                delete updateData.preparation_steps;
            }
            var allowedGerechtColsUpd: Record<string, boolean> = {
                naam: true, beschrijving: true, gang_slug: true, volgorde: true, actief: true,
                foto_url: true, ingredienten: true, bereidingswijze: true, allergenen: true, tags: true,
                kostprijs_pp: true, service_image: true, battle_plan_steps: true, target_prep_time: true,
                hardware_items: true, ingredienten_winkels: true, ingredient_costs: true,
                verkoopprijs: true, pos_enabled: true, pos_categorie: true, pos_prijs: true,
                pos_volgorde: true, btw_tarief: true
            };
            Object.keys(updateData).forEach(function (k) { if (!allowedGerechtColsUpd[k]) delete updateData[k]; });
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
            // Verlopen facturen — primary urgent signal voor "wat moet ik vandaag?"
            const dashFacRes = await supabase.from('facturen').select('id,nummer,status,client_naam,vervaldatum,items').in('status', ['concept', 'verzonden', 'verlopen']).order('vervaldatum', { ascending: true }).limit(20);
            const todayDash = new Date().toISOString().slice(0, 10);
            ctx.vervalAlerts = (dashFacRes.data || []).filter(function (f: Record<string, unknown>) {
                if (!f.vervaldatum || f.status === 'betaald') return false;
                return (f.vervaldatum as string) <= todayDash;
            });
            // Open prep-taken voor events <2 dagen — operator moet deze direct zien
            const dashEventIds = (evs.data || []).filter(function (e: Record<string, unknown>) {
                if (!e.date) return false;
                const dgs = Math.floor((new Date(e.date as string).getTime() - Date.now()) / (24 * 3600 * 1000));
                return dgs >= 0 && dgs <= 2;
            }).map(function (e: Record<string, unknown>) { return e.id; });
            if (dashEventIds.length > 0) {
                const ptDashRes = await supabase.from('prep_tasks').select('id,event_id,naam,status,dagen').in('event_id', dashEventIds as (string | number)[]);
                ctx.prep_tasks = (ptDashRes.data || []).filter(function (t: Record<string, unknown>) { return t.status !== 'done' && t.status !== 'klaar'; });
            }
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
            /* /recepten → /gerechten redirect 2026-05-01. AI-context blijft volledig:
               receptuur-velden (bereidingswijze, porties, wijn-suggestie) leven nu
               op de gerecht-rij. */
            const recRes = await supabase.from('gerechten').select('id,naam,gang_slug,porties,target_prep_time,ingredienten,bereidingswijze,allergenen,kostprijs_pp,wijn_suggestie,service_tip').order('naam');
            ctx.recepten = recRes.data || [];
        }

        if (pathname === '/gerechten') {
            // Marge + foto-status erbij voor menu-balance + foto-prompt-suggestie
            const gerRes = await supabase.from('gerechten').select('id,naam,gang_slug,actief,kostprijs_pp,verkoopprijs,marge_pct,allergenen,foto_prompt').order('volgorde');
            const gangRes = await supabase.from('gangen').select('id,naam,slug,volgorde,actief').order('volgorde');
            ctx.gerechten = gerRes.data || [];
            ctx.gangen = gangRes.data || [];
        }

        if (pathname === '/gerechten/menu-analyse') {
            // BCG-analyse vereist verkoopprijs + marge + populariteit
            const gerRes2 = await supabase.from('gerechten').select('id,naam,gang_slug,actief,kostprijs_pp,verkoopprijs,marge_pct,pijnpunten,toppunten').order('naam');
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
            // Volgend event meegeven zodat AI direct een inkooplijst kan voorstellen
            // zonder de operator om naam/gasten/menu te vragen.
            const todayInk = new Date().toISOString().slice(0, 10);
            const inkEvRes = await supabase.from('events')
                .select('id,name,date,guests,status,menu,location,client_naam,ppp')
                .in('status', ['confirmed', 'pending', 'optie'])
                .gte('date', todayInk)
                .order('date', { ascending: true })
                .limit(5);
            ctx.events = inkEvRes.data || [];
            ctx.volgendEvent = (inkEvRes.data || [])[0] || null;
            // Voorraad voor cross-check: wat heb ik al?
            const inkInvRes = await supabase.from('inventory').select('id,naam,current_stock,min_stock,unit,purchase_price,leverancier_id').order('naam');
            ctx.inventory = inkInvRes.data || [];
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

        if (pathname === '/events/[id]/service') {
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

        if (pathname === '/financien') {
            // Combineerde context voor /financien dashboard + alle 4 boekhouding-tabs
            // (Winst & Verlies, Uitgaven, BTW, Top Klanten). /boekhouding redirect
            // hierheen, dus de hele context laden ongeacht ?tab=...
            const offFinRes = await supabase.from('offertes').select('id,nummer,status,client_naam,datum,basis_prijs_pp,aantal_gasten,korting,items,vaste_kosten,menu_selectie').order('datum', { ascending: false }).limit(100);
            const facFinRes = await supabase.from('facturen').select('id,nummer,status,client_naam,datum,vervaldatum,items').order('datum', { ascending: false }).limit(50);
            const urenFinRes = await supabase.from('time_logs').select('id,datum,uren,medewerker').order('datum', { ascending: false }).limit(200);
            ctx.offertes = offFinRes.data || [];
            ctx.facturen = facFinRes.data || [];
            ctx.time_logs = urenFinRes.data || [];

            // Boekhouding-KPIs uit facturen
            let totaalOmzet = 0, totaalBetaald = 0, totaalOpenstaand = 0, totaalVerlopen = 0;
            (facFinRes.data || []).forEach(function (f: Record<string, unknown>) {
                const t = calcFactuurTotaal(f);
                totaalOmzet += t.totaal;
                if (f.status === 'betaald') totaalBetaald += t.totaal;
                if (f.status === 'concept' || f.status === 'verzonden' || f.status === 'verlopen') totaalOpenstaand += t.totaal;
                if (f.status === 'verlopen') totaalVerlopen += t.totaal;
            });
            ctx.boekhoudingKPIs = { totaalOmzet, totaalBetaald, totaalOpenstaand, totaalVerlopen };
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

        if (pathname === '/klantgesprek') {
            // Wizard-context: top-gerechten + gemiddelde ppp voor menu-suggestie tijdens intake.
            const gangResKg = await supabase.from('gangen').select('id,naam,slug,actief').eq('actief', true).order('volgorde');
            ctx.gangen = gangResKg.data || [];
            const gerKgRes = await supabase.from('gerechten').select('id,naam,gang_slug,kostprijs_pp,verkoopprijs,marge_pct,actief').eq('actief', true).order('marge_pct', { ascending: false }).limit(30);
            ctx.gerechten = gerKgRes.data || [];
            // Gemiddelde ppp uit recente confirmed events
            const avgRes = await supabase.from('events').select('ppp,guests').in('status', ['confirmed', 'completed']).gt('ppp', 0).order('date', { ascending: false }).limit(20);
            const ppps = (avgRes.data || []).map(function (e: Record<string, unknown>) { return (e.ppp as number) || 0; }).filter(function (n: number) { return n > 0; });
            ctx.klantgesprek_avgPpp = ppps.length > 0 ? Math.round(ppps.reduce(function (a: number, b: number) { return a + b; }, 0) / ppps.length) : 45;
            // Seizoens-passende gerechten (top 10 op marge)
            ctx.klantgesprek_seasonGerechten = (gerKgRes.data || []).slice(0, 10);
        }

        if (pathname === '/klanten') {
            // Klanten + aggregaties: aantal events per klant + totaal-omzet (op basis van bevestigde offertes).
            const klRes = await supabase.from('klanten').select('id,naam,email,telefoon,bedrijf,laatste_contact').order('naam').limit(100);
            ctx.klanten = klRes.data || [];
            const offKlRes = await supabase.from('offertes').select('client_naam,status,basis_prijs_pp,aantal_gasten,korting,items,datum').limit(500);
            const klStats: Record<string, { events: number; omzet: number; laatste: string }> = {};
            (offKlRes.data || []).forEach(function (o: Record<string, unknown>) {
                if (!['geaccepteerd', 'goedgekeurd', 'betaald', 'voltooid'].includes((o.status as string) || '')) return;
                const naam = (o.client_naam as string) || 'Onbekend';
                if (!klStats[naam]) klStats[naam] = { events: 0, omzet: 0, laatste: '' };
                klStats[naam].events += 1;
                klStats[naam].omzet += calcOfferteTotaal(o).totaal;
                if ((o.datum as string) > klStats[naam].laatste) klStats[naam].laatste = (o.datum as string) || '';
            });
            ctx.klantStats = klStats;
        }

        if (pathname === '/prep-counter') {
            const todayPC = new Date().toISOString().slice(0, 10);
            const pcEvRes = await supabase.from('events')
                .select('id,name,date,guests,status')
                .in('status', ['confirmed', 'pending'])
                .gte('date', todayPC)
                .order('date', { ascending: true }).limit(5);
            ctx.events = pcEvRes.data || [];
            ctx.volgendEvent = (pcEvRes.data || [])[0] || null;
            const pcIds = (pcEvRes.data || []).map(function (e: Record<string, unknown>) { return e.id; });
            if (pcIds.length > 0) {
                const ptRes = await supabase.from('prep_tasks').select('*').in('event_id', pcIds as (string | number)[]).order('dagen');
                ctx.prep_tasks = ptRes.data || [];
                const totaal = (ptRes.data || []).length;
                const klaar = (ptRes.data || []).filter(function (t: Record<string, unknown>) { return t.status === 'done' || t.status === 'klaar'; }).length;
                ctx.prepVoortgang = { totaal, klaar, percentage: totaal > 0 ? Math.round((klaar / totaal) * 100) : 0 };
            }
        }

        // /events/[id]/hub — fetch het specifieke event op basis van het id-segment in de URL.
        // Cruciaal: zonder dit krijgt de AI geen event-data en faalt elke briefing/inkooplijst-vraag.
        if (pathname.startsWith('/events/') && pathname.endsWith('/hub')) {
            const m = pathname.match(/^\/events\/([^/]+)\/hub$/);
            const eventId = m ? m[1] : null;
            if (eventId) {
                const eventRes = await supabase.from('events').select('*').eq('id', eventId).maybeSingle();
                if (eventRes.data) {
                    ctx.event = eventRes.data;
                    // Prep-tasks voor dit event
                    const ptHubRes = await supabase.from('prep_tasks').select('*').eq('event_id', eventId).order('dagen');
                    ctx.prep_tasks = ptHubRes.data || [];
                    /* event.menu is sinds Dag 4 een menu_selectie-object (gangen → dish-namen).
                       Pre-Dag-4 events hebben nog een id-array — beide vormen handelen. */
                    const rawMenu = eventRes.data.menu;
                    const dishNames: string[] = [];
                    let menuIds: number[] = [];
                    if (Array.isArray(rawMenu)) {
                        rawMenu.forEach((v: unknown) => {
                            if (typeof v === 'number') menuIds.push(v);
                            else if (typeof v === 'string') dishNames.push(v);
                        });
                    } else if (rawMenu && typeof rawMenu === 'object') {
                        Object.values(rawMenu).forEach((list: unknown) => {
                            if (Array.isArray(list)) list.forEach(item => {
                                if (typeof item === 'string') dishNames.push(item);
                            });
                        });
                    }
                    if (menuIds.length > 0 || dishNames.length > 0) {
                        let q = supabase.from('gerechten').select('id,naam,gang_slug,porties,kostprijs_pp,ingredienten,bereidingswijze,allergenen');
                        if (menuIds.length > 0 && dishNames.length === 0) q = q.in('id', menuIds);
                        else if (dishNames.length > 0 && menuIds.length === 0) q = q.in('naam', dishNames);
                        else q = q.or('id.in.(' + menuIds.join(',') + '),naam.in.(' + dishNames.map(n => '"' + n + '"').join(',') + ')');
                        const recRes = await q;
                        ctx.menu_recepten = recRes.data || [];
                    }
                    // Factuur voor dit event — voor winstgevendheid + status
                    const facHubRes = await supabase.from('facturen').select('id,nummer,status,datum,vervaldatum,items').eq('event_id', eventId);
                    ctx.facturen = facHubRes.data || [];
                    // Allergies van gasten
                    const allergyRes = await supabase.from('event_allergies').select('*').eq('event_id', eventId);
                    if (allergyRes.data) ctx.event_allergies = allergyRes.data;
                    // HACCP records voor dit event
                    const hacHubRes = await supabase.from('haccp_records').select('*').eq('event_id', eventId).order('datum', { ascending: false }).limit(20);
                    ctx.haccp_records = hacHubRes.data || [];
                }
            }
        }

        /* /event-planner uitgefaseerd 2026-04-30: redirect naar /agenda. */

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

    // /events/[id]/hub: dit is HET event waarvoor we briefing/inkoop/winst genereren.
    // Alle hub-acties moeten op dit event-id gebaseerd zijn.
    if (contextData.event) {
        const e = contextData.event;
        const dagenTot = e.date ? Math.floor((new Date(e.date as string).getTime() - Date.now()) / (24 * 3600 * 1000)) : null;
        lines.push('**HUIDIG EVENT (id=' + e.id + ' — gebruik dit id voor alle event-acties op deze pagina):**');
        lines.push('- Naam: ' + (e.name || '?'));
        lines.push('- Datum: ' + (e.date || '?') + (dagenTot !== null ? ' (' + (dagenTot < 0 ? 'voltooid' : dagenTot + ' dagen tot event') + ')' : ''));
        lines.push('- Gasten: ' + (e.guests || '?'));
        lines.push('- Locatie: ' + (e.location || '?'));
        lines.push('- Status: ' + (e.status || '?'));
        lines.push('- Klant: ' + (e.client_naam || '?'));
        if (e.ppp) lines.push('- Prijs p.p.: ' + fmtEur(e.ppp as number) + (e.guests ? ' | totaal omzet: ' + fmtEur((e.ppp as number) * (e.guests as number)) : ''));
        if (e.notitie) lines.push('- Notitie: ' + e.notitie);
        lines.push('');
    }
    if (contextData.menu_recepten && contextData.menu_recepten.length > 0) {
        lines.push('**Menu (gekoppelde recepten — ' + contextData.menu_recepten.length + '):**');
        contextData.menu_recepten.forEach(function (r) {
            lines.push('- [' + r.id + '] ' + r.naam + ' | ' + (r.categorie || '?') + ' | ' + (r.porties || '?') + ' porties' + (r.kostprijs_pp ? ' | kost ' + fmtEur(r.kostprijs_pp as number) + '/p' : ''));
        });
        lines.push('');
    }
    if (contextData.event_allergies && contextData.event_allergies.length > 0) {
        lines.push('**Allergieën gasten (' + contextData.event_allergies.length + '):**');
        contextData.event_allergies.slice(0, 20).forEach(function (a) {
            lines.push('- ' + (a.naam_gast || 'gast') + ': ' + (a.allergeen || '?') + (a.severity ? ' (' + a.severity + ')' : ''));
        });
        lines.push('');
    }

    // /klanten: klantStats voor top-N + retention queries
    if (contextData.klantStats && Object.keys(contextData.klantStats).length > 0) {
        const sorted = Object.entries(contextData.klantStats).sort(function (a, b) { return b[1].omzet - a[1].omzet; });
        lines.push('**Klant-statistieken (top ' + Math.min(sorted.length, 15) + ' op omzet):**');
        sorted.slice(0, 15).forEach(function (entry) {
            const naam = entry[0];
            const s = entry[1];
            const dagenSinds = s.laatste ? Math.floor((Date.now() - new Date(s.laatste).getTime()) / (24 * 3600 * 1000)) : null;
            lines.push('- ' + naam + ': ' + s.events + ' events | ' + fmtEur(s.omzet) + ' omzet | laatste ' + (s.laatste || '?') + (dagenSinds !== null ? ' (' + dagenSinds + ' dagen geleden)' : ''));
        });
        lines.push('');
    }
    if (contextData.klanten && contextData.klanten.length > 0) {
        lines.push('**Klanten-database (' + contextData.klanten.length + ' totaal):**');
        contextData.klanten.slice(0, 30).forEach(function (k) {
            lines.push('- [' + k.id + '] ' + (k.naam || '?') + (k.bedrijf ? ' (' + k.bedrijf + ')' : '') + (k.telefoon ? ' | tel: ' + k.telefoon : '') + (k.email ? ' | ' + k.email : ''));
        });
        lines.push('');
    }

    // /prep-counter: voortgang
    if (contextData.prepVoortgang) {
        const p = contextData.prepVoortgang;
        lines.push('**Prep voortgang:** ' + p.klaar + '/' + p.totaal + ' afgevinkt (' + p.percentage + '%)');
        lines.push('');
    }

    // /klantgesprek: wizard-context voor menu-suggestie
    if (contextData.klantgesprek_avgPpp) {
        lines.push('**Gemiddelde prijs/persoon (recente confirmed events):** ' + fmtEur(contextData.klantgesprek_avgPpp));
        lines.push('');
    }
    if (contextData.klantgesprek_seasonGerechten && contextData.klantgesprek_seasonGerechten.length > 0) {
        lines.push('**Top-gerechten op marge (voor menu-suggestie):**');
        contextData.klantgesprek_seasonGerechten.forEach(function (g) {
            lines.push('- [' + g.id + '] ' + g.naam + ' | gang: ' + (g.gang_slug || '?') + ' | marge: ' + (g.marge_pct || '?') + '% | ' + (g.verkoopprijs ? fmtEur(g.verkoopprijs as number) : 'geen prijs'));
        });
        lines.push('');
    }

    return lines.join('\n');
}
