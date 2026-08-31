/**
 * bulkScheduleEventPrep — server-side prep-task generator.
 *
 * Pure functie (Supabase-client meegeleverd) zodat zowel de
 * `/api/prep/bulk-schedule` route als `acceptance-workflow.ts` dezelfde
 * logica gebruiken. Voorkomt dat we 2× dezelfde prep-taken aanmaken
 * (de oude D-3..D-0 simpele tasks + mijn nieuwe phase-DAG).
 *
 * Werkt met:
 *  - phase-aware DAG-templates (zie recipeTemplates.ts) als event.start_time bekend is
 *  - server-derived target_qty via productionQty.ts
 *  - course_id-koppeling via gerechten.id ↔ courses.gerecht_id (migration 20260511160000)
 *  - station-routing via kitchen_stations.type ↔ recipe-step.station_type
 *
 * Hard rules (per orchestrator):
 *  - target_qty NOOIT AI-derived → komt uit calculateProductionPlan()
 *  - allergens N/A in prep_tasks
 *  - alle inserts org-scoped + tenant-aware
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateProductionPlan } from './productionQty';
import { componentHoeveelheidVoorGasten } from '@/lib/gerecht-kosten';
import { scheduledAtForPhase, PHASE_DURATION_MINUTES } from './prepTaskScheduler';
import {
    findTemplateForDish,
    resolveOffsetMinutes,
    type RecipePhaseStep,
} from './recipeTemplates';
import { planStappenTerug, prepGroupBatchKey, type ReceptStap } from './stapPlanning';
import type {
    PrepTaskPhase,
    GerechIngredientCost,
    KitchenStationType,
} from '@/types/database.types';

interface DishRow {
    id: string;
    naam: string;
    porties?: number | null;
    ingredient_costs?: GerechIngredientCost[] | null;
}

interface CourseRow {
    id: number;
    event_id: number;
    gerecht_id: string | null;
}

interface MenuSelectionItem {
    naam?: string;
    gerecht_naam?: string;
    gerecht_id?: string;
}

export interface BulkScheduleOptions {
    /** Force re-insert: verwijder eerst alle bestaande prep_tasks met qty_source='server_recipe' voor dit event. */
    force?: boolean;
    /** Alleen specifieke gerechten schedulen (UUID-strings). */
    onlyGerechtIds?: string[] | null;
    /** Default start-time (HH:MM:SS) als event.start_time ontbreekt — voor offerte-acceptance-flow. */
    defaultStartTime?: string;
    /** dryRun = preview zonder DB-writes. */
    dryRun?: boolean;
    /** Wie initieert (voor audit-log + last_edited fields). */
    userId?: string | null;
}

export interface BulkScheduleResult {
    ok: boolean;
    reason?:
        | 'event_not_found'
        | 'no_org_match'
        | 'no_date'
        | 'no_guests'
        | 'no_dishes'
        | 'no_gerechten_match'
        | 'db_error';
    error?: string;
    /** Hoeveel taken zouden ingevoerd zijn (dryRun) of geïnsert (echt). */
    taskCount: number;
    /** Hoeveel gerechten matched op een DAG-template (vs. fallback generic). */
    matchedTemplates: number;
    /** Hoeveel gerechten kregen een fallback generic-task (geen DAG-match). */
    fallbackCount: number;
    /** Hoeveel component-taken gegenereerd zijn (kookbord v2, gebundeld per event). */
    componentCount?: number;
    /** Hoeveel taken uit ontlede receptstappen komen (golf 2). */
    stapCount?: number;
    /** Gerechten waarvoor receptstappen bestonden — die slaan het sjabloon over. */
    stapDishCount?: number;
    /** Server_recipe-tasks die verwijderd zijn (force-mode). */
    deletedCount: number;
    tasks: ScheduledTaskRow[];
}

export interface ScheduledTaskRow {
    event_id: number;
    organization_id: string;
    text: string;
    phase: PrepTaskPhase;
    scheduled_at: string;
    station_id: number | null;
    gerecht_id: string | null;
    course_id: number | null;
    target_qty: number | null;
    target_unit: string | null;
    qty_source: 'server_recipe';
    priority: number;
    status: 'planned';
    dagen: number;
    /* Component-gestuurde taken (kookbord v2). NULL voor template/fallback. */
    component_id: number | null;
    duration_min: number | null;
    batch_key: string | null;
    /* Golf 2 — uit recipe_steps. NULL waar niemand het heeft opgeschreven:
       een sjabloon weet niet hoeveel dáárvan handwerk is en verzint het niet. */
    duur_actief_min: number | null;
    duur_passief_min: number | null;
    prep_group: string | null;
    plaats: 'thuis' | 'bus' | 'locatie' | null;
    toezicht_nodig: boolean | null;
    recipe_step_id: string | null;
}

/** De vijf kolommen die migratie 20260901030000 aanlegt. */
const STAP_KOLOMMEN = [
    'duur_actief_min', 'duur_passief_min', 'prep_group', 'plaats', 'toezicht_nodig', 'recipe_step_id',
] as const;

/**
 * De main entry point. Roept aan vanuit:
 *  - `/api/prep/bulk-schedule/route.ts` (interactief, force-mode optioneel)
 *  - `acceptance-workflow.ts` (auto-trigger bij offerte-acceptatie, idempotent default)
 */
export async function bulkScheduleEventPrep(
    supabase: SupabaseClient,
    eventId: number,
    orgId: string,
    options: BulkScheduleOptions = {},
): Promise<BulkScheduleResult> {
    const force = options.force === true;

    // 1. Event check
    const { data: event, error: eventErr } = await supabase
        .from('events')
        .select('id, organization_id, name, date, start_time, guests, offerte_id, menu')
        .eq('id', eventId)
        .maybeSingle();
    if (eventErr) {
        return emptyResult({ ok: false, reason: 'db_error', error: eventErr.message });
    }
    if (!event) {
        return emptyResult({ ok: false, reason: 'event_not_found' });
    }
    if (event.organization_id !== orgId) {
        return emptyResult({ ok: false, reason: 'no_org_match' });
    }
    if (!event.date) {
        return emptyResult({ ok: false, reason: 'no_date' });
    }
    if (!event.guests || event.guests <= 0) {
        return emptyResult({ ok: false, reason: 'no_guests' });
    }

    // Compose event-start ISO. Als start_time ontbreekt, gebruik de default
    // (16:00 voor offerte-flow, undefined voor handmatige bulk-schedule).
    const startTimeRaw = event.start_time || options.defaultStartTime || '16:00:00';
    const eventStartISO = composeEventStart(event.date, startTimeRaw);
    if (!eventStartISO) {
        return emptyResult({ ok: false, reason: 'no_date' });
    }

    // 2. Idempotency / force handling
    let deletedCount = 0;
    if (!force) {
        // Idempotent: als er al server_recipe-tasks bestaan voor dit event, niets doen.
        const { count: existingCount } = await supabase
            .from('prep_tasks')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', eventId)
            .eq('qty_source', 'server_recipe');
        if ((existingCount ?? 0) > 0) {
            return {
                ok: true,
                taskCount: 0,
                matchedTemplates: 0,
                fallbackCount: 0,
                deletedCount: 0,
                tasks: [],
            };
        }
    } else if (!options.dryRun) {
        const { count: delCount, error: delErr } = await supabase
            .from('prep_tasks')
            .delete({ count: 'exact' })
            .eq('event_id', eventId)
            .eq('qty_source', 'server_recipe');
        if (delErr) {
            return emptyResult({ ok: false, reason: 'db_error', error: delErr.message });
        }
        deletedCount = delCount ?? 0;
    }

    // 3. Resolve dish-ids voor dit event (uit offerte.menu_selectie of event.menu).
    const dishIds = await resolveDishIdsForEvent(
        supabase,
        orgId,
        event as { id: number; offerte_id?: number | null; menu?: unknown },
        options.onlyGerechtIds ?? null,
    );
    if (dishIds.length === 0) {
        return emptyResult({ ok: true, reason: 'no_dishes' });
    }

    // 4. Load gerechten (org-scoped)
    const { data: dishes, error: dishErr } = await supabase
        .from('gerechten')
        .select('id, naam, porties, ingredient_costs')
        .in('id', dishIds)
        .eq('organization_id', orgId);
    if (dishErr) {
        return emptyResult({ ok: false, reason: 'db_error', error: dishErr.message });
    }
    if (!dishes || dishes.length === 0) {
        return emptyResult({ ok: true, reason: 'no_gerechten_match' });
    }

    // 5. Production-plan (qty per ingredient per gerecht)
    const productionPlan = calculateProductionPlan({
        guests: event.guests,
        dishes: (dishes as DishRow[]).map((d) => ({
            gerecht_id: d.id,
            gerecht_naam: d.naam,
            ingredients: d.ingredient_costs ?? [],
        })),
    });

    // 6. Stations + courses ophalen (course_id voor P0-3-coupling)
    const [stationsRes, coursesRes] = await Promise.all([
        supabase
            .from('kitchen_stations')
            .select('id, type, sort_order')
            .eq('organization_id', orgId)
            .eq('archived', false),
        supabase
            .from('courses')
            .select('id, event_id, gerecht_id')
            .eq('event_id', eventId),
    ]);

    const stationByType = new Map<string, number>();
    for (const s of (stationsRes.data ?? []) as Array<{ id: number; type: string; sort_order: number }>) {
        if (!stationByType.has(s.type)) stationByType.set(s.type, s.id);
    }
    const courseByGerecht = new Map<string, number>();
    for (const c of (coursesRes.data ?? []) as CourseRow[]) {
        if (c.gerecht_id && !courseByGerecht.has(c.gerecht_id)) {
            courseByGerecht.set(c.gerecht_id, c.id);
        }
    }

    // 6b. Componenten per gerecht ophalen (kookbord v2). Gerechten mét
    //     gekoppelde food-componenten krijgen component-taken; de rest valt
    //     terug op template/fallback. quantity_used geldt per gerecht-batch
    //     van `porties` porties → schaal met guests/porties.
    const { data: gcData } = await supabase
        .from('gerecht_components')
        .select('gerecht_id, quantity_used, unit, components(id, name, type, category, prep_minutes)')
        .in('gerecht_id', dishIds)
        .eq('organization_id', orgId);

    interface GcRow {
        gerecht_id: string;
        quantity_used: number | null;
        unit: string | null;
        components: {
            id: number;
            name: string;
            type: string | null;
            category: string | null;
            prep_minutes: number | null;
        } | null;
    }
    const componentsByDish = new Map<string, GcRow[]>();
    for (const row of ((gcData ?? []) as unknown as GcRow[])) {
        if (!row.components) continue;
        if (row.components.category === 'non_food') continue; // materiaal ≠ kooktaak
        const arr = componentsByDish.get(row.gerecht_id) ?? [];
        arr.push(row);
        componentsByDish.set(row.gerecht_id, arr);
    }

    /* 6c. Ontlede receptstappen ophalen (golf 2).
       Een sjabloon is een gok op de naam van het gerecht — "pulled pork" komt
       uit op pekel→rub→smoke omdat dat meestal klopt. Een ontlede receptstap is
       geen gok: die staat in dit recept, is door Mathijs goedgekeurd, en weet
       hoeveel ervan handwerk is en waar het gebeurt. Waar allebei bestaat wint
       de stap, en het sjabloon blijft liggen voor de gerechten die nog niet
       ontleed zijn. */
    const { data: stapData, error: stapErr } = await supabase
        .from('recipe_steps')
        .select('id, gerecht_id, step_order, tekst, actie, prep_group, duur_actief_min, duur_passief_min, plaats, toezicht_nodig, station, apparaat, techniek_slug, temp_doel_c, ingredient_ref, hoeveelheid, eenheid')
        .in('gerecht_id', dishIds)
        .eq('organization_id', orgId)
        .order('step_order');
    /* Een fout hier mag het plannen niet blokkeren: dan valt alles terug op de
       sjablonen die er altijd al waren. Wel eerlijk melden in het resultaat. */
    const stappenPerGerecht = new Map<string, ReceptStap[]>();
    if (!stapErr) {
        for (const row of ((stapData ?? []) as Array<ReceptStap & { gerecht_id: string | null }>)) {
            if (!row.gerecht_id) continue;
            const arr = stappenPerGerecht.get(row.gerecht_id) ?? [];
            arr.push(row);
            stappenPerGerecht.set(row.gerecht_id, arr);
        }
    }

    // 7. Genereer task rows per gerecht
    const taskRows: ScheduledTaskRow[] = [];
    let matchedTemplates = 0;
    let fallbackCount = 0;
    let componentCount = 0;
    let stapCount = 0;

    /* Component-pass — bundeling BINNEN het event: zelfde component voor
       meerdere gerechten → één taak met opgetelde hoeveelheid ("pot mayo is
       toch open"). batch_key bundelt dezelfde component over events op
       dezelfde dag heen in de UI. Hoeveelheid = quantity_used × guests/porties,
       server-berekend — nooit AI. */
    const dishesWithComponents = new Set<string>();
    const compGroups = new Map<number, {
        component: NonNullable<GcRow['components']>;
        totalQty: number;
        unit: string | null;
        dishNames: string[];
        dishIds: string[];
    }>();
    for (const dish of dishes as DishRow[]) {
        const comps = componentsByDish.get(dish.id);
        if (!comps || comps.length === 0) continue;
        dishesWithComponents.add(dish.id);
        /* quantity_used is de dosering PER GAST (zie de canon in lib/gerecht-kosten.ts),
           dus je vermenigvuldigt met het aantal gasten — niet met gasten ÷ porties.
           Dat laatste stond hier en leverde bij een gerecht op de standaard 10 porties
           precies 10x te weinig op: 750 g inkopen en prepen voor 50 man waar 7,5 kg
           nodig was. `porties` beschrijft de vrije recepttekst, niet de componenten. */
        for (const row of comps) {
            const comp = row.components!;
            const qty = componentHoeveelheidVoorGasten(row.quantity_used ?? 0, event.guests);
            const existing = compGroups.get(comp.id);
            if (existing) {
                existing.totalQty += qty;
                existing.dishNames.push(dish.naam);
                existing.dishIds.push(dish.id);
            } else {
                compGroups.set(comp.id, {
                    component: comp,
                    totalQty: qty,
                    unit: row.unit,
                    dishNames: [dish.naam],
                    dishIds: [dish.id],
                });
            }
        }
    }

    for (const group of compGroups.values()) {
        const comp = group.component;
        const boughtIn = comp.type === 'bought_in';
        const phase = boughtIn ? 'koud' : componentPhase(comp.name);
        const stationType = boughtIn ? 'koud' : componentStationType(comp.name);
        const scheduledAt = scheduledAtForPhase(phase, { eventStart: eventStartISO });
        const dishLabel = group.dishNames.length > 2
            ? `${group.dishNames.slice(0, 2).join(' + ')} +${group.dishNames.length - 2}`
            : group.dishNames.join(' + ');
        const singleDish = group.dishIds.length === 1 ? group.dishIds[0] : null;

        componentCount++;
        taskRows.push({
            event_id: eventId,
            organization_id: orgId,
            text: `${boughtIn ? 'Klaarzetten: ' : ''}${comp.name} — ${dishLabel}`,
            phase,
            scheduled_at: scheduledAt,
            station_id: stationByType.get(stationType) ?? null,
            gerecht_id: singleDish,
            course_id: singleDish ? courseByGerecht.get(singleDish) ?? null : null,
            target_qty: group.totalQty > 0 ? roundQty(group.totalQty) : null,
            target_unit: group.totalQty > 0 ? group.unit : null,
            qty_source: 'server_recipe',
            priority: 50,
            status: 'planned',
            dagen: dagenBeforeEvent(scheduledAt, eventStartISO),
            component_id: comp.id,
            duration_min: comp.prep_minutes ?? (boughtIn ? 10 : 30),
            batch_key: `comp:${comp.id}:${event.date}`,
            /* `prep_minutes` zegt hoe lang een component kost, niet hoeveel
               daarvan handwerk is. Dat splitsen we niet zelf uit. */
            duur_actief_min: null,
            duur_passief_min: null,
            prep_group: null,
            plaats: null,
            toezicht_nodig: null,
            recipe_step_id: null,
        });
    }

    /* Stap-pass — één taak per ontlede receptstap, teruggerekend over de keten
       van dít recept in plaats van via de vaste lead-times per fase. */
    for (const dish of dishes as DishRow[]) {
        const stappen = stappenPerGerecht.get(dish.id);
        if (!stappen || stappen.length === 0) continue;
        const courseId = courseByGerecht.get(dish.id) ?? null;
        const planning = planStappenTerug(stappen, eventStartISO);

        for (const g of planning.stappen) {
            const qty = componentHoeveelheidVoorGasten(g.stap.hoeveelheid ?? 0, event.guests);
            stapCount++;
            taskRows.push({
                event_id: eventId,
                organization_id: orgId,
                text: `${dish.naam} — ${g.stap.tekst}`,
                phase: g.fase,
                scheduled_at: g.startISO,
                station_id: stationByType.get(g.stationType as KitchenStationType) ?? null,
                gerecht_id: dish.id,
                course_id: courseId,
                /* hoeveelheid is per gast, zelfde canon als quantity_used. */
                target_qty: qty > 0 ? roundQty(qty) : null,
                target_unit: qty > 0 ? g.stap.eenheid ?? null : null,
                qty_source: 'server_recipe',
                /* Stappen met toezicht mogen niet wegzakken in de lijst. */
                priority: g.stap.toezicht_nodig ? 30 : 50,
                status: 'planned',
                dagen: dagenBeforeEvent(g.startISO, eventStartISO),
                component_id: null,
                /* Alleen een opgeschreven duur belandt hier. Bij een schatting
                   blijft dit leeg: de plaatsingsduur is goed genoeg om de stap
                   op de tijdlijn te zetten, maar niet goed genoeg om als
                   werkduur in de keuken te tonen. Het scherm zegt dan "duur
                   onbekend" in plaats van een kwartier te claimen. */
                duration_min: g.duur.bron === 'recept' ? g.duur.plaatsingMin : null,
                /* Dezelfde bewerking over recepten heen binnen één dag. */
                batch_key: prepGroupBatchKey(g.stap.prep_group, event.date),
                /* Alleen wat de bron echt zei — een geschatte plaatsingsduur
                   belandt bewust NIET in deze twee kolommen. */
                duur_actief_min: g.duur.actiefMin,
                duur_passief_min: g.duur.passiefMin,
                prep_group: g.stap.prep_group ?? null,
                plaats: g.plaats,
                toezicht_nodig: g.stap.toezicht_nodig ?? null,
                recipe_step_id: g.stap.id,
            });
        }
    }

    /* Template-taken (bv. het volledige rook-spoor van een zalm of brisket)
       blijven naast component-taken bestaan — componenten vullen aan.
       Alleen de generieke fallback vervalt als componenten het gerecht dekken. */
    for (const dish of dishes as DishRow[]) {
        /* Ontleed recept aanwezig → de stap-pass hierboven heeft dit gerecht al
           gedaan, mét handtijd, plaats en groepeersleutel. Een sjabloon eroverheen
           zou dezelfde handelingen een tweede keer op het bord zetten. */
        if ((stappenPerGerecht.get(dish.id)?.length ?? 0) > 0) continue;
        const template = findTemplateForDish(dish.naam);
        const courseId = courseByGerecht.get(dish.id) ?? null;
        const ingredientForDish = productionPlan.filter((p) => p.gerecht_id === dish.id);

        if (!template) {
            if (dishesWithComponents.has(dish.id)) continue; // componenten dekken dit gerecht
            // Fallback: één generic prep-taak per gerecht
            fallbackCount++;
            taskRows.push({
                event_id: eventId,
                organization_id: orgId,
                text: `Voorbereiden: ${dish.naam}`,
                phase: 'other',
                scheduled_at: scheduledAtForPhase('other', { eventStart: eventStartISO }),
                station_id: stationByType.get('prep') ?? null,
                gerecht_id: dish.id,
                course_id: courseId,
                target_qty: ingredientForDish.reduce((sum, l) => sum + l.target_qty, 0) || null,
                target_unit: ingredientForDish[0]?.target_unit ?? null,
                qty_source: 'server_recipe',
                priority: 50,
                status: 'planned',
                dagen: dagenBeforeEvent(scheduledAtForPhase('other', { eventStart: eventStartISO }), eventStartISO),
                component_id: null,
                duration_min: 30,
                batch_key: null,
                duur_actief_min: null,
                duur_passief_min: null,
                prep_group: null,
                plaats: null,
                toezicht_nodig: null,
                recipe_step_id: null,
            });
            continue;
        }

        // Template-driven DAG
        matchedTemplates++;
        for (const step of template.steps) {
            const stationId = step.station_type
                ? stationByType.get(step.station_type as KitchenStationType) ?? null
                : null;
            const offsetMin = resolveOffsetMinutes(step);
            const scheduledAt = scheduledAtForPhase(step.phase, {
                eventStart: eventStartISO,
                customOffsetMinutes: offsetMin,
            });

            taskRows.push({
                event_id: eventId,
                organization_id: orgId,
                text: `${dish.naam} — ${step.text}`,
                phase: step.phase,
                scheduled_at: scheduledAt,
                station_id: stationId,
                gerecht_id: dish.id,
                course_id: courseId,
                target_qty: stepCarriesQty(step) && ingredientForDish.length > 0
                    ? ingredientForDish.reduce((sum, l) => sum + l.target_qty, 0)
                    : null,
                target_unit: stepCarriesQty(step) ? ingredientForDish[0]?.target_unit ?? null : null,
                qty_source: 'server_recipe',
                priority: stepPriority(step),
                status: 'planned',
                dagen: dagenBeforeEvent(scheduledAt, eventStartISO),
                component_id: null,
                duration_min: templateStepDuration(step),
                batch_key: null,
                /* Een sjabloon kent alleen een doorlooptijd per fase. Hoeveel
                   daarvan handwerk is weet het niet, dus zegt het niets. */
                duur_actief_min: null,
                duur_passief_min: null,
                prep_group: null,
                plaats: null,
                toezicht_nodig: null,
                recipe_step_id: null,
            });
        }
    }

    const stapDishCount = dishes.filter(
        (d) => (stappenPerGerecht.get((d as DishRow).id)?.length ?? 0) > 0,
    ).length;

    if (options.dryRun) {
        return {
            ok: true,
            taskCount: taskRows.length,
            matchedTemplates,
            fallbackCount,
            componentCount,
            stapCount,
            stapDishCount,
            deletedCount,
            tasks: taskRows,
        };
    }

    // 8. Insert in DB
    if (taskRows.length === 0) {
        return {
            ok: true,
            taskCount: 0,
            matchedTemplates,
            fallbackCount,
            componentCount,
            stapCount,
            stapDishCount,
            deletedCount,
            tasks: [],
        };
    }

    /* PostgREST weigert een hele insert zodra één kolomnaam niet bestaat. Op een
       omgeving waar migratie 20260901030000 nog niet gedraaid is zou dat het
       plannen volledig stukmaken voor iets wat alleen extra informatie is.
       Daarom eerst kijken of de kolommen er zijn, en zo niet: zonder verder. */
    const stapKolommenAanwezig = await heeftStapKolommen(supabase);
    const teSchrijven = stapKolommenAanwezig ? taskRows : taskRows.map(zonderStapKolommen);

    const { error: insErr } = await supabase.from('prep_tasks').insert(teSchrijven);
    if (insErr) {
        return emptyResult({ ok: false, reason: 'db_error', error: insErr.message });
    }

    return {
        ok: true,
        taskCount: taskRows.length,
        matchedTemplates,
        fallbackCount,
        componentCount,
        stapCount,
        stapDishCount,
        deletedCount,
        tasks: taskRows,
    };
}

/**
 * Bestaan de golf-2-kolommen op deze database?
 *
 * Eén select van één rij; PostgREST antwoordt met een fout zodra de kolom niet
 * in het schema-cache zit. Goedkoper dan information_schema en het meet precies
 * wat er straks misgaat.
 */
async function heeftStapKolommen(supabase: SupabaseClient): Promise<boolean> {
    const { error } = await supabase
        .from('prep_tasks')
        .select(STAP_KOLOMMEN.join(','))
        .limit(1);
    return !error;
}

/** Dezelfde rij zonder de vijf nieuwe kolommen — voor een oude database. */
function zonderStapKolommen(row: ScheduledTaskRow): Omit<ScheduledTaskRow, typeof STAP_KOLOMMEN[number]> {
    const kopie: Partial<ScheduledTaskRow> = { ...row };
    for (const k of STAP_KOLOMMEN) delete kopie[k];
    return kopie as Omit<ScheduledTaskRow, typeof STAP_KOLOMMEN[number]>;
}

/* ─── Component-routing (deterministisch, uitlegbaar — geen AI) ─────── */

/** Fase-afleiding uit de component-naam. Sauzen/dressings → warm (fornuis),
 *  rook-componenten → smoke, rest → koud (mise en place). */
function componentPhase(name: string): PrepTaskPhase {
    const n = name.toLowerCase();
    if (/\b(gerookt|rook|smoke)/.test(n)) return 'smoke';
    if (/(saus|mayo|dressing|glaze|jus|crème|creme|room|compote|ketchup)/.test(n)) return 'warm';
    if (/(marinade|marineer)/.test(n)) return 'marinade';
    if (/(rub|kruidenmix)/.test(n)) return 'rub';
    return 'koud';
}

/** Station-routing uit de component-naam — matcht Sam's station-types
 *  (koud/smoker/warm/sauzen/expeditie). */
function componentStationType(name: string): string {
    const n = name.toLowerCase();
    if (/(saus|mayo|dressing|glaze|jus|compote|ketchup)/.test(n)) return 'sauzen';
    if (/\b(gerookt|rook|smoke)/.test(n)) return 'smoker';
    if (/(bak|grill|frituur|warm)/.test(n)) return 'warm';
    return 'koud';
}

function roundQty(qty: number): number {
    return Math.round(qty * 100) / 100;
}

/** Werkduur van een template-stap: expliciete override of fase-default. */
function templateStepDuration(step: RecipePhaseStep): number {
    const custom = (step as { customDurationMinutes?: number }).customDurationMinutes;
    if (typeof custom === 'number' && custom > 0) return custom;
    return PHASE_DURATION_MINUTES[step.phase] ?? 30;
}

/* ─── Helpers ───────────────────────────────────────────────── */

function emptyResult(over: Partial<BulkScheduleResult>): BulkScheduleResult {
    return {
        ok: false,
        taskCount: 0,
        matchedTemplates: 0,
        fallbackCount: 0,
        deletedCount: 0,
        tasks: [],
        ...over,
    };
}

function composeEventStart(date: string, time: string): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const t = /^\d{2}:\d{2}(:\d{2})?$/.test(time)
        ? (time.length === 5 ? `${time}:00` : time)
        : null;
    if (!t) return null;
    const isoLike = `${date}T${t}`;
    const d = new Date(isoLike);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* Productie-data kent 3 menu-shapes (gevonden 2026-06-12):
 *  1. offerte.menu_selectie = {categorie: ["Crispy Zalm", ...]} — NAMEN, geen ids
 *  2. events.menu = [6, 11, 13] — recepten-ids als NUMMERS (legacy)
 *  3. events.menu = '"[]"' — dubbel-geëncodeerde JSON-string
 * En de offerte↔event-link loopt via events.offerte_id; offertes.event_id is
 * in de praktijk nooit gevuld. Deze resolver dekt alle shapes. */
async function resolveDishIdsForEvent(
    supabase: SupabaseClient,
    orgId: string,
    event: { id: number; offerte_id?: number | null; menu?: unknown },
    onlyGerechtIds: string[] | null,
): Promise<string[]> {
    if (onlyGerechtIds && onlyGerechtIds.length > 0) return onlyGerechtIds;

    const ids = new Set<string>();
    const names = new Set<string>();

    // 1. Offerte zoeken: eerst offertes.event_id, anders events.offerte_id.
    let menuSelectie: unknown = null;
    const { data: viaEventId } = await supabase
        .from('offertes')
        .select('id, menu_selectie')
        .eq('event_id', event.id)
        .maybeSingle();
    if (viaEventId?.menu_selectie) {
        menuSelectie = viaEventId.menu_selectie;
    } else if (event.offerte_id != null) {
        const { data: viaOfferteId } = await supabase
            .from('offertes')
            .select('id, menu_selectie')
            .eq('id', event.offerte_id)
            .maybeSingle();
        menuSelectie = viaOfferteId?.menu_selectie ?? null;
    }
    collectFromMenuSelectie(menuSelectie, ids, names);

    // 2. Fallback: event.menu (recepten-nummers of uuid/naam-strings)
    if (ids.size === 0 && names.size === 0) {
        await collectFromEventMenu(supabase, orgId, event.menu, ids, names);
    }

    // 3. Namen → gerecht-uuid's via genormaliseerde naam-match (org-scoped)
    if (names.size > 0) {
        const { data: gerechten } = await supabase
            .from('gerechten')
            .select('id, naam')
            .eq('organization_id', orgId);
        for (const naam of names) {
            const id = matchGerechtIdByName(naam, (gerechten ?? []) as Array<{ id: string; naam: string }>);
            if (id) ids.add(id);
        }
    }

    return Array.from(ids);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function addIdOrName(value: string, ids: Set<string>, names: Set<string>): void {
    const v = value.trim();
    if (!v) return;
    if (UUID_RE.test(v)) ids.add(v);
    else names.add(v);
}

function collectFromMenuSelectie(raw: unknown, ids: Set<string>, names: Set<string>): void {
    let ms = raw;
    if (typeof ms === 'string') {
        try { ms = JSON.parse(ms); } catch { return; }
    }
    if (!ms || typeof ms !== 'object') return;
    const flat: unknown[] = Array.isArray(ms)
        ? ms
        : Object.values(ms as Record<string, unknown>).flatMap((v) => (Array.isArray(v) ? v : [v]));
    for (const item of flat) {
        if (typeof item === 'string') {
            addIdOrName(item, ids, names);
        } else if (item && typeof item === 'object') {
            const it = item as MenuSelectionItem;
            if (typeof it.gerecht_id === 'string' && it.gerecht_id.length > 0) {
                ids.add(it.gerecht_id);
            } else {
                const naam = it.gerecht_naam ?? it.naam;
                if (typeof naam === 'string' && naam.trim().length > 0) names.add(naam);
            }
        }
    }
}

async function collectFromEventMenu(
    supabase: SupabaseClient,
    orgId: string,
    rawMenu: unknown,
    ids: Set<string>,
    names: Set<string>,
): Promise<void> {
    let menu = rawMenu;
    if (typeof menu === 'string') {
        try { menu = JSON.parse(menu); } catch { return; }
    }
    if (!Array.isArray(menu) || menu.length === 0) return;

    const receptIds: number[] = [];
    for (const v of menu) {
        if (typeof v === 'number' && Number.isFinite(v)) receptIds.push(v);
        else if (typeof v === 'string' && v.length > 0) addIdOrName(v, ids, names);
    }
    if (receptIds.length === 0) return;

    const { data: recepten } = await supabase
        .from('recepten')
        .select('id, naam')
        .in('id', receptIds)
        .eq('organization_id', orgId);
    for (const r of (recepten ?? []) as Array<{ id: number; naam: string | null }>) {
        if (r.naam) names.add(r.naam);
    }
}

function normalizeNaam(s: string): string {
    return s.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* Exported voor unit-tests. Matcht "Bavette" op "Gerookte bavette" en
 * "Sliders" op "Slider van de yoder Smoker." — exact eerst, dan contains
 * (kortste = meest specifiek), met enkelvoud-variant als extra poging. */
export function matchGerechtIdByName(
    zoekNaam: string,
    gerechten: Array<{ id: string; naam: string }>,
): string | null {
    const target = normalizeNaam(zoekNaam);
    if (!target) return null;
    const kandidaten = gerechten
        .map((g) => ({ id: g.id, naam: normalizeNaam(g.naam) }))
        .filter((g) => g.naam.length > 0);

    const varianten = target.endsWith('s') && target.length > 4
        ? [target, target.slice(0, -1)]
        : [target];

    for (const t of varianten) {
        const exact = kandidaten.find((g) => g.naam === t);
        if (exact) return exact.id;
    }
    for (const t of varianten) {
        if (t.length < 4) continue;
        const contains = kandidaten
            .filter((g) => g.naam.includes(t) || (g.naam.length >= 4 && t.includes(g.naam)))
            .sort((a, b) => a.naam.length - b.naam.length);
        if (contains.length > 0) return contains[0].id;
    }
    return null;
}

function stepCarriesQty(step: RecipePhaseStep): boolean {
    return ['smoke', 'grill', 'koud', 'warm', 'plate'].includes(step.phase);
}

function stepPriority(step: RecipePhaseStep): number {
    const map: Record<string, number> = {
        inkoop: 10,
        pekel: 25,
        rub: 35,
        marinade: 35,
        smoke: 55,
        grill: 60,
        warm: 65,
        koud: 65,
        plate: 80,
        service: 100,
        other: 50,
    };
    return map[step.phase] ?? 50;
}

function dagenBeforeEvent(scheduledAt: string, eventStartISO: string): number {
    const d1 = new Date(scheduledAt).getTime();
    const d2 = new Date(eventStartISO).getTime();
    if (!Number.isFinite(d1) || !Number.isFinite(d2)) return 0;
    const diffDays = Math.floor((d2 - d1) / (24 * 60 * 60 * 1000));
    return Math.max(-1, diffDays);
}
