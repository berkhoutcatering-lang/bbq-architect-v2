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
import { bulkScheduleEventPrep } from '@/lib/prep/bulkSchedule';

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
    /* factuur.factuurId aanwezig wanneer succesvol aangemaakt of bestond-al;
       null bij echte failure. Caller kan dit gebruiken om de factuur-row direct
       te referencen (mailen, payment-link, etc.) zonder een tweede DB-roundtrip. */
    factuur: { success: boolean; message: string; factuurId: number | null };
    prep: { success: boolean; message: string; count: number };
    inkoop: { success: boolean; message: string };
    haccp: { success: boolean; message: string; count: number };
    courses: { success: boolean; message: string; count: number };
    /* P0.3 — placeholder-row + notification, AI-call gebeurt pas bij modal-open
       om de cap-budget niet bij acceptance al op te nemen voor events die
       nooit gereviewd worden. */
    logistics: { success: boolean; message: string };
    /* Hub 6 P1: auto-push naar Moneybird na factuur-creatie. Best-effort —
       fail blokkeert workflow nooit, tenant zonder Moneybird-config silent skip. */
    moneybird: { success: boolean; message: string };
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
async function autoCreateFactuur(supabase: Supa, params: WorkflowParams): Promise<{ success: boolean; message: string; factuurId: number | null }> {
    try {
        if (!supabase) return { success: false, message: 'Geen database verbinding', factuurId: null };

        /* Dedupe primair op offerte_id (FK + UNIQUE-index, migratie 007).
           Fallback op (client_naam + JSON-items) voor legacy facturen die
           zonder FK werden aangemaakt. Doel: nooit dubbele factuur per
           offerte, ook als migratie nog niet draait. */
        let alreadyExists = false;
        let existingFactuurId: number | null = null;
        if (params.offerteId) {
            const { data } = await supabase
                .from('facturen')
                .select('id')
                .eq('offerte_id', params.offerteId)
                .limit(1);
            if (data && data.length > 0) {
                alreadyExists = true;
                existingFactuurId = (data[0] as { id: number }).id;
            }
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
                existingFactuurId = (existing[0] as { id: number }).id;
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
            return { success: true, message: 'Factuur bestond al', factuurId: existingFactuurId };
        }

        const betaaltermijn = (params.settings && params.settings.betaaltermijn) || 14;
        const prefix = (params.settings && params.settings.factuur_prefix) || 'F2026-';
        const nummer = nextNummer(prefix, params.facturenNummers);

        /* offerte_id + event_id zijn nullable in DB — werkt zowel pre- als
           post-migratie. Pre-migratie gooit Postgres een column-not-found
           als de kolom nog niet bestaat; we vangen dat door zonder FK te
           retry-en zodat user-flow nooit blokkeert.

           Cruciaal: we vragen `.select('id')` aan zodat de caller de net
           aangemaakte factuur-id terug krijgt — die wordt gebruikt om de
           factuur-mail te triggeren (Golden Flow P0). */
        /* NB: facturen-tabel heeft GEEN client_email kolom (klant-email leeft in
           de klanten-tabel). organization_id + offerte_id + event_id zijn de enige
           FK-velden. Voeg client_email hier NIET toe — dat brak eerder de insert. */
        const insertWithFk = {
            nummer,
            status: 'concept',
            client_naam: params.offerteData.client_naam || '',
            client_adres: params.offerteData.client_adres || '',
            organization_id: params.offerteData.organization_id || null,
            datum: today(),
            vervaldatum: addDays(today(), betaaltermijn),
            items: params.offerteData.items || [],
            offerte_id: params.offerteId || null,
            event_id: params.eventId || null,
        };
        let inserted = await supabase.from('facturen').insert(insertWithFk).select('id').single();
        let { error } = inserted;
        let factuurId: number | null = inserted.data ? (inserted.data as { id: number }).id : null;

        if (error && /column .* does not exist/i.test(error.message)) {
            /* Migratie 007 (offerte_id/event_id FK) of organization_id nog niet
               aanwezig — retry zonder die kolommen zodat oudere omgevingen
               blijven werken. */
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { offerte_id, event_id, organization_id, ...withoutFk } = insertWithFk;
            const retry = await supabase.from('facturen').insert(withoutFk).select('id').single();
            error = retry.error;
            factuurId = retry.data ? (retry.data as { id: number }).id : null;
        }

        if (error) return { success: false, message: 'Factuur fout: ' + error.message, factuurId: null };
        return { success: true, message: 'Factuur ' + nummer + ' aangemaakt', factuurId };
    } catch (e: any) {
        return { success: false, message: 'Factuur fout: ' + (e.message || ''), factuurId: null };
    }
}

// ── 2. Auto-generate prep tasks ──
//
// Bron: offerte.menu_selectie (object { gang_slug: dish_naam[] }) joinen met
// gerechten-tabel (target_prep_time, ingredient_costs). De recepten-tabel is
// gedropt in migratie 015 — gerechten is nu de single source of truth voor
// prep-tijden en ingredients.
// P0-1 fix: vervangt oude D-3/D-2/D-1/D-0 simpele tasks door phase-aware
// DAG-templates uit src/lib/prep/recipeTemplates.ts. Eén source of truth
// voor prep-tasks — zelfde logica wordt vanuit /api/prep/bulk-schedule
// route gebruikt. Idempotent guard zit in de pure functie.
async function autoGeneratePrepTasks(supabase: Supa, params: WorkflowParams): Promise<{ success: boolean; message: string; count: number }> {
    try {
        if (!supabase) return { success: false, message: 'Geen database verbinding', count: 0 };

        // Resolve org_id via event (vereist door bulkScheduleEventPrep).
        const { data: event } = await supabase
            .from('events')
            .select('id, organization_id, start_time')
            .eq('id', params.eventId)
            .maybeSingle();
        if (!event) return { success: false, message: 'Event niet gevonden', count: 0 };
        if (!event.organization_id) return { success: false, message: 'Event mist organization_id', count: 0 };

        const result = await bulkScheduleEventPrep(supabase, params.eventId, event.organization_id, {
            // Acceptance-flow heeft vaak nog geen start_time gezet — fallback naar 16:00
            // is een redelijke BBQ-default. Chef kan event later aanpassen + force-rerun
            // via UI als 'ie precies wil schedulen.
            defaultStartTime: event.start_time || '16:00:00',
            // Idempotent: bij re-trigger niets doen tenzij force=true.
            force: false,
        });

        if (!result.ok) {
            const reason = result.reason || 'unknown';
            return { success: false, message: 'Prep skipped (' + reason + '): ' + (result.error || ''), count: 0 };
        }
        if (result.taskCount === 0) {
            return { success: true, message: 'Prep-tasks bestonden al — niet overschreven', count: 0 };
        }
        return {
            success: true,
            message: `${result.taskCount} prep-taken aangemaakt (${result.matchedTemplates} DAG-templates, ${result.fallbackCount} generic)`,
            count: result.taskCount,
        };
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
                auto_logged: true,
                notitie: 'Automatisch aangemaakt bij offerte-acceptatie — bevestig de echte temperatuur'
            });
            records.push({
                event_id: params.eventId,
                datum: eventDatum,
                tijd: '',
                wat: naam + ' — Kerntemperatuur bereiding',
                temp: 0,
                type: 'bereiding',
                status: 'ok',
                auto_logged: true,
                notitie: 'Automatisch aangemaakt bij offerte-acceptatie — bevestig de echte temperatuur'
            });
            records.push({
                event_id: params.eventId,
                datum: eventDatum,
                tijd: '',
                wat: naam + ' — Uitgifte temperatuur',
                temp: 0,
                type: 'uitgifte',
                status: 'ok',
                auto_logged: true,
                notitie: 'Automatisch aangemaakt bij offerte-acceptatie — bevestig de echte temperatuur'
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
           een lege mise op — geen crash.
           P0-3 fix: ook `id` selecteren zodat we per course een gerecht_id
           kunnen vullen — daarmee koppelt prep_tasks.course_id zich automatisch
           via bulkScheduleEventPrep. */
        const { data: gerechtenData, error: gerechtenErr } = await supabase
            .from('gerechten')
            .select('id, naam, ingredient_costs');
        if (gerechtenErr) console.warn('[acceptance] gerechten fetch error:', gerechtenErr);
        const gerechten = gerechtenData || [];

        /* Map dish-name → gerecht_id (case-insensitive, trim) voor course-coupling. */
        const dishIdByName = new Map<string, string>();
        for (const g of gerechten as Array<{ id: string; naam: string }>) {
            if (g.id && g.naam) dishIdByName.set(g.naam.trim().toLowerCase(), g.id);
        }

        /* Voor elke categorie-spec: pak de eerste matching key (canoniek of alias). */
        const courseRows: any[] = [];
        let courseNum = 1;
        const seenDishLists = new Set<string>(); /* voorkom dubbele courses bij singular+plural keys */

        for (const cat of COURSE_CATEGORIES) {
            const allKeys = [cat.key, ...cat.aliases];
            let rawDishes: unknown[] = [];
            for (const k of allKeys) {
                if (Array.isArray(menuSel[k]) && menuSel[k].length > 0) {
                    rawDishes = menuSel[k] as unknown[];
                    break;
                }
            }
            if (rawDishes.length === 0) continue;

            /* Menu_selectie heeft twee shapes: string[] (oude wizard) of
               object[] ({naam|gerecht_naam, beschrijving, allergenen} — nieuwe
               wizard / portal-design). Normaliseer naar plain dish-name strings
               zodat downstream (mise-aggregatie, gerecht-koppeling) nooit op een
               object .trim()/.toLowerCase() aanroept. */
            const dishes: string[] = rawDishes.map(function (d) {
                if (typeof d === 'string') return d;
                if (d && typeof d === 'object') {
                    const obj = d as Record<string, unknown>;
                    return String(obj.naam || obj.gerecht_naam || '');
                }
                return '';
            }).filter(function (s) { return s.length > 0; });
            if (dishes.length === 0) continue;

            /* Dedupe: als deze exacte dish-list al in een eerdere course staat, sla over. */
            const sig = dishes.slice().sort().join('|');
            if (seenDishLists.has(sig)) continue;
            seenDishLists.add(sig);

            const mise = aggregateMiseFromDishes(dishes, gerechten, guests);

            /* P0-3: koppel de eerste herkende gerecht-naam aan deze course
               zodat prep_tasks via bulkScheduleEventPrep automatisch
               course_id krijgen. Niet 1-op-1 want courses kunnen meerdere
               gerechten bevatten — voor MVP is het hoofdgerecht (eerste in
               de lijst) representatief voor de course-flow. */
            let gerechtIdForCourse: string | null = null;
            for (const dn of dishes) {
                const lookup = dishIdByName.get(dn.trim().toLowerCase());
                if (lookup) { gerechtIdForCourse = lookup; break; }
            }

            courseRows.push({
                event_id: params.eventId,
                num: courseNum++,
                title: cat.label,
                description: dishes.join(', '),
                status: 'queued',
                emoji: cat.emoji,
                prep_time_minutes: cat.prepTimeMinutes,
                serve_offset_minutes: cat.serveOffsetMinutes,
                gerecht_id: gerechtIdForCourse,
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

        let { error } = await supabase.from('courses').insert(courseRows);
        if (error) {
            /* Pre-migratie 009 — courses-tabel bestaat niet. Niet-fataal: workflow gaat door. */
            if (/relation .* does not exist/i.test(error.message)) {
                return { success: false, message: 'Courses-tabel ontbreekt (migratie 009 nog niet gedraaid)', count: 0 };
            }
            /* Optionele kolom ontbreekt (bv gerecht_id — P0-3 coupling-migratie nog
               niet gedraaid). Strip de optionele velden en retry zodat de
               kern-courses (titel/menu/portions) toch worden aangemaakt. */
            if (/Could not find the '(\w+)' column|column "?\w+"? .* does not exist/i.test(error.message)) {
                const stripped = courseRows.map(function (row) {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { gerecht_id, ...rest } = row;
                    return rest;
                });
                const retry = await supabase.from('courses').insert(stripped);
                error = retry.error;
            }
            if (error) {
                return { success: false, message: 'Courses fout: ' + error.message, count: 0 };
            }
        }

        return { success: true, message: courseRows.length + ' gangen aangemaakt vanuit menu', count: courseRows.length };
    } catch (e: any) {
        return { success: false, message: 'Courses fout: ' + (e.message || ''), count: 0 };
    }
}

// ── 6. Auto-generate logistics-checklist placeholder ──
//
// Doel: meteen na acceptance een placeholder-rij in event_checklist_items
// neerleggen + een notificatie dispatchen, zodat Mathijs in /vandaag
// en /logistiek een "AI-voorstel klaar" toast ziet. De echte AI-call
// gebeurt PAS wanneer hij de modal opent (kostenbewust — events die niet
// gereviewd worden kosten dan ook geen Anthropic-tokens).
//
// Idempotent: bestaat er al een ai_pending placeholder voor dit event,
// niets doen. Bestaan er al non-pending checks (eerder geaccepteerd),
// ook niets doen — voorkomt dubbele toasts bij re-runs.
async function autoGenerateLogisticsChecklist(supabase: Supa, params: WorkflowParams): Promise<{ success: boolean; message: string }> {
    try {
        if (!supabase) return { success: false, message: 'Geen database verbinding' };

        const orgId = params.offerteData?.organization_id;
        if (!orgId) return { success: false, message: 'organization_id ontbreekt op offerte' };

        /* Idempotent guard: bestaande checks → skippen. */
        const { data: existing } = await supabase
            .from('event_checklist_items')
            .select('id, ai_pending')
            .eq('event_id', params.eventId)
            .limit(1);
        if (existing && existing.length > 0) {
            return { success: true, message: 'Logistiek-checklist bestond al — niet overschreven' };
        }

        /* Placeholder-row: laat /logistiek meteen iets tonen ("AI-voorstel
           klaar") zonder dat we al een Anthropic-call hebben gedaan.
           Verdwijnt zodra de echte checks na modal-confirm worden ingestort. */
        const { error: insErr } = await supabase
            .from('event_checklist_items')
            .insert({
                event_id: params.eventId,
                organization_id: orgId,
                category: 'materieel',
                label: 'AI-voorstel wordt klaargezet…',
                source: 'ai',
                ai_pending: true,
                sort_order: 0,
            });
        if (insErr) {
            /* Pre-migratie 016 → tabel bestaat niet. Niet-fataal: rest van
               de workflow loopt door, toast zal niet verschijnen. */
            if (/relation .* does not exist/i.test(insErr.message)) {
                return { success: false, message: 'event_checklist_items ontbreekt (migratie 016 nog niet gedraaid)' };
            }
            return { success: false, message: 'Logistiek-placeholder fout: ' + insErr.message };
        }

        /* Notification dispatch — gebruikt de nieuwe notifications-tabel
           uit migration 016. Bij ontbreken van die tabel: silent fail. */
        const eventNaam = params.offerteData?.client_naam || 'Nieuw event';
        const { error: notifErr } = await supabase
            .from('notifications')
            .insert({
                organization_id: orgId,
                user_id: null,           // broadcast naar hele org
                type: 'ai_proposal_ready',
                title: 'AI-voorstel klaar — logistiek',
                body: `${eventNaam}: AI heeft een logistiek-checklist voor je klaargezet. Bekijken?`,
                link: `/logistiek?proposal=${params.eventId}`,
                metadata: { event_id: params.eventId, feature: 'logistics_proposal' },
            });
        if (notifErr && !/relation .* does not exist/i.test(notifErr.message)) {
            /* DB-fout anders dan ontbrekende tabel — loggen, maar workflow
               niet breken. /logistiek polled toch periodiek op ai_pending. */
            console.warn('[acceptance] logistics notification dispatch faalde:', notifErr.message);
        }

        return { success: true, message: 'Logistiek AI-voorstel klaar — toast in /vandaag' };
    } catch (e: any) {
        return { success: false, message: 'Logistiek fout: ' + (e.message || '') };
    }
}

// ── 7. Auto-push factuur naar Moneybird ──
//
// Pro-tier-belofte: als tenant Moneybird heeft gekoppeld, wordt elke factuur
// automatisch gepushed na acceptatie. Idempotent via moneybird_invoice_id
// (migration 20260528010000) — herhaalde workflow-runs voor dezelfde
// offerte pushen niet opnieuw.
//
// Best-effort fire-and-forget: Moneybird-fout blokkeert de workflow nooit.
// De gebruiker ziet hooguit "factuur niet automatisch gepushed" en kan
// handmatig pushen via /facturen knop.
//
// Trigger-voorwaarden:
//  - Factuur is nieuw aangemaakt (niet "bestond al")
//  - Tenant heeft settings.accounting_config.moneybird_administration_id gezet
//  - Factuur is nog niet eerder gepushed (moneybird_invoice_id IS NULL)
async function autoPushFactuurToMoneybird(
    supabase: Supa,
    params: WorkflowParams,
    factuurCreated: boolean,
): Promise<{ success: boolean; message: string }> {
    try {
        if (!supabase) return { success: false, message: 'Geen database verbinding' };
        if (!factuurCreated) return { success: true, message: 'Factuur bestond al — skip Moneybird push' };
        if (!params.offerteId) return { success: true, message: 'Geen offerteId — skip Moneybird push' };

        // Vind de net-aangemaakte factuur via offerte-FK
        const { data: factuur } = await supabase
            .from('facturen')
            .select('id, organization_id, moneybird_invoice_id')
            .eq('offerte_id', params.offerteId)
            .limit(1)
            .maybeSingle();
        if (!factuur) return { success: false, message: 'Factuur niet gevonden voor push' };
        if (factuur.moneybird_invoice_id) {
            return { success: true, message: 'Factuur was al gepushed' };
        }

        // Tenant-config check: heeft deze tenant Moneybird gekoppeld?
        const { data: settingsRow } = await supabase
            .from('settings')
            .select('accounting_config')
            .eq('organization_id', factuur.organization_id)
            .maybeSingle();
        const cfg = settingsRow?.accounting_config as { moneybird_administration_id?: string } | null;
        if (!cfg?.moneybird_administration_id) {
            return { success: true, message: 'Geen Moneybird-config — silent skip (Starter-tier of nog niet gekoppeld)' };
        }

        // Origin-resolve: browser gebruikt relatief, server heeft absolute URL nodig
        const origin = typeof window !== 'undefined'
            ? window.location.origin
            : (process.env.NEXT_PUBLIC_APP_URL
                || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'));

        // Fire-and-forget: await fetch maar fail mag workflow niet breken
        const res = await fetch(`${origin}/api/accounting/moneybird`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ factuurId: factuur.id, action: 'send' }),
        });

        if (!res.ok) {
            // Lees body voor diagnostiek, maar gooi niet
            const errText = await res.text().catch(() => '');
            return { success: false, message: `Moneybird push faalde (${res.status}): ${errText.slice(0, 200)}` };
        }

        return { success: true, message: 'Factuur naar Moneybird gepushed + verstuurd' };
    } catch (e: any) {
        return { success: false, message: 'Moneybird push fout: ' + (e?.message || 'onbekend') };
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
        autoGenerateLogisticsChecklist(supabase, params),
    ]);

    const factuurResult = results[0].status === 'fulfilled' ? results[0].value : { success: false, message: 'Factuur onverwachte fout', factuurId: null };
    const prepResult = results[1].status === 'fulfilled' ? results[1].value : { success: false, message: 'Prep onverwachte fout', count: 0 };
    const inkoopResult = results[2].status === 'fulfilled' ? results[2].value : { success: false, message: 'Inkoop onverwachte fout' };
    const haccpResult = results[3].status === 'fulfilled' ? results[3].value : { success: false, message: 'HACCP onverwachte fout', count: 0 };
    const coursesResult = results[4].status === 'fulfilled' ? results[4].value : { success: false, message: 'Courses onverwachte fout', count: 0 };
    const logisticsResult = results[5].status === 'fulfilled' ? results[5].value : { success: false, message: 'Logistiek onverwachte fout' };

    /* Sequentieel ná de parallel-batch: Moneybird push heeft de net-aangemaakte
       factuur nodig. "aangemaakt" in de message betekent nieuwe factuur,
       "bestond al" = skip push (was al eerder geprobeerd). */
    const factuurCreated = factuurResult.success && /aangemaakt/i.test(factuurResult.message);
    const moneybirdResult = await autoPushFactuurToMoneybird(supabase, params, factuurCreated);

    const result: WorkflowResult = {
        factuur: factuurResult,
        prep: prepResult,
        inkoop: inkoopResult,
        haccp: haccpResult,
        courses: coursesResult,
        logistics: logisticsResult,
        moneybird: moneybirdResult,
    };

    /* P0-3 post-process coupling: prep + courses lopen parallel via Promise.allSettled
       dus bij prep-insert bestaan courses nog niet. Hier koppelen we retroactief
       prep_tasks.course_id aan course.id via gerecht_id-FK. Best-effort —
       prep_tasks zonder gerecht_id of zonder matching course blijven course_id=NULL. */
    try {
        const { error: linkErr } = await supabase.rpc('exec_sql', {
            sql: `UPDATE prep_tasks pt SET course_id = c.id FROM courses c WHERE pt.event_id = c.event_id AND pt.gerecht_id IS NOT NULL AND pt.gerecht_id = c.gerecht_id AND pt.course_id IS NULL AND pt.event_id = ${params.eventId}`,
        }).single();
        // exec_sql RPC bestaat niet standaard — als 'm onbekend is, doen we het via
        // de generieke client-update path.
        if (linkErr) throw linkErr;
    } catch {
        // Fallback path: query courses, update tasks via een tweede pass.
        try {
            const { data: courses } = await supabase
                .from('courses')
                .select('id, gerecht_id')
                .eq('event_id', params.eventId)
                .not('gerecht_id', 'is', null);
            if (courses && courses.length > 0) {
                for (const c of courses as Array<{ id: number; gerecht_id: string }>) {
                    await supabase
                        .from('prep_tasks')
                        .update({ course_id: c.id })
                        .eq('event_id', params.eventId)
                        .eq('gerecht_id', c.gerecht_id)
                        .is('course_id', null);
                }
            }
        } catch (e) {
            console.warn('[acceptance] course↔prep coupling fallback faalde:', e);
        }
    }

    return result;
}
