/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================
// BBQ Architect — Acceptance Workflow
// Automatische taken bij offerte-acceptatie:
// 1. Factuur aanmaken (met FK naar offerte)
// 2. Prep-taken genereren
// 3. Inkooplijst + voorraadcheck
// 4. HACCP-sjablonen per gerecht
// 5. Service-mode courses (vanuit menu_selectie)
// =============================================

/* supabase wordt nu als parameter doorgegeven (was globale import).
   Reden: dezelfde workflow draait nu zowel client-side (offertes/page.tsx
   met user-supabase) als server-side (api/accept-offerte met service-role
   supabase). Eén bron van waarheid voor de cascade-logica. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { today, addDays, genNummer, nextNummer } from '@/lib/utils';
import { aggregateMiseFromDishes } from '@/lib/miseAggregation';

type Supa = SupabaseClient<any, any, any>;

export interface WorkflowParams {
    eventId: number;
    /* offerteId is optioneel om backwards-compat met oudere callers; nieuwe
       code geeft 'm wel mee zodat de factuur via FK gekoppeld wordt. */
    offerteId?: number;
    offerteData: Record<string, any>;
    settings: Record<string, any> | null;
    facturenCount: number;
    facturenNummers: (string | undefined | null)[];
}

export interface WorkflowResult {
    factuur: { success: boolean; message: string };
    prep: { success: boolean; message: string; count: number };
    inkoop: { success: boolean; message: string };
    haccp: { success: boolean; message: string; count: number };
    courses: { success: boolean; message: string; count: number };
}

// ── 0. Sync events.menu ← offertes.menu_selectie ──
//
// Eerder bleef events.menu leeg na acceptatie — alleen de courses-tabel werd
// gevuld. Daardoor kon prep/inkooplijst niets met het menu, en de event-hub
// toonde een lege menukaart. Nu kopiëren we de wizard-output 1-op-1 naar
// events.menu zodat alles downstream kan lezen wat de klant heeft besteld.
//
// Idempotent: als events.menu al gevuld is (handmatig aangepast, eerder
// doorgelopen workflow) overschrijven we niet. Manual-edits winnen altijd.
async function syncEventMenuFromOfferte(supabase: Supa, params: WorkflowParams): Promise<void> {
    try {
        if (!supabase) return;
        const menuSel = params.offerteData?.menu_selectie;
        if (!menuSel) return;
        const { data: ev } = await supabase.from('events').select('menu').eq('id', params.eventId).single();
        const existing = ev?.menu;
        const isEmpty = !existing
            || (Array.isArray(existing) && existing.length === 0)
            || (typeof existing === 'object' && Object.keys(existing).length === 0);
        if (!isEmpty) return; /* manual edit — niet overschrijven */
        await supabase.from('events').update({ menu: menuSel }).eq('id', params.eventId);
    } catch {
        /* silent — best-effort sync, downstream functies hebben fallback. */
    }
}

// ── 1. Auto-create factuur ──
async function autoCreateFactuur(supabase: Supa, params: WorkflowParams): Promise<{ success: boolean; message: string }> {
    try {
        if (!supabase) return { success: false, message: 'Geen database verbinding' };

        /* Dedupe primair op offerte_id (FK + UNIQUE-index, migratie 007).
           Fallback op (client_naam + JSON-items) voor legacy facturen die
           zonder FK werden aangemaakt. Doel: nooit dubbele factuur per
           offerte, ook als migratie nog niet draait. */
        let alreadyExists = false;
        if (params.offerteId) {
            const { data } = await supabase
                .from('facturen')
                .select('id')
                .eq('offerte_id', params.offerteId)
                .limit(1);
            if (data && data.length > 0) alreadyExists = true;
        }
        if (!alreadyExists) {
            const { data: existing } = await supabase
                .from('facturen')
                .select('id, offerte_id, event_id')
                .eq('client_naam', params.offerteData.client_naam)
                .eq('items', JSON.stringify(params.offerteData.items))
                .limit(1);
            if (existing && existing.length > 0) {
                alreadyExists = true;
                /* Upgrade-pad: bestaande factuur heeft nog geen FK → vul aan
                   zodat downstream queries (event-overzicht, factuur-status
                   per offerte) werken. Voorkomt dat backfill nodig blijft. */
                const ex = existing[0];
                if (params.offerteId && !ex.offerte_id) {
                    await supabase.from('facturen').update({
                        offerte_id: params.offerteId,
                        event_id: ex.event_id || params.eventId || null,
                    }).eq('id', ex.id);
                } else if (!ex.event_id && params.eventId) {
                    await supabase.from('facturen').update({ event_id: params.eventId }).eq('id', ex.id);
                }
            }
        }
        if (alreadyExists) {
            return { success: true, message: 'Factuur bestond al' };
        }

        const betaaltermijn = (params.settings && params.settings.betaaltermijn) || 14;
        const prefix = (params.settings && params.settings.factuur_prefix) || 'F2026-';
        const nummer = nextNummer(prefix, params.facturenNummers);

        /* offerte_id + event_id zijn nullable in DB — werkt zowel pre- als
           post-migratie. Pre-migratie gooit Postgres een column-not-found
           als de kolom nog niet bestaat; we vangen dat door zonder FK te
           retry-en zodat user-flow nooit blokkeert. */
        const insertWithFk = {
            nummer,
            status: 'concept',
            client_naam: params.offerteData.client_naam || '',
            client_adres: params.offerteData.client_adres || '',
            datum: today(),
            vervaldatum: addDays(today(), betaaltermijn),
            items: params.offerteData.items || [],
            offerte_id: params.offerteId || null,
            event_id: params.eventId || null,
        };
        let { error } = await supabase.from('facturen').insert(insertWithFk);

        if (error && /column .* does not exist/i.test(error.message)) {
            /* Migratie 007 nog niet gedraaid — retry zonder FKs zodat oudere
               omgevingen blijven werken. */
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { offerte_id, event_id, ...withoutFk } = insertWithFk;
            const retry = await supabase.from('facturen').insert(withoutFk);
            error = retry.error;
        }

        if (error) return { success: false, message: 'Factuur fout: ' + error.message };
        return { success: true, message: 'Factuur ' + nummer + ' aangemaakt' };
    } catch (e: any) {
        return { success: false, message: 'Factuur fout: ' + (e.message || '') };
    }
}

// ── 2. Auto-generate prep tasks ──
//
// Bron: offerte.menu_selectie (object { gang_slug: dish_naam[] }) joinen met
// gerechten-tabel (target_prep_time, ingredient_costs). De recepten-tabel is
// gedropt in migratie 015 — gerechten is nu de single source of truth voor
// prep-tijden en ingredients.
async function autoGeneratePrepTasks(supabase: Supa, params: WorkflowParams): Promise<{ success: boolean; message: string; count: number }> {
    try {
        if (!supabase) return { success: false, message: 'Geen database verbinding', count: 0 };

        const { data: event } = await supabase.from('events').select('*').eq('id', params.eventId).single();
        if (!event) return { success: false, message: 'Event niet gevonden', count: 0 };
        const guests = event.guests || 50;

        /* Pak menu_selectie (object met gangen → dish-namen) en flatten naar één
           lijst van unieke gerecht-namen. Werkt zowel voor het JSON-formaat
           als de string-JSON legacy-vorm. */
        let menuSel: any = params.offerteData?.menu_selectie || event.menu;
        if (typeof menuSel === 'string') {
            try { menuSel = JSON.parse(menuSel); } catch { menuSel = null; }
        }
        const dishNames: string[] = [];
        if (menuSel && typeof menuSel === 'object') {
            for (const list of Object.values(menuSel)) {
                if (Array.isArray(list)) {
                    for (const item of list) {
                        if (typeof item === 'string' && item.trim()) dishNames.push(item.trim());
                    }
                }
            }
        }

        let dishes: any[] = [];
        if (dishNames.length > 0) {
            const { data } = await supabase
                .from('gerechten')
                .select('naam, target_prep_time, porties, gang_slug')
                .in('naam', Array.from(new Set(dishNames)));
            dishes = data || [];
        }

        const tasks: { event_id: number; text: string; dagen: number; done: boolean }[] = [];

        // D-3: Bestelling & check
        tasks.push({ event_id: params.eventId, text: 'Voorraad check en ingredienten bestellen', dagen: -3, done: false });
        tasks.push({ event_id: params.eventId, text: 'Materieel controleren en inladen', dagen: -3, done: false });
        /* target_prep_time staat in seconden — > 7200s = > 2 uur prep-tijd.
           Die gerechten verdienen een aparte D-3 bestel-task. */
        dishes.filter(d => (d.target_prep_time || 0) > 7200).forEach(d => {
            tasks.push({ event_id: params.eventId, text: d.naam + ': bestel vers vlees, check ingredienten', dagen: -3, done: false });
        });

        // D-2: Marineren & rubben
        tasks.push({ event_id: params.eventId, text: 'Rubs en sauzen aanmaken', dagen: -2, done: false });
        tasks.push({ event_id: params.eventId, text: 'Rookhout weken', dagen: -2, done: false });
        dishes.filter(d => (d.target_prep_time || 0) > 3600).forEach(d => {
            const minutes = Math.round((d.target_prep_time || 0) / 60);
            tasks.push({ event_id: params.eventId, text: d.naam + ': marineren/rubben (' + minutes + ' min)', dagen: -2, done: false });
        });

        // D-1: Mise-en-place
        tasks.push({ event_id: params.eventId, text: 'Smoker/BBQ testen', dagen: -1, done: false });
        tasks.push({ event_id: params.eventId, text: 'Bus inladen', dagen: -1, done: false });
        tasks.push({ event_id: params.eventId, text: 'Service materiaal checken', dagen: -1, done: false });
        dishes.forEach(d => {
            tasks.push({ event_id: params.eventId, text: d.naam + ': mise-en-place, portioneren voor ' + guests + ' gasten', dagen: -1, done: false });
        });

        // D-0: Event dag
        tasks.push({ event_id: params.eventId, text: 'Smoke/BBQ aansteken 4-6u voor service', dagen: 0, done: false });
        tasks.push({ event_id: params.eventId, text: 'Sauzen opwarmen', dagen: 0, done: false });
        tasks.push({ event_id: params.eventId, text: 'Garnituren snijden', dagen: 0, done: false });
        tasks.push({ event_id: params.eventId, text: 'Service-station opzetten', dagen: 0, done: false });
        tasks.push({ event_id: params.eventId, text: 'HACCP temperaturen registreren', dagen: 0, done: false });

        if (tasks.length === 0) {
            return { success: true, message: 'Geen prep-taken nodig', count: 0 };
        }

        const { error } = await supabase.from('prep_tasks').insert(tasks);
        if (error) return { success: false, message: 'Prep fout: ' + error.message, count: 0 };
        return { success: true, message: tasks.length + ' prep-taken aangemaakt (' + dishes.length + ' gerechten)', count: tasks.length };
    } catch (e: any) {
        return { success: false, message: 'Prep fout: ' + (e.message || ''), count: 0 };
    }
}

// ── 3. Auto-generate inkooplijst ──
//
// Bron: offerte.menu_selectie joinen met gerechten.ingredient_costs (per-portion
// hoeveelheden, geen batch-recept). De recepten-tabel is gedropt in migratie 015.
//
// Schaling: gerechten.ingredient_costs is per-portie/per-gast, dus we
// vermenigvuldigen direct met event.guests (geen porties-deling zoals bij
// recepten). Dit voorkomt dat lege porties=0 fields tot Infinity kosten leiden.
async function autoGenerateInkooplijst(supabase: Supa, params: WorkflowParams): Promise<{ success: boolean; message: string }> {
    try {
        if (!supabase) return { success: false, message: 'Geen database verbinding' };

        const { data: event } = await supabase.from('events').select('*').eq('id', params.eventId).single();
        if (!event) return { success: false, message: 'Event niet gevonden' };

        const gasten = event.guests || 1;

        /* Pak menu_selectie van de offerte (preferred) of van de event-row als
           fallback. Flatten naar een unieke lijst dish-namen. */
        let menuSel: any = params.offerteData?.menu_selectie || event.menu;
        if (typeof menuSel === 'string') {
            try { menuSel = JSON.parse(menuSel); } catch { menuSel = null; }
        }
        const dishNames: string[] = [];
        if (menuSel && typeof menuSel === 'object') {
            for (const list of Object.values(menuSel)) {
                if (Array.isArray(list)) {
                    for (const item of list) {
                        if (typeof item === 'string' && item.trim()) dishNames.push(item.trim());
                    }
                }
            }
        }

        let dishes: any[] = [];
        if (dishNames.length > 0) {
            const { data } = await supabase
                .from('gerechten')
                .select('naam, ingredient_costs')
                .in('naam', Array.from(new Set(dishNames)));
            dishes = data || [];
        }

        const { data: invData } = await supabase.from('inventory').select('naam,current_stock,unit');
        const invMap: Record<string, any> = {};
        (invData || []).forEach(function (i: any) { invMap[(i.naam || '').toLowerCase().trim()] = i; });

        /* Aggregeer ingredient_costs over alle gerechten in het menu. Shape:
           gerechten.ingredient_costs = [{ naam, qty_pp, eenheid, yield_factor }] */
        const ingredientMap: Record<string, { naam: string; qty: number; unit: string; checked: boolean }> = {};
        dishes.forEach(function (dish: any) {
            const costs = Array.isArray(dish.ingredient_costs) ? dish.ingredient_costs : [];
            costs.forEach(function (c: any) {
                const key = String(c.naam || '').toLowerCase().trim();
                if (!key) return;
                const qtyPp = parseFloat(c.qty_pp) || 0;
                const yld = parseFloat(c.yield_factor) || 1;
                /* Yield factor: 0.85 = 15% loss; je moet 1/yld inkopen om qtyPp te
                   krijgen aan eindproduct. Voorbeeld: 100g ribeye met yld=0.85 → 117g
                   inkopen per gast. */
                const totalQty = (qtyPp / (yld || 1)) * gasten;
                if (!ingredientMap[key]) {
                    ingredientMap[key] = { naam: c.naam, qty: 0, unit: c.eenheid || c.unit || '', checked: false };
                }
                ingredientMap[key].qty += totalQty;
            });
        });

        // Subtract voorraad
        Object.keys(ingredientMap).forEach(function (key) {
            const inv = invMap[key];
            if (inv && inv.current_stock > 0) {
                ingredientMap[key].qty = Math.max(0, ingredientMap[key].qty - inv.current_stock);
            }
        });

        const items = Object.values(ingredientMap).filter(function (item) { return item.qty > 0; });

        if (items.length === 0) {
            return { success: true, message: 'Alles op voorraad — geen inkoop nodig' };
        }

        const { error } = await supabase.from('inkooplijsten').insert({
            event_id: params.eventId,
            items: items
        });

        if (error) return { success: false, message: 'Inkoop fout: ' + error.message };
        return { success: true, message: items.length + ' ingredienten op inkooplijst' };
    } catch (e: any) {
        return { success: false, message: 'Inkoop fout: ' + (e.message || '') };
    }
}

// ── 4. Auto-create HACCP templates ──
async function autoCreateHaccpTemplates(supabase: Supa, params: WorkflowParams): Promise<{ success: boolean; message: string; count: number }> {
    try {
        if (!supabase) return { success: false, message: 'Geen database verbinding', count: 0 };

        // Get event
        const { data: event } = await supabase.from('events').select('*').eq('id', params.eventId).single();
        if (!event) return { success: false, message: 'Event niet gevonden', count: 0 };

        // Get menu gerechten names from offerte
        let menuItems: string[] = [];
        const menuSel = params.offerteData.menu_selectie;
        if (Array.isArray(menuSel)) {
            menuSel.forEach(function (sel: any) {
                const naam = sel.gerecht_naam || sel.naam || '';
                if (naam) menuItems.push(naam);
            });
        } else if (menuSel && typeof menuSel === 'object') {
            Object.values(menuSel).forEach(function (arr: any) {
                if (Array.isArray(arr)) {
                    arr.forEach(function (sel: any) {
                        const naam = typeof sel === 'string' ? sel : (sel.gerecht_naam || sel.naam || '');
                        if (naam) menuItems.push(naam);
                    });
                }
            });
        }

        if (menuItems.length === 0) {
            // Fallback: use event menu
            const menu = Array.isArray(event.menu) ? event.menu : [];
            menuItems = menu.map(function (m: any) { return String(m); });
        }

        if (menuItems.length === 0) {
            return { success: true, message: 'Geen menu-items voor HACCP', count: 0 };
        }

        const records: any[] = [];
        const eventDatum = event.date || today();

        menuItems.forEach(function (naam: string) {
            // 3 HACCP records per gerecht: ontvangst, bereiding, uitgifte
            records.push({
                event_id: params.eventId,
                datum: eventDatum,
                tijd: '',
                wat: naam + ' — Ontvangst grondstoffen',
                temp: 0,
                type: 'ontvangst',
                status: 'ok',
                notitie: 'Automatisch aangemaakt bij offerte-acceptatie'
            });
            records.push({
                event_id: params.eventId,
                datum: eventDatum,
                tijd: '',
                wat: naam + ' — Kerntemperatuur bereiding',
                temp: 0,
                type: 'bereiding',
                status: 'ok',
                notitie: 'Automatisch aangemaakt bij offerte-acceptatie'
            });
            records.push({
                event_id: params.eventId,
                datum: eventDatum,
                tijd: '',
                wat: naam + ' — Uitgifte temperatuur',
                temp: 0,
                type: 'uitgifte',
                status: 'ok',
                notitie: 'Automatisch aangemaakt bij offerte-acceptatie'
            });
        });

        const { error } = await supabase.from('haccp_records').insert(records);
        if (error) return { success: false, message: 'HACCP fout: ' + error.message, count: 0 };
        return { success: true, message: records.length + ' HACCP-sjablonen voor ' + menuItems.length + ' gerechten', count: records.length };
    } catch (e: any) {
        return { success: false, message: 'HACCP fout: ' + (e.message || ''), count: 0 };
    }
}

// ── 5. Auto-create Service Mode courses ──
//
// menu_selectie is een object { categorie: string[] } met dish-namen.
// Categorieën worden gemapt op een gang in de service-volgorde:
//    bites/aperitief → voorgerecht → tussengerecht → hoofdgerecht → bijgerecht → dessert
// Per categorie genereren we 1 course-rij; dish-namen komen in description.
//
// Idempotent: als er al courses zijn voor dit event slaan we over zodat we
// nooit handmatige edits overschrijven. Bij volledige re-run kan de user
// gewoon courses leeggooien via de editor.
//
// Wel intentioneel niét gedaan:
//  - mise auto-fill uit gerechten.ingredient_costs — eerste sprint richt op
//    gangen-structuur; mise blijft handmatig of komt in v2 met inventory match.
//  - Veg-options auto — wordt pas relevant als het catalogus die markering heeft.

interface CategorySpec {
    /* canonieke key + alias-keys die we ook accepteren (singulier/pluraal). */
    key: string;
    aliases: string[];
    label: string;
    emoji: string;
    serveOffsetMinutes: number;  // tijd na event-start
    prepTimeMinutes: number;
}

const COURSE_CATEGORIES: CategorySpec[] = [
    { key: 'bites', aliases: ['bite', 'aperitief', 'amuse'], label: 'Bites & amuse', emoji: '🥨', serveOffsetMinutes: 0, prepTimeMinutes: 10 },
    { key: 'voorgerechten', aliases: ['voorgerecht'], label: 'Voorgerecht', emoji: '🥗', serveOffsetMinutes: 30, prepTimeMinutes: 15 },
    { key: 'tussengerechten', aliases: ['tussengerecht', 'soep'], label: 'Tussengerecht', emoji: '🍲', serveOffsetMinutes: 60, prepTimeMinutes: 12 },
    { key: 'hoofdgerechten', aliases: ['hoofdgerecht'], label: 'Hoofdgerecht', emoji: '🍖', serveOffsetMinutes: 90, prepTimeMinutes: 30 },
    { key: 'bijgerechten', aliases: ['bijgerecht', 'side', 'sides'], label: 'Bijgerechten', emoji: '🥗', serveOffsetMinutes: 90, prepTimeMinutes: 15 },
    { key: 'dessert', aliases: ['desserts', 'nagerecht'], label: 'Dessert', emoji: '🍰', serveOffsetMinutes: 150, prepTimeMinutes: 10 },
];

/** Verdeel `total` portions zo gelijk mogelijk over `tableCount` tafels. */
function distributePortionsForCourses(total: number, tableCount: number): { table: number; count: number; served: boolean; ready: boolean; inProgress: boolean }[] {
    if (tableCount <= 0) return [];
    const base = Math.floor(total / tableCount);
    const rest = total - base * tableCount;
    return Array.from({ length: tableCount }, (_, i) => ({
        table: i + 1,
        count: base + (i < rest ? 1 : 0),
        served: false, ready: false, inProgress: false,
    }));
}

/* formatMiseQty + aggregateMiseFromDishes wonen nu in lib/miseAggregation.ts
   (pure helpers; geïmporteerd bovenaan). Reden: tests konden ze niet pakken
   zonder de Supabase-import in dit bestand mee te slepen. */

async function autoCreateCourses(supabase: Supa, params: WorkflowParams): Promise<{ success: boolean; message: string; count: number }> {
    try {
        if (!supabase) return { success: false, message: 'Geen database verbinding', count: 0 };

        /* Idempotent guard: courses bestaat al → niets doen. */
        const { data: existing } = await supabase
            .from('courses')
            .select('id')
            .eq('event_id', params.eventId)
            .limit(1);
        if (existing && existing.length > 0) {
            return { success: true, message: 'Courses bestonden al — niet overschreven', count: 0 };
        }

        /* menu_selectie kan string-JSON of object zijn (legacy migratie); normaliseer. */
        let menuSel: any = params.offerteData.menu_selectie;
        if (typeof menuSel === 'string') {
            try { menuSel = JSON.parse(menuSel); } catch { menuSel = null; }
        }
        if (!menuSel || typeof menuSel !== 'object') {
            return { success: true, message: 'Geen menu — courses overgeslagen', count: 0 };
        }

        /* Haal event op voor guests-count (voor portion-distribution). */
        const { data: event } = await supabase.from('events').select('guests').eq('id', params.eventId).single();
        const guests = event?.guests || 0;
        /* tableCount schaalt met gasten — ~10 gasten per tafel is een goede default
           voor BBQ-events. Minimum 1 zodat distributePortions niet door 0 deelt.
           User kan dit later via de courses-editor aanpassen. */
        const tableCount = Math.max(1, Math.ceil(guests / 10));

        /* Haal alle gerechten in één call zodat aggregateMiseFromDishes
           geen N+1 doet. Gerechten zonder ingredient_costs leveren gewoon
           een lege mise op — geen crash. */
        const { data: gerechtenData, error: gerechtenErr } = await supabase.from('gerechten').select('naam, ingredient_costs');
        if (gerechtenErr) console.warn('[acceptance] gerechten fetch error:', gerechtenErr);
        const gerechten = gerechtenData || [];

        /* Voor elke categorie-spec: pak de eerste matching key (canoniek of alias). */
        const courseRows: any[] = [];
        let courseNum = 1;
        const seenDishLists = new Set<string>(); /* voorkom dubbele courses bij singular+plural keys */

        for (const cat of COURSE_CATEGORIES) {
            const allKeys = [cat.key, ...cat.aliases];
            let dishes: string[] = [];
            for (const k of allKeys) {
                if (Array.isArray(menuSel[k]) && menuSel[k].length > 0) {
                    dishes = menuSel[k] as string[];
                    break;
                }
            }
            if (dishes.length === 0) continue;

            /* Dedupe: als deze exacte dish-list al in een eerdere course staat, sla over. */
            const sig = dishes.slice().sort().join('|');
            if (seenDishLists.has(sig)) continue;
            seenDishLists.add(sig);

            const mise = aggregateMiseFromDishes(dishes, gerechten, guests);

            courseRows.push({
                event_id: params.eventId,
                num: courseNum++,
                title: cat.label,
                description: dishes.join(', '),
                status: 'queued',
                emoji: cat.emoji,
                prep_time_minutes: cat.prepTimeMinutes,
                serve_offset_minutes: cat.serveOffsetMinutes,
                steps: [],
                mise,
                plating: [],
                quality_checks: [],
                items: distributePortionsForCourses(guests, tableCount),
            });
        }

        if (courseRows.length === 0) {
            return { success: true, message: 'Menu leeg — courses overgeslagen', count: 0 };
        }

        const { error } = await supabase.from('courses').insert(courseRows);
        if (error) {
            /* Pre-migratie 009 — courses-tabel bestaat niet. Niet-fataal: workflow gaat door. */
            if (/relation .* does not exist/i.test(error.message)) {
                return { success: false, message: 'Courses-tabel ontbreekt (migratie 009 nog niet gedraaid)', count: 0 };
            }
            return { success: false, message: 'Courses fout: ' + error.message, count: 0 };
        }

        return { success: true, message: courseRows.length + ' gangen aangemaakt vanuit menu', count: courseRows.length };
    } catch (e: any) {
        return { success: false, message: 'Courses fout: ' + (e.message || ''), count: 0 };
    }
}

// ── Main Workflow Runner ──
//
// Twee export-vormen voor backwards-compat:
//  - runAcceptanceWorkflow(supabase, params) — nieuwe canonieke vorm
//  - runAcceptanceWorkflow(params) — oude single-arg vorm; valt terug op
//    de globale browser-supabase. Beide werken zodat bestaande callers
//    in offertes/page.tsx geen aanpassing nodig hebben.
export async function runAcceptanceWorkflow(
    arg1: Supa | WorkflowParams,
    arg2?: WorkflowParams,
): Promise<WorkflowResult> {
    let supabase: Supa;
    let params: WorkflowParams;
    if (arg2) {
        supabase = arg1 as Supa;
        params = arg2;
    } else {
        /* Single-arg variant — gebruik browser-supabase fallback. */
        const mod = await import('@/lib/supabase');
        supabase = mod.supabase as Supa;
        params = arg1 as WorkflowParams;
    }

    /* Stap 0 (sequentieel, vóór allSettled): kopieer offerte.menu_selectie naar
       events.menu zodat alle downstream functies (prep/inkoop/courses) van één
       bron lezen. Best-effort — fouten breken de workflow niet. */
    await syncEventMenuFromOfferte(supabase, params);

    const results = await Promise.allSettled([
        autoCreateFactuur(supabase, params),
        autoGeneratePrepTasks(supabase, params),
        autoGenerateInkooplijst(supabase, params),
        autoCreateHaccpTemplates(supabase, params),
        autoCreateCourses(supabase, params),
    ]);

    const factuurResult = results[0].status === 'fulfilled' ? results[0].value : { success: false, message: 'Factuur onverwachte fout' };
    const prepResult = results[1].status === 'fulfilled' ? results[1].value : { success: false, message: 'Prep onverwachte fout', count: 0 };
    const inkoopResult = results[2].status === 'fulfilled' ? results[2].value : { success: false, message: 'Inkoop onverwachte fout' };
    const haccpResult = results[3].status === 'fulfilled' ? results[3].value : { success: false, message: 'HACCP onverwachte fout', count: 0 };
    const coursesResult = results[4].status === 'fulfilled' ? results[4].value : { success: false, message: 'Courses onverwachte fout', count: 0 };

    const result: WorkflowResult = {
        factuur: factuurResult,
        prep: prepResult,
        inkoop: inkoopResult,
        haccp: haccpResult,
        courses: coursesResult,
    };

    return result;
}
