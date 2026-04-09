/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================
// BBQ Architect — Acceptance Workflow
// Automatische taken bij offerte-acceptatie:
// 1. Factuur aanmaken
// 2. Prep-taken genereren
// 3. Inkooplijst + voorraadcheck
// 4. HACCP-sjablonen per gerecht
// =============================================

import { supabase } from '@/lib/supabase';
import { today, addDays, genNummer, nextNummer } from '@/lib/utils';

export interface WorkflowParams {
    eventId: number;
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
}

// ── 1. Auto-create factuur ──
async function autoCreateFactuur(params: WorkflowParams): Promise<{ success: boolean; message: string }> {
    try {
        if (!supabase) return { success: false, message: 'Geen database verbinding' };

        // Check if factuur already exists for this offerte
        const { data: existing } = await supabase
            .from('facturen')
            .select('id')
            .eq('client_naam', params.offerteData.client_naam)
            .eq('items', JSON.stringify(params.offerteData.items))
            .limit(1);

        if (existing && existing.length > 0) {
            return { success: true, message: 'Factuur bestond al' };
        }

        const betaaltermijn = (params.settings && params.settings.betaaltermijn) || 14;
        const prefix = (params.settings && params.settings.factuur_prefix) || 'F2026-';
        const nummer = nextNummer(prefix, params.facturenNummers);

        const { error } = await supabase.from('facturen').insert({
            nummer: nummer,
            status: 'concept',
            client_naam: params.offerteData.client_naam || '',
            client_adres: params.offerteData.client_adres || '',
            datum: today(),
            vervaldatum: addDays(today(), betaaltermijn),
            items: params.offerteData.items || []
        });

        if (error) return { success: false, message: 'Factuur fout: ' + error.message };
        return { success: true, message: 'Factuur ' + nummer + ' aangemaakt' };
    } catch (e: any) {
        return { success: false, message: 'Factuur fout: ' + (e.message || '') };
    }
}

// ── 2. Auto-generate prep tasks ──
async function autoGeneratePrepTasks(params: WorkflowParams): Promise<{ success: boolean; message: string; count: number }> {
    try {
        if (!supabase) return { success: false, message: 'Geen database verbinding', count: 0 };

        // Get event data
        const { data: event } = await supabase.from('events').select('*').eq('id', params.eventId).single();
        if (!event) return { success: false, message: 'Event niet gevonden', count: 0 };

        const eventDate = new Date(event.date);
        const menuIds: string[] = Array.isArray(event.menu) ? event.menu : [];

        // Get recepten if menu has items
        let recepten: any[] = [];
        if (menuIds.length > 0) {
            const { data: receptenData } = await supabase.from('recepten').select('*').in('naam', menuIds);
            recepten = receptenData || [];
        }

        // Generate prep tasks based on timeline
        const tasks: { event_id: number; text: string; dagen: number; done: boolean }[] = [];

        // D-3: Bestelling & check
        tasks.push({ event_id: params.eventId, text: 'Voorraad check en ingredienten bestellen', dagen: -3, done: false });
        tasks.push({ event_id: params.eventId, text: 'Materieel controleren en inladen', dagen: -3, done: false });
        recepten.filter(function (r: any) { return r.preptime && r.preptime > 120; }).forEach(function (r: any) {
            tasks.push({ event_id: params.eventId, text: r.naam + ': bestel vers vlees, check ingredienten', dagen: -3, done: false });
        });

        // D-2: Marineren & rubben
        tasks.push({ event_id: params.eventId, text: 'Rubs en sauzen aanmaken', dagen: -2, done: false });
        tasks.push({ event_id: params.eventId, text: 'Rookhout weken', dagen: -2, done: false });
        recepten.filter(function (r: any) { return r.preptime && r.preptime > 60; }).forEach(function (r: any) {
            tasks.push({ event_id: params.eventId, text: r.naam + ': marineren/rubben (' + r.preptime + ' min)', dagen: -2, done: false });
        });

        // D-1: Mise-en-place
        tasks.push({ event_id: params.eventId, text: 'Smoker/BBQ testen', dagen: -1, done: false });
        tasks.push({ event_id: params.eventId, text: 'Bus inladen', dagen: -1, done: false });
        tasks.push({ event_id: params.eventId, text: 'Service materiaal checken', dagen: -1, done: false });
        recepten.forEach(function (r: any) {
            tasks.push({ event_id: params.eventId, text: r.naam + ': mise-en-place, portioneren voor ' + (event.guests || 50) + ' gasten', dagen: -1, done: false });
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
        return { success: true, message: tasks.length + ' prep-taken aangemaakt', count: tasks.length };
    } catch (e: any) {
        return { success: false, message: 'Prep fout: ' + (e.message || ''), count: 0 };
    }
}

// ── 3. Auto-generate inkooplijst ──
async function autoGenerateInkooplijst(params: WorkflowParams): Promise<{ success: boolean; message: string }> {
    try {
        if (!supabase) return { success: false, message: 'Geen database verbinding' };

        // Get event data
        const { data: event } = await supabase.from('events').select('*').eq('id', params.eventId).single();
        if (!event) return { success: false, message: 'Event niet gevonden' };

        const gasten = event.guests || 1;
        const menuIds = event.menu || [];

        let recepten: any[] = [];
        if (Array.isArray(menuIds) && menuIds.length > 0) {
            const { data: recData } = await supabase.from('recepten').select('*').in('id', menuIds);
            recepten = recData || [];
        }

        // Get inventory for voorraadcheck
        const { data: invData } = await supabase.from('inventory').select('naam,current_stock,unit');
        const invMap: Record<string, any> = {};
        (invData || []).forEach(function (i: any) { invMap[(i.naam || '').toLowerCase().trim()] = i; });

        // Aggregate ingredients
        const ingredientMap: Record<string, { naam: string; qty: number; unit: string; checked: boolean }> = {};
        recepten.forEach(function (recept: any) {
            const multiplier = gasten / (recept.porties || 1);
            let ingredienten = recept.ingredienten || [];
            if (typeof ingredienten === 'string') {
                try { ingredienten = JSON.parse(ingredienten); } catch { ingredienten = []; }
            }
            ingredienten.forEach(function (ing: any) {
                const key = (ing.naam || '').toLowerCase().trim();
                if (!key) return;
                if (!ingredientMap[key]) {
                    ingredientMap[key] = { naam: ing.naam, qty: 0, unit: ing.eenheid || '', checked: false };
                }
                ingredientMap[key].qty += (parseFloat(ing.hoeveelheid) || 0) * multiplier;
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
async function autoCreateHaccpTemplates(params: WorkflowParams): Promise<{ success: boolean; message: string; count: number }> {
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

// ── Main Workflow Runner ──
export async function runAcceptanceWorkflow(params: WorkflowParams): Promise<WorkflowResult> {
    const results = await Promise.allSettled([
        autoCreateFactuur(params),
        autoGeneratePrepTasks(params),
        autoGenerateInkooplijst(params),
        autoCreateHaccpTemplates(params)
    ]);

    const factuurResult = results[0].status === 'fulfilled' ? results[0].value : { success: false, message: 'Factuur onverwachte fout' };
    const prepResult = results[1].status === 'fulfilled' ? results[1].value : { success: false, message: 'Prep onverwachte fout', count: 0 };
    const inkoopResult = results[2].status === 'fulfilled' ? results[2].value : { success: false, message: 'Inkoop onverwachte fout' };
    const haccpResult = results[3].status === 'fulfilled' ? results[3].value : { success: false, message: 'HACCP onverwachte fout', count: 0 };

    const result: WorkflowResult = {
        factuur: factuurResult,
        prep: prepResult,
        inkoop: inkoopResult,
        haccp: haccpResult
    };

    return result;
}
