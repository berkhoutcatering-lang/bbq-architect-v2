import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/* eslint-disable @typescript-eslint/no-explicit-any */

async function generateInkooplijst(params: Record<string, any>): Promise<Record<string, any>> {
    const event_id = params.event_id;
    if (!event_id) return { error: 'event_id is verplicht' };
    if (!supabase) return { error: 'Geen database verbinding' };

    const eventRes = await supabase.from('events').select('*').eq('id', event_id).single();
    if (eventRes.error || !eventRes.data) return { error: 'Event niet gevonden (id: ' + event_id + ')' };
    const event = eventRes.data;
    const gasten = event.guests || 1;

    const menuIds = event.menu || [];
    let recepten: any[] = [];
    if (menuIds.length > 0) {
        const recRes = await supabase.from('recepten').select('*').in('id', menuIds);
        recepten = recRes.data || [];
    }

    const invRes = await supabase.from('inventory').select('naam,current_stock,unit,purchase_price');
    const inventory = invRes.data || [];
    const invMap: Record<string, any> = {};
    inventory.forEach(function (i: any) { invMap[(i.naam || '').toLowerCase().trim()] = i; });

    const ingredientMap: Record<string, any> = {};
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
                ingredientMap[key] = {
                    naam: ing.naam,
                    benodigdheid: 0,
                    eenheid: ing.eenheid || '',
                    in_voorraad: invMap[key] ? (invMap[key].current_stock || 0) : 0,
                    prijs_pp: invMap[key] ? (invMap[key].purchase_price || 0) : 0,
                    te_bestellen: 0,
                    voor_recepten: [],
                };
            }
            ingredientMap[key].benodigdheid += (parseFloat(ing.hoeveelheid) || 0) * multiplier;
            if (!ingredientMap[key].voor_recepten.includes(recept.naam)) {
                ingredientMap[key].voor_recepten.push(recept.naam);
            }
        });
    });

    Object.values(ingredientMap).forEach(function (ing: any) {
        ing.te_bestellen = Math.max(0, ing.benodigdheid - ing.in_voorraad);
        ing.benodigdheid = Math.round(ing.benodigdheid * 100) / 100;
        ing.te_bestellen = Math.round(ing.te_bestellen * 100) / 100;
        ing.in_voorraad = Math.round(ing.in_voorraad * 100) / 100;
    });

    const items = Object.values(ingredientMap)
        .filter(function (i: any) { return i.benodigdheid > 0; })
        .sort(function (a: any, b: any) { return a.naam.localeCompare(b.naam); });

    const totaalKosten = items.reduce(function (sum: number, i: any) { return sum + (i.te_bestellen * i.prijs_pp); }, 0);

    return {
        event: { id: event.id, naam: event.name, datum: event.date, gasten, locatie: event.location },
        items,
        totaal_items: items.length,
        te_bestellen_items: items.filter(function (i: any) { return i.te_bestellen > 0; }).length,
        al_in_voorraad: items.filter(function (i: any) { return i.te_bestellen === 0; }).length,
        geschatte_inkoop_kosten: Math.round(totaalKosten * 100) / 100,
        recepten_count: recepten.length,
    };
}

async function generateEventBriefing(params: Record<string, any>): Promise<Record<string, any>> {
    const event_id = params.event_id;
    if (!event_id) return { error: 'event_id is verplicht' };
    if (!supabase) return { error: 'Geen database verbinding' };

    const eventRes = await supabase.from('events').select('*').eq('id', event_id).single();
    if (eventRes.error || !eventRes.data) return { error: 'Event niet gevonden' };
    const event = eventRes.data;

    const menuIds = event.menu || [];
    let recepten: any[] = [];
    if (menuIds.length > 0) {
        const recRes = await supabase.from('recepten').select('id,naam,categorie,porties,preptime').in('id', menuIds);
        recepten = recRes.data || [];
    }

    const prepRes = await supabase.from('prep_tasks').select('*').eq('event_id', event_id).order('dagen');
    const prep_tasks = prepRes.data || [];

    const offRes = await supabase.from('offertes').select('id,nummer,status,basis_prijs_pp,aantal_gasten,korting,items').eq('event_id', event_id).limit(1);
    const offerte = offRes.data && offRes.data[0] ? offRes.data[0] : null;

    const hacRes = await supabase.from('haccp_records').select('id,datum,tijd,wat,temp,status').eq('event_id', event_id).order('datum').limit(20);
    const haccp = hacRes.data || [];

    return {
        briefing_datum: new Date().toISOString().slice(0, 10),
        event: {
            id: event.id, naam: event.name, datum: event.date, gasten: event.guests,
            locatie: event.location, status: event.status,
            contactpersoon: event.contactpersoon || event.contact || null,
            telefoon: event.telefoon || event.phone || null,
            notities: event.notes || event.notities || null,
        },
        menu: recepten,
        prep_taken_klaar: prep_tasks.filter(function (t: any) { return t.done; }).length,
        prep_taken_open: prep_tasks.filter(function (t: any) { return !t.done; }).length,
        prep_tasks: prep_tasks.slice(0, 12),
        offerte,
        haccp_count: haccp.length,
    };
}

async function getEventWinstgevendheid(params: Record<string, any>): Promise<Record<string, any>> {
    const event_id = params.event_id;
    if (!event_id) return { error: 'event_id is verplicht' };
    if (!supabase) return { error: 'Geen database verbinding' };

    const eventRes = await supabase.from('events').select('*').eq('id', event_id).single();
    if (eventRes.error || !eventRes.data) return { error: 'Event niet gevonden' };
    const event = eventRes.data;

    const facRes = await supabase.from('facturen').select('*').eq('event_id', event_id);
    const facturen = facRes.data || [];

    const urenRes = await supabase.from('time_logs').select('*').eq('event_id', event_id);
    const time_logs = urenRes.data || [];

    const inkoopRes = await supabase.from('inkooplijsten').select('*').eq('event_id', event_id);
    const inkoop = inkoopRes.data || [];

    function calcItemsTotaal(items: any): number {
        if (!items) return 0;
        if (typeof items === 'string') { try { items = JSON.parse(items); } catch { return 0; } }
        return (Array.isArray(items) ? items : []).reduce(function (s: number, i: any) {
            return s + (parseFloat(i.prijs || i.price || 0) * parseFloat(i.qty || i.aantal || 1));
        }, 0);
    }

    const omzet = facturen.reduce(function (s: number, f: any) { return s + calcItemsTotaal(f.items); }, 0);
    const inkoopKosten = inkoop.reduce(function (s: number, l: any) { return s + calcItemsTotaal(l.items); }, 0);

    const DEFAULT_UURLOON = 15;
    let totaalUren = 0;
    let arbeidskosten = 0;
    time_logs.forEach(function (t: any) {
        if (t.start_time && t.end_time) {
            const uren = Math.max(0, (new Date(t.end_time).getTime() - new Date(t.start_time).getTime()) / 3600000);
            totaalUren += uren;
            arbeidskosten += uren * (parseFloat(t.uurloon) || DEFAULT_UURLOON);
        }
    });

    const brutoMarge = omzet - inkoopKosten;
    const nettoMarge = omzet - inkoopKosten - arbeidskosten;
    const brutoMargePerc = omzet > 0 ? Math.round(brutoMarge / omzet * 100) : null;
    const nettoMargePerc = omzet > 0 ? Math.round(nettoMarge / omzet * 100) : null;

    function fmt(n: number): number { return Math.round(n * 100) / 100; }

    return {
        event: { id: event.id, naam: event.name, datum: event.date, gasten: event.guests },
        omzet: fmt(omzet),
        inkoopKosten: fmt(inkoopKosten),
        arbeidskosten: fmt(arbeidskosten),
        totaalUren: Math.round(totaalUren * 10) / 10,
        brutoMarge: fmt(brutoMarge),
        nettoMarge: fmt(nettoMarge),
        brutoMargePerc,
        nettoMargePerc,
        facturen_count: facturen.length,
        inkoop_count: inkoop.length,
        urenlog_count: time_logs.length,
        datakwaliteit: {
            heeft_facturen: facturen.length > 0,
            heeft_inkoop: inkoop.length > 0,
            heeft_uren: urenRes.data !== null && urenRes.data.length > 0,
        },
    };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const body = await req.json();
        const { tool, params } = body;
        let result: Record<string, any>;

        switch (tool) {
            case 'generateInkooplijst':
                result = await generateInkooplijst(params || {});
                break;
            case 'generateEventBriefing':
                result = await generateEventBriefing(params || {});
                break;
            case 'getEventWinstgevendheid':
                result = await getEventWinstgevendheid(params || {});
                break;
            default:
                return NextResponse.json({ error: 'Onbekende tool: ' + tool }, { status: 400 });
        }

        return NextResponse.json({ result });
    } catch (err: any) {
        console.error('[AI Execute API] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
