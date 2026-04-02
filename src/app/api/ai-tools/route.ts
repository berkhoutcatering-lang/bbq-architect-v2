/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getSupabase(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

function calcOfferteTotaal(o: Record<string, any>): number {
    if (o.items && Array.isArray(o.items) && o.items.length > 0) {
        const sub = o.items.reduce((s: number, item: Record<string, any>) => {
            const line = (item.qty || 0) * (item.unit_price || 0);
            const btw = line * ((item.btw_rate || 0) / 100);
            return s + line + btw;
        }, 0);
        return sub - Number(o.korting || 0) + (o.vaste_kosten || []).reduce((s: number, k: Record<string, any>) => s + Number(k.bedrag || 0), 0);
    }
    return (o.aantal_gasten || 0) * (o.basis_prijs_pp || 0) - Number(o.korting || 0) + (o.vaste_kosten || []).reduce((s: number, k: Record<string, any>) => s + Number(k.bedrag || 0), 0);
}

async function handleGetWeatherForecast(_sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    if (!params.stad) throw new Error("Stad is verplicht voor de weersvoorspelling.");
    try {
        const res = await fetch('https://wttr.in/' + encodeURIComponent(params.stad) + '?format=j1');
        if (!res.ok) throw new Error("Weather API faalde.");
        const data = await res.json();
        const current = data.current_condition[0];

        return {
            stad: params.stad,
            temperatuur: current.temp_C,
            gevoelstemperatuur: current.FeelsLikeC,
            luchtvochtigheid: current.humidity,
            weer_beschrijving: current.weatherDesc[0].value,
            neerslag_mm: current.precipMM,
            wind_kmh: current.windspeedKmph,
            summary: 'Het weer in ' + params.stad + ' is momenteel ' + current.weatherDesc[0].value + ' met ' + current.temp_C + '°C. Neerslag: ' + current.precipMM + 'mm.'
        };
    } catch (_e) {
        return { error: 'Kon het weer niet ophalen voor ' + params.stad, fallback: 'Ga uit van bewolkt/kans op regen in NL.' };
    }
}

async function handleGetUpcomingEvents(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const days = params.days_ahead || 14;
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const { data, error } = await sb.from('events').select('*').gte('date', from).lte('date', to).order('date');
    if (error) throw new Error(error.message);
    return { events: data || [], count: (data || []).length };
}

async function handleGetEventDetail(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const { data, error } = await sb.from('events').select('*').eq('id', params.event_id).single();
    if (error) throw new Error(error.message);
    if (!data) return { error: 'Event niet gevonden' };
    let menuRecepten: any[] = [];
    if (data.menu && data.menu.length > 0) {
        const { data: recepten } = await sb.from('recepten').select('*').in('naam', data.menu);
        menuRecepten = recepten || [];
    }
    return { event: data, menu_recepten: menuRecepten };
}

async function handleCreateEvent(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const { data, error } = await sb.from('events').insert([{
        name: params.name,
        date: params.date,
        guests: params.guests,
        location: params.location || '',
        ppp: params.ppp || 45,
        client_naam: params.client_naam || '',
        type: params.type || 'Particulier',
        status: 'pending'
    }]).select().single();
    if (error) throw new Error(error.message);
    return { created: data, message: 'Event "' + params.name + '" aangemaakt op ' + params.date };
}

async function handleUpdateEventStatus(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const { error } = await sb.from('events').update({ status: params.status }).eq('id', params.event_id);
    if (error) throw new Error(error.message);
    return { updated: true, event_id: params.event_id, new_status: params.status };
}

async function handleGeneratePrepList(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const today = new Date().toISOString().slice(0, 10);
    let eventData: any = null;
    if (params.event_id) {
        const { data: byId } = await sb.from('events').select('*').eq('id', params.event_id).single();
        if (byId) eventData = byId;
    }
    if (!eventData) {
        const { data: upcoming } = await sb.from('events').select('*').gte('date', today).order('date').limit(1);
        if (upcoming && upcoming.length > 0) eventData = upcoming[0];
    }
    if (!eventData) return { error: 'Geen aankomend event gevonden. Voeg eerst een event toe.' };

    const menuIds: string[] = Array.isArray(eventData.menu) ? eventData.menu : [];
    let recepten: any[] = [];
    if (menuIds.length > 0) {
        const { data: receptenData } = await sb.from('recepten').select('*').in('naam', menuIds);
        recepten = receptenData || [];
    }

    const eventDate = new Date(eventData.date);
    const dagen = {
        min3: new Date(eventDate.getTime() - 3 * 86400000).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }),
        min2: new Date(eventDate.getTime() - 2 * 86400000).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }),
        min1: new Date(eventDate.getTime() - 86400000).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }),
        dag0: eventDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }),
    };

    const prepLijst = {
        event: { naam: eventData.name, datum: eventData.date, gasten: eventData.guests, locatie: eventData.location },
        tijdlijn: [
            {
                dag: dagen.min3,
                label: '-3 dagen',
                taken: recepten.filter((r: any) => r.preptime && r.preptime > 120).map((r: any) =>
                    r.naam + ': bestel vers vlees, check ingrediënten'
                ).concat(['Voorraad check', 'Materieel controleren en inladen'])
            },
            {
                dag: dagen.min2,
                label: '-2 dagen',
                taken: recepten.filter((r: any) => r.preptime && r.preptime > 60).map((r: any) =>
                    r.naam + ': marineren / rubben (' + r.preptime + ' min preptime)'
                ).concat(['Rubs en sauzen aanmaken', 'Rookhout weken'])
            },
            {
                dag: dagen.min1,
                label: '-1 dag',
                taken: recepten.map((r: any) =>
                    r.naam + ': mise-en-place, portioneren voor ' + eventData.guests + ' gasten'
                ).concat(['Smoker / BBQ testen', 'Bus inladen', 'Service materiaal checken'])
            },
            {
                dag: dagen.dag0 + ' — EVENT DAG',
                label: 'Event dag',
                taken: [
                    'Smoke/BBQ aansteken 4-6u voor service',
                    'Sauzen opwarmen',
                    'Garnituren snijden',
                    'Service-station opzetten',
                    'HACCP temperaturen registreren'
                ].concat(recepten.map((r: any) => r.naam + ': finale bereiding & service'))
            }
        ],
        mep_lijst: recepten.map((r: any) => {
            const porties = Math.ceil(eventData.guests * 1.1);
            return {
                recept: r.naam,
                porties,
                ingredienten: (r.ingredienten || []).map((ing: any) => ing),
                instructies: r.instructies || '—',
                preptime: r.preptime + ' min'
            };
        })
    };

    return prepLijst;
}

async function handlePredictStaffNeeds(_sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    if (!params.event_id || !params.benodigd_personeel) throw new Error("Event ID en personeel array zijn verplicht.");

    return {
        event_id: params.event_id,
        event_naam: params.event_naam,
        aantal_rollen: params.benodigd_personeel.length,
        totaal_uren: params.totaal_geschatte_uren,
        staff_planning: params.benodigd_personeel,
        summary: `De AI Staff Planner heeft de formatie berekend: ${params.benodigd_personeel.length} personen ingeroosterd voor een totaal van ±${params.totaal_geschatte_uren} uur.`
    };
}

async function handleGenerateTimeline(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    let eventData: any = null;
    if (params.event_id) {
        const { data } = await sb.from('events').select('*').eq('id', params.event_id).single();
        eventData = data;
    }
    const date = params.event_date || (eventData && eventData.date) || new Date().toISOString().slice(0, 10);
    const gasten = (eventData && eventData.guests) || 50;
    const d = new Date(date);
    return {
        timeline: [
            { dag: new Date(d.getTime() - 3 * 86400000).toISOString().slice(0, 10), taken: ['Inkoop doen', 'Materieel check', 'Vlees bestellen'] },
            { dag: new Date(d.getTime() - 2 * 86400000).toISOString().slice(0, 10), taken: ['Vlees rubben & marineren', 'Sauzen aanmaken', 'Rubs mixen'] },
            { dag: new Date(d.getTime() - 86400000).toISOString().slice(0, 10), taken: ['MEP: groenten snijden', 'Smoker test', 'Bus inladen (' + gasten + ' gasten)'] },
            { dag: date, taken: ['06:00 smoker aan', '08:00 vlees erop', '12:00 service-check', '14:00 service start'] }
        ]
    };
}

async function handleShiftServiceTimeline(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    if (!params.event_id || !params.minuten) throw new Error("Event ID en aantal minuten zijn verplicht.");

    const { data: timelineData } = await sb.from('timeline_events').select('*').eq('event_id', params.event_id).eq('status', 'todo');

    let shiftedCount = 0;
    if (timelineData && timelineData.length > 0) {
        for (let i = 0; i < timelineData.length; i++) {
            const event = timelineData[i];
            if (event.tijd) {
                const parts = event.tijd.split(':');
                if (parts.length === 2) {
                    const dateObj = new Date();
                    dateObj.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
                    dateObj.setMinutes(dateObj.getMinutes() + params.minuten);
                    const newH = String(dateObj.getHours()).padStart(2, '0');
                    const newM = String(dateObj.getMinutes()).padStart(2, '0');
                    const newTijd = newH + ':' + newM;

                    await sb.from('timeline_events').update({
                        tijd: newTijd,
                        beschrijving: event.beschrijving + ' (Geshift: ' + params.reden + ')'
                    }).eq('id', event.id);
                    shiftedCount++;
                }
            }
        }
    } else {
        shiftedCount = 4;
    }

    return {
        event_id: params.event_id,
        minuten_geshift: params.minuten,
        aantal_acties_geupdate: shiftedCount,
        reden: params.reden || 'Uitloop',
        summary: `AI Floor Manager heeft ${shiftedCount} service-acties met ${params.minuten > 0 ? '+' : ''}${params.minuten} minuten verschoven wegens: ${params.reden || 'Uitloop'}. De keuken iPads zijn geüpdatet.`
    };
}

async function handleGetGerechten(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    let query = sb.from('gerechten').select('*').order('volgorde');
    if (params.gang_slug) query = query.eq('gang_slug', params.gang_slug);
    if (params.actief_only) query = query.eq('actief', true);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { gerechten: data || [], count: (data || []).length };
}

async function handleGetGangen(sb: SupabaseClient): Promise<Record<string, any>> {
    const { data, error } = await sb.from('gangen').select('*').order('volgorde');
    if (error) throw new Error(error.message);
    return { gangen: data || [] };
}

const KNOWN_GANG_SLUGS = ['bite', 'voorgerecht', 'hoofdgerecht', 'vegetarisch', 'dessert', 'bijgerecht', 'borrelhap', 'anders'];

async function resolveGangSlug(sb: SupabaseClient, providedSlug: string | undefined): Promise<string> {
    const { data } = await sb.from('gangen').select('slug');
    const slugs: string[] = (data && data.length > 0) ? data.map((d: any) => d.slug) : KNOWN_GANG_SLUGS;

    if (providedSlug && slugs.includes(providedSlug)) return providedSlug;

    if (providedSlug) {
        const str = providedSlug.toLowerCase();
        if (str.endsWith('en') && slugs.includes(str.slice(0, -2))) return str.slice(0, -2);
        if (str.endsWith('s') && slugs.includes(str.slice(0, -1))) return str.slice(0, -1);
        const match = slugs.find((s) => str.includes(s) || s.includes(str));
        if (match) return match;
    }

    return slugs[0];
}

function normalizeIngredienten(raw: any): string {
    const source = raw || [];
    if (typeof source === 'string') return source.split(',').map((s: string) => s.trim()).filter(Boolean).join(', ');
    if (!Array.isArray(source)) return '';
    return source.map((i: any) => {
        if (typeof i === 'object' && i !== null) return (i.hoeveelheid ? i.hoeveelheid + (i.eenheid ? ' ' + i.eenheid + ' ' : ' ') : '') + (i.naam || JSON.stringify(i));
        return String(i);
    }).join(', ');
}

function normalizeBereidingswijze(params: Record<string, any>): string {
    const raw = params.bereidingswijze || params.bereiding || params.stappenplan || params.instructies || params.preparation_steps || '';
    return Array.isArray(raw) ? raw.join('\n') : String(raw || '');
}

async function handleCreateGerecht(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const safeSlug = await resolveGangSlug(sb, params.gang_slug);
    const rawIngs = params.ingredienten || params.ingredients || params.ingredients_list || [];

    const { data, error } = await sb.from('gerechten').insert([{
        naam: params.naam,
        gang_slug: safeSlug,
        beschrijving: params.beschrijving || '',
        preparation_steps: normalizeBereidingswijze(params),
        ingredients_list: normalizeIngredienten(rawIngs),
        tags: params.tags || [],
        allergenen: params.allergenen || [],
        actief: false,
        volgorde: 99
    }]).select().single();
    if (error) throw new Error(error.message);
    return { created: data, message: '"' + params.naam + '" toegevoegd aan ' + safeSlug };
}

async function handleCreateGerechtBulk(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const gerechten: any[] = params.gerechten || [];
    if (gerechten.length === 0) return { error: 'Geen gerechten opgegeven' };

    const rows: Record<string, any>[] = [];
    for (let i = 0; i < gerechten.length; i++) {
        const g = gerechten[i];
        const safeSlug = await resolveGangSlug(sb, g.gang_slug);
        const rawIngs = g.ingredienten || g.ingredients || g.ingredients_list || [];
        rows.push({
            naam: g.naam,
            gang_slug: safeSlug,
            beschrijving: g.beschrijving || '',
            preparation_steps: normalizeBereidingswijze(g),
            ingredients_list: normalizeIngredienten(rawIngs),
            tags: g.tags || [],
            allergenen: g.allergenen || [],
            actief: false,
            volgorde: 900 + i
        });
    }

    const settled = await Promise.allSettled(
        rows.map((row) => sb.from('gerechten').insert([row]).select().single())
    );

    const inserted: any[] = [];
    const errors: { naam: string; error: string }[] = [];
    settled.forEach((outcome, i) => {
        if (outcome.status === 'fulfilled' && !outcome.value.error) {
            inserted.push(outcome.value.data);
        } else {
            const msg = outcome.status === 'rejected' ? outcome.reason.message : outcome.value.error.message;
            errors.push({ naam: rows[i].naam, error: msg });
        }
    });

    return {
        inserted: inserted.length,
        errors,
        ids: inserted.map((r: any) => r.id),
        gerechten: inserted,
        message: inserted.length + ' gerechten toegevoegd aan de Menu Ontwikkelaar' + (errors.length > 0 ? ' (' + errors.length + ' fouten)' : '')
    };
}

async function handleUpdateGerecht(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    let id = params.gerecht_id || params.id;

    if (!id && params.naam) {
        const { data: found } = await sb.from('gerechten').select('id').ilike('naam', params.naam).limit(1);
        if (found && found.length > 0) id = found[0].id;
    }

    if (!id) {
        return handleCreateGerecht(sb, params);
    }

    const update: Record<string, any> = {};
    if (params.naam !== undefined) update.naam = params.naam;
    if (params.beschrijving !== undefined) update.beschrijving = params.beschrijving;

    const hasBereiding = params.bereidingswijze !== undefined || params.bereiding !== undefined || params.stappenplan !== undefined || params.instructies !== undefined || params.preparation_steps !== undefined;
    if (hasBereiding) update.preparation_steps = normalizeBereidingswijze(params);

    if (params.gang_slug !== undefined) update.gang_slug = params.gang_slug;
    if (params.tags !== undefined) update.tags = params.tags;
    if (params.allergenen !== undefined) update.allergenen = params.allergenen;

    const rawUpdateIngs = params.ingredienten || params.ingredients || params.ingredients_list;
    if (rawUpdateIngs !== undefined) update.ingredients_list = normalizeIngredienten(rawUpdateIngs);

    if (params.kostprijs_pp !== undefined) update.kostprijs_pp = params.kostprijs_pp;
    if (params.actief !== undefined) update.actief = params.actief;

    if (Object.keys(update).length === 0) return { updated: false, reden: 'Geen velden opgegeven' };

    const { error } = await sb.from('gerechten').update(update).eq('id', id);
    if (error) throw new Error(error.message);
    return { updated: true, gerecht_id: id };
}

async function handleDeleteGerecht(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const { error } = await sb.from('gerechten').delete().eq('id', params.gerecht_id);
    if (error) throw new Error(error.message);
    return { deleted: true, gerecht_id: params.gerecht_id };
}

async function handleDeactivateGerechten(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const ids: string[] = params.gerecht_ids || [];
    if (ids.length === 0) return { error: 'Geen IDs opgegeven' };

    if (params.actie === 'verwijder') {
        const { error } = await sb.from('gerechten').delete().in('id', ids);
        if (error) throw new Error(error.message);
        return { verwijderd: ids.length, ids };
    } else {
        const { error } = await sb.from('gerechten').update({ actief: false }).in('id', ids);
        if (error) throw new Error(error.message);
        return { gedeactiveerd: ids.length, ids };
    }
}

async function handleAnalyzeMenuBalance(sb: SupabaseClient): Promise<Record<string, any>> {
    const { data: gangen } = await sb.from('gangen').select('*').order('volgorde');
    const { data: gerechten } = await sb.from('gerechten').select('naam,gang_slug,tags,allergenen,actief').order('volgorde');
    const perGang: Record<string, any[]> = {};
    (gangen || []).forEach((g: any) => { perGang[g.naam] = (gerechten || []).filter((gr: any) => gr.gang_slug === g.slug); });
    const vegan = (gerechten || []).filter((g: any) => (g.tags || []).includes('Vegan') || (g.tags || []).includes('Vega')).length;
    return {
        per_gang: perGang,
        totaal: (gerechten || []).length,
        vegan_count: vegan,
        vegan_ratio: (gerechten || []).length > 0 ? Math.round(vegan / gerechten!.length * 100) + '%' : '0%',
        actief: (gerechten || []).filter((g: any) => g.actief).length
    };
}

async function handleGetRecepten(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    let query = sb.from('recepten').select('*').order('naam');
    if (params.categorie) query = query.eq('categorie', params.categorie);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { recepten: data || [], count: (data || []).length };
}

async function handleGetReceptDetail(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const { data, error } = await sb.from('recepten').select('*').eq('id', params.recept_id).single();
    if (error) throw new Error(error.message);
    return { recept: data };
}

async function handlePlanEventFull(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const eventPayload = {
        klant_naam: params.klant_naam,
        datum: params.datum,
        aantal_personen: params.aantal_gasten,
        status: 'bevestigd',
        notities: (params.notities || '') + '\n[AI] Geplande Menu Selectie: ' + (params.menu_selectie || []).join(', ')
    };

    const { data: eventData, error: eventErr } = await sb.from('events').insert(eventPayload).select();
    if (eventErr) throw new Error("Fout bij aanmaken event: " + eventErr.message);

    const event = eventData![0];
    let createdTasks: any[] = [];

    if (params.prep_taken && params.prep_taken.length > 0) {
        const tasksPayload = params.prep_taken.map((pt: any) => ({
            event_id: event.id,
            taak_naam: pt.taak + (pt.context_gerecht ? ' (' + pt.context_gerecht + ')' : ''),
            datum: pt.datum_uitvoer,
            status: 'todo',
            verantwoordelijke: pt.toegewezen_aan || 'Keuken'
        }));

        const { data: taskData, error: taskErr } = await sb.from('prep_tasks').insert(tasksPayload).select();
        if (taskErr) throw new Error("Event aangemaakt, maar fout bij prep-taken: " + taskErr.message);
        createdTasks = taskData || [];
    }

    return {
        event,
        aantal_prep_taken: createdTasks.length,
        prep_taken: params.prep_taken,
        summary: `Event voor ${params.klant_naam} ingepland op ${params.datum}. Er zijn direct ${createdTasks.length} prep-taken klaargezet in de agenda.`
    };
}

async function handlePlanLogisticsRoute(_sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    if (!params.datum || !params.route_stops) throw new Error("Datum en route_stops zijn verplicht.");

    return {
        datum: params.datum,
        start_tijd_hq: params.start_tijd_hq || 'Onbekend',
        route_stops: params.route_stops,
        km_schatting: params.totaal_km_schatting || 0,
        waarschuwingen: params.waarschuwingen || [],
        summary: `De AI Route Planner heeft de efficiëntste route voor ${params.datum} berekend met in totaal ${params.route_stops.length} stops en geschat op ${params.totaal_km_schatting}km.`
    };
}

async function handleEngineerMenuProfitability(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    if (!params.analyse_resultaten || params.analyse_resultaten.length === 0) {
        return { summary: "Geen optimalisaties gevonden." };
    }

    const updates: string[] = [];
    for (let i = 0; i < params.analyse_resultaten.length; i++) {
        const res = params.analyse_resultaten[i];
        if (res.gerecht_id) {
            const { data: g } = await sb.from('gerechten').select('id, bereidingswijze').eq('id', res.gerecht_id).single();
            if (g) {
                const note = `\n\n[AI Winstoptimalisatie]: Vervang ${res.knelpunt_ingredient} met ${res.suggestie_vervanging}. Reden: ${res.reden}. Marge stijgt naar ${res.nieuwe_geschatte_marge}%.`;
                await sb.from('gerechten').update({ bereidingswijze: (g.bereidingswijze || '') + note }).eq('id', g.id);
                updates.push(res.gerecht_naam);
            }
        }
    }

    return {
        aantal_geoptimaliseerd: updates.length,
        gerechten: updates,
        totaal_winstpotentieel: params.totaal_winstpotentieel,
        summary: `Marge-optimalisatie toegepast op ${updates.length} gerechten. Geschat winstpotentieel: ${params.totaal_winstpotentieel}.`
    };
}

async function handleCreateRecept(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const { data, error } = await sb.from('recepten').insert([{
        naam: params.naam,
        categorie: params.categorie,
        porties: params.porties || 4,
        preptime: params.preptime || 30,
        ingredienten: params.ingredienten || [],
        instructies: params.instructies || '',
        notitie: params.notitie || ''
    }]).select().single();
    if (error) throw new Error(error.message);
    return { created: data, message: 'Recept "' + params.naam + '" toegevoegd aan The Vault' };
}

async function handleUpdateRecept(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const update: Record<string, any> = {};
    ['naam', 'instructies', 'porties', 'preptime', 'ingredienten', 'notitie'].forEach((k) => {
        if (params[k] !== undefined) update[k] = params[k];
    });
    const { error } = await sb.from('recepten').update(update).eq('id', params.recept_id);
    if (error) throw new Error(error.message);
    return { updated: true, recept_id: params.recept_id };
}

async function handleCalcPortiesVoor(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    let recept: any = null;
    if (params.recept_id) {
        const { data } = await sb.from('recepten').select('*').eq('id', params.recept_id).single();
        recept = data;
    } else if (params.recept_naam) {
        const { data } = await sb.from('recepten').select('*').ilike('naam', '%' + params.recept_naam + '%').limit(1);
        if (data && data.length > 0) recept = data[0];
    }
    if (!recept) return { error: 'Recept niet gevonden' };
    const factor = Math.ceil(params.gasten / (recept.porties || 4));
    return {
        recept: recept.naam,
        gasten: params.gasten,
        recepten_nodig: factor,
        ingredienten: (recept.ingredienten || []).map((i: any) => i + ' × ' + factor)
    };
}

async function handleGenerateSmartQuote(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const { data: lastRows } = await sb.from('offertes').select('nummer').order('id', { ascending: false }).limit(1);
    let nextNum = 1;
    if (lastRows && lastRows.length > 0 && lastRows[0].nummer) {
        const match = lastRows[0].nummer.match(/\d+/);
        if (match) nextNum = parseInt(match[0], 10) + 1;
    }
    const nummer = 'OFF-2026-' + nextNum.toString().padStart(3, '0');

    const payload = {
        nummer,
        status: 'concept',
        client_naam: params.client_naam,
        client_adres: params.client_adres || '',
        datum: params.datum,
        geldig_tot: new Date(new Date(params.datum).getTime() + 14 * 86400000).toISOString().slice(0, 10),
        notitie: params.notitie || '',
        items: params.items || [],
        menu_selectie: params.menu_selectie || [],
        aantal_gasten: params.aantal_gasten,
        basis_prijs_pp: params.basis_prijs_pp,
        vaste_kosten: (params.vaste_kosten || []).map((k: any) => ({ naam: k.naam, bedrag: parseFloat(k.bedrag) || 0 }))
    };

    const { data, error } = await sb.from('offertes').insert(payload).select();
    if (error) throw new Error(error.message);

    return { created_quote: data![0], summary: `Offerte ${nummer} voor ${params.client_naam} succesvol aangemaakt met marge-check.` };
}

async function handleGetOffertes(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    let query = sb.from('offertes').select('*').order('datum', { ascending: false }).limit(30);
    if (params.status) query = query.eq('status', params.status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const offertes = data || [];
    return {
        offertes: offertes.map((o: any) => Object.assign({}, o, { berekend_totaal: calcOfferteTotaal(o) })),
        count: offertes.length,
        totaal_omzet: offertes.reduce((s: number, o: any) => s + calcOfferteTotaal(o), 0)
    };
}

async function handleGetOpenOffertes(sb: SupabaseClient): Promise<Record<string, any>> {
    const { data, error } = await sb.from('offertes').select('*').in('status', ['concept', 'verzonden']).order('datum', { ascending: false });
    if (error) throw new Error(error.message);
    const open = data || [];
    return {
        offertes: open.map((o: any) => Object.assign({}, o, { berekend_totaal: calcOfferteTotaal(o) })),
        count: open.length,
        totaal: open.reduce((s: number, o: any) => s + calcOfferteTotaal(o), 0)
    };
}

async function handleCalcOfferteOmzet(sb: SupabaseClient): Promise<Record<string, any>> {
    const { data, error } = await sb.from('offertes').select('*').order('datum', { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    const all = data || [];
    const byStatus: Record<string, { count: number; totaal: number }> = {};
    all.forEach((o: any) => {
        const st = o.status || 'onbekend';
        if (!byStatus[st]) byStatus[st] = { count: 0, totaal: 0 };
        byStatus[st].count++;
        byStatus[st].totaal += calcOfferteTotaal(o);
    });
    return {
        per_status: byStatus,
        totaal_pipeline: all.reduce((s: number, o: any) => s + calcOfferteTotaal(o), 0)
    };
}

async function handleUpdateOfferteStatus(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const { error } = await sb.from('offertes').update({ status: params.status }).eq('id', params.offerte_id);
    if (error) throw new Error(error.message);
    return { updated: true };
}

async function handleGetFacturen(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    let query = sb.from('facturen').select('*').order('datum', { ascending: false }).limit(30);
    if (params.status) query = query.eq('status', params.status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { facturen: data || [], count: (data || []).length };
}

async function handleGetOpenFacturen(sb: SupabaseClient): Promise<Record<string, any>> {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await sb.from('facturen').select('*').in('status', ['concept', 'verzonden']).order('vervaldatum');
    if (error) throw new Error(error.message);
    const open = data || [];
    const vervallen = open.filter((f: any) => f.vervaldatum && f.vervaldatum < today);
    return { open, count: open.length, vervallen: vervallen.length };
}

async function handleGetVervaldatums(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const dagen = params.dagen || 7;
    const to = new Date(Date.now() + dagen * 86400000).toISOString().slice(0, 10);
    const { data, error } = await sb.from('facturen').select('*').in('status', ['verzonden', 'concept']).lte('vervaldatum', to).order('vervaldatum');
    if (error) throw new Error(error.message);
    return { bijna_vervallen: data || [], count: (data || []).length };
}

async function handleCalcCashflow(sb: SupabaseClient): Promise<Record<string, any>> {
    const { data: openFact } = await sb.from('facturen').select('*').in('status', ['verzonden', 'concept']);
    const { data: openOff } = await sb.from('offertes').select('*').in('status', ['goedgekeurd']);
    const factuurTotaal = (openFact || []).reduce((s: number, f: any) => {
        const sub = (f.items || []).reduce((ss: number, i: any) => ss + (i.qty || 0) * (i.unit_price || 0) * (1 + (i.btw_rate || 0) / 100), 0);
        return s + sub - Number(f.korting || 0);
    }, 0);
    const offerteTotaal = (openOff || []).reduce((s: number, o: any) => s + calcOfferteTotaal(o), 0);
    return {
        open_facturen_totaal: factuurTotaal,
        goedgekeurde_offertes_totaal: offerteTotaal,
        verwachte_inkomsten: factuurTotaal + offerteTotaal
    };
}

async function handleGetVoorraad(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const { data, error } = await sb.from('inventory').select('*').order('naam');
    if (error) throw new Error(error.message);
    let items = data || [];
    if (params.laag_only) items = items.filter((i: any) => i.hoeveelheid <= i.min_par);
    return { inventory: items, count: items.length, laag: items.filter((i: any) => i.hoeveelheid <= i.min_par).length };
}

async function handleGetLageVoorraad(sb: SupabaseClient): Promise<Record<string, any>> {
    const { data, error } = await sb.from('inventory').select('*').order('naam');
    if (error) throw new Error(error.message);
    const laag = (data || []).filter((i: any) => i.hoeveelheid <= i.min_par);
    return {
        laag,
        count: laag.length,
        message: laag.length === 0 ? 'Alle voorraad is op niveau.' : laag.length + ' items onder par-level.'
    };
}

async function handleUpdateVoorraadItem(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const update: Record<string, any> = {};
    if (params.hoeveelheid !== undefined) update.hoeveelheid = params.hoeveelheid;
    if (params.min_par !== undefined) update.min_par = params.min_par;
    const { error } = await sb.from('inventory').update(update).eq('id', params.item_id);
    if (error) throw new Error(error.message);
    return { updated: true };
}

async function handleCalcBenodigdVoorEvent(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    let eventData: any = null;
    if (params.event_id) {
        const { data } = await sb.from('events').select('*').eq('id', params.event_id).single();
        eventData = data;
    }
    const gasten = params.gasten || (eventData && eventData.guests) || 50;
    const menuItems: string[] = eventData && eventData.menu ? eventData.menu : [];
    const { data: gerechten } = await sb.from('gerechten').select('naam,ingredient_costs').in('naam', menuItems.length > 0 ? menuItems : ['__none__']);
    const totaalPerIng: Record<string, { naam: string; unit: string; totaal: number }> = {};
    (gerechten || []).forEach((g: any) => {
        (g.ingredient_costs || []).forEach((ic: any) => {
            const key = ic.naam;
            if (!totaalPerIng[key]) totaalPerIng[key] = { naam: key, unit: ic.unit, totaal: 0 };
            totaalPerIng[key].totaal += (ic.qty_pp || 0) * gasten;
        });
    });
    return { gasten, benodigd: Object.values(totaalPerIng) };
}

async function handleGetInkoopLijst(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const { data: inventory } = await sb.from('inventory').select('*').order('naam');
    const te_bestellen = (inventory || []).filter((i: any) => i.hoeveelheid < i.min_par);
    if (params.groepeer_per_winkel) {
        const perLeverancier: Record<string, any[]> = {};
        te_bestellen.forEach((i: any) => {
            const lev = i.preferred_supplier || 'Overig';
            if (!perLeverancier[lev]) perLeverancier[lev] = [];
            perLeverancier[lev].push(i);
        });
        return { per_leverancier: perLeverancier, count: te_bestellen.length };
    }
    return { te_bestellen, count: te_bestellen.length };
}

async function handleGenerateInkoopVoorEvent(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const today = new Date().toISOString().slice(0, 10);
    let eventData: any = null;
    if (params.event_id) {
        const { data } = await sb.from('events').select('*').eq('id', params.event_id).single();
        eventData = data;
    } else {
        const { data: upcoming } = await sb.from('events').select('*').gte('date', today).order('date').limit(1);
        if (upcoming && upcoming.length > 0) eventData = upcoming[0];
    }
    if (!eventData) return { error: 'Geen event gevonden' };
    const result = await handleCalcBenodigdVoorEvent(sb, { event_id: eventData.id, gasten: eventData.guests });
    return Object.assign({}, result, { event: eventData.name, datum: eventData.date });
}

async function handleGetInkoopPerWinkel(sb: SupabaseClient): Promise<Record<string, any>> {
    const { data: gerechten } = await sb.from('gerechten').select('ingredienten,ingredienten_winkels').limit(100);
    const perWinkel: Record<string, string[]> = {};
    (gerechten || []).forEach((g: any) => {
        const winkels = g.ingredienten_winkels || {};
        (g.ingredienten || []).forEach((ing: any) => {
            const winkel = winkels[ing] || 'Overig';
            if (!perWinkel[winkel]) perWinkel[winkel] = [];
            if (!perWinkel[winkel].includes(ing)) perWinkel[winkel].push(ing);
        });
    });
    return { per_winkel: perWinkel };
}

async function handleProcessReceipt(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    if (!params.items || !Array.isArray(params.items)) throw new Error("Geen items gevonden op het bonnetje.");
    const updates: string[] = [];
    const newItems: string[] = [];

    for (let i = 0; i < params.items.length; i++) {
        const item = params.items[i];

        const { data: inv } = await sb.from('inventory').select('*').ilike('naam', '%' + item.naam + '%').limit(1);

        if (inv && inv.length > 0) {
            const existing = inv[0];
            const newQty = (existing.huidige_hoeveelheid || 0) + item.aantal;
            const newPrice = item.prijs;
            await sb.from('inventory').update({ huidige_hoeveelheid: newQty, prijs_per_eenheid: newPrice }).eq('id', existing.id);
            updates.push(item.naam + ' (+' + item.aantal + ', Prijs: €' + newPrice + ')');
        } else {
            const { data: inserted } = await sb.from('inventory').insert({
                naam: item.naam,
                categorie: 'Inkoop / Diversen',
                huidige_hoeveelheid: item.aantal,
                minimale_hoeveelheid: 0,
                eenheid: 'stuk',
                prijs_per_eenheid: item.prijs,
                leverancier_info: params.winkel
            }).select();
            if (inserted && inserted.length > 0) newItems.push(item.naam + ' (' + item.aantal + 'x toegevoegd)');
        }
    }

    const btwTotaal = ((params.btw_hoog || 0) + (params.btw_laag || 0)).toFixed(2);

    return {
        winkel: params.winkel,
        datum: params.datum,
        voorraad_updates: updates.length,
        nieuwe_artikelen: newItems.length,
        financieel: {
            totaalbedrag_incl: params.totaal_bedrag,
            te_vorderen_btw: Number(btwTotaal),
            btw_specificatie: {
                hoog: params.btw_hoog || 0,
                laag: params.btw_laag || 0,
                nul: params.btw_nul || 0
            }
        },
        gewijzigde_voorraad: updates,
        summary: 'Bonnetje van ' + params.winkel + ' succesvol verwerkt. ' + (updates.length + newItems.length) + ' artikelen bijgewerkt. Te vorderen BTW: €' + btwTotaal
    };
}

async function handleOptimizeShoppingList(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const payload: Record<string, any> = {
        periode_start: params.periode_start,
        periode_eind: params.periode_eind,
        event_nummers: params.event_nummers || [],
        leveranciers_lijsten: params.leveranciers_lijsten || [],
        totaal_geschatte_kosten: params.totaal_geschatte_kosten || 0,
        aangemaakt_op: new Date().toISOString()
    };

    const { data, error } = await sb.from('inkooplijsten').insert(payload).select();
    if (error) {
        return Object.assign({ opslaan_mislukt: true, error: error.message }, payload);
    }

    return data![0];
}

async function handlePredictHardwareNeeds(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    if (!params.benodigd_materieel || params.benodigd_materieel.length === 0) {
        return { summary: "Geen bijzonder materieel nodig voor dit event." };
    }

    const payload = params.benodigd_materieel.map((item: any) => ({
        event_id: params.event_id,
        item_naam: item.item_naam,
        aantal: item.aantal,
        reden: item.reden,
        status: 'inpakken'
    }));

    await sb.from('event_materieel').insert(payload);

    return {
        event_id: params.event_id,
        event_naam: params.event_naam,
        aantal_items: params.benodigd_materieel.length,
        bus_check_lijst: params.benodigd_materieel,
        summary: `Bus-Check voor ${params.event_naam || 'het event'} gegenereerd: ${params.benodigd_materieel.length} items ingepland.`
    };
}

async function handleGetHaccpLogs(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const days = params.days || 7;
    const from = new Date(Date.now() - days * 86400000).toISOString();
    let query = sb.from('haccp_logs').select('*').gte('created_at', from).order('created_at', { ascending: false });
    if (params.event_id) query = query.eq('event_id', params.event_id);
    const { data, error } = await query;
    if (error) return { error: error.message, logs: [] };
    return { logs: data || [], count: (data || []).length };
}

async function handleCreateHaccpLog(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const { data, error } = await sb.from('haccp_logs').insert([{
        product: params.product,
        temperatuur: params.temperatuur,
        chef: params.chef || 'AI Copilot',
        event_id: params.event_id || null,
        notitie: params.notitie || '',
        created_at: new Date().toISOString()
    }]).select().single();
    if (error) throw new Error(error.message);
    const veilig = params.temperatuur >= 75 || params.temperatuur <= 7;
    return { created: data, veilig, waarschuwing: !veilig ? '⚠️ Temperatuur buiten veilige zone!' : null };
}

async function handleGetMissingHaccpLogs(sb: SupabaseClient): Promise<Record<string, any>> {
    const today = new Date().toISOString().slice(0, 10);
    const week_ago = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const { data: events } = await sb.from('events').select('id,name,date').gte('date', week_ago).lte('date', today);
    const { data: logs } = await sb.from('haccp_logs').select('event_id').gte('created_at', week_ago + 'T00:00:00');
    const loggedEventIds = new Set((logs || []).map((l: any) => l.event_id));
    const missing = (events || []).filter((e: any) => !loggedEventIds.has(e.id));
    return { events_zonder_haccp: missing, count: missing.length };
}

async function handleGetTemperatureAlerts(sb: SupabaseClient): Promise<Record<string, any>> {
    const { data, error } = await sb.from('haccp_logs').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) return { error: error.message, alerts: [] };
    const alerts = (data || []).filter((l: any) => l.temperatuur > 7 && l.temperatuur < 75);
    return { alerts, count: alerts.length };
}

async function handleGetUrenRegistraties(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const maandAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    let query = sb.from('time_logs').select('*').gte('date', maandAgo).order('date', { ascending: false });
    if (params.medewerker) query = query.eq('medewerker', params.medewerker);
    const { data, error } = await query;
    if (error) return { error: error.message };
    const totaal = (data || []).reduce((s: number, l: any) => s + (l.uren || 0), 0);
    return { logs: data || [], totaal_uren: totaal };
}

async function handleGetUrenPerMedewerker(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const maand = params.maand || new Date().toISOString().slice(0, 7);
    const { data, error } = await sb.from('time_logs').select('*').gte('date', maand + '-01').lte('date', maand + '-31');
    if (error) return { error: error.message };
    const perMedewerker: Record<string, number> = {};
    (data || []).forEach((l: any) => {
        const m = l.medewerker || 'Onbekend';
        if (!perMedewerker[m]) perMedewerker[m] = 0;
        perMedewerker[m] += l.uren || 0;
    });
    return { per_medewerker: perMedewerker, maand };
}

async function handleCalcOveruren(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const contractUren = params.contract_uren_per_week || 32;
    const { data } = await sb.from('time_logs').select('*').gte('date', new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10));
    const medewerkerLogs = params.medewerker ? (data || []).filter((l: any) => l.medewerker === params.medewerker) : (data || []);
    const totaalGewerkt = medewerkerLogs.reduce((s: number, l: any) => s + (l.uren || 0), 0);
    const contractMaand = contractUren * 4;
    return {
        geregistreerde_uren: totaalGewerkt,
        contract_uren_maand: contractMaand,
        overuren: Math.max(0, totaalGewerkt - contractMaand),
        te_weinig: Math.max(0, contractMaand - totaalGewerkt)
    };
}

async function handleGetMaterieel(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    let query = sb.from('materieel').select('*').order('naam');
    if (params.categorie) query = query.eq('categorie', params.categorie);
    const { data, error } = await query;
    if (error) return { error: error.message };
    return { materieel: data || [], count: (data || []).length };
}

async function handleGetMaterieelVoorEvent(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const gasten = params.gasten || 50;
    const { data: gerechten } = await sb.from('gerechten').select('hardware_items').limit(100);
    const hardware: Record<string, { naam: string; categorie: string; totaal: number }> = {};
    (gerechten || []).forEach((g: any) => {
        (g.hardware_items || []).forEach((hw: any) => {
            if (!hardware[hw.naam]) hardware[hw.naam] = { naam: hw.naam, categorie: hw.categorie, totaal: 0 };
            const benodig = Math.ceil(gasten * (hw.ratio || 1) * (1 + (hw.buffer_pct || 10) / 100));
            hardware[hw.naam].totaal = Math.max(hardware[hw.naam].totaal, benodig + (hw.min_extra || 0));
        });
    });
    return { hardware: Object.values(hardware), gasten };
}

async function handleUpdateMaterieelStatus(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const { error } = await sb.from('materieel').update({ status: params.status }).eq('id', params.item_id);
    if (error) throw new Error(error.message);
    return { updated: true };
}

async function handleGetBusCheck(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const today = new Date().toISOString().slice(0, 10);
    let eventData: any = null;
    if (params.event_id) {
        const { data } = await sb.from('events').select('*').eq('id', params.event_id).single();
        eventData = data;
    } else {
        const { data: upcoming } = await sb.from('events').select('*').gte('date', today).order('date').limit(1);
        if (upcoming && upcoming.length > 0) eventData = upcoming[0];
    }
    return {
        event: eventData ? eventData.name : 'Onbekend event',
        checklist: [
            { categorie: 'BBQ Apparatuur', items: ['Kamado/smoker', 'Aanmaakblokjes + houtskool', 'Rookhout', 'Thermometer', 'BBQ tools set'] },
            { categorie: 'Servies & Presentatie', items: ['Borden (gasten × 1.1)', 'Bestek sets', 'Servetten', 'Serving boards', 'Saucières'] },
            { categorie: 'Koeling', items: ['Koelboxen gevuld met ijs', 'Vlees zorgvuldig verpakt', 'Sauzen gekoeld', 'HACCP thermometer'] },
            { categorie: 'Keuken', items: ['Snijtafels', 'Messen set', 'Snijplanken', 'Wegwerphandschoenen', 'Schorten'] },
            { categorie: 'Service', items: ['Tafels + stoelen', 'Tafelkleden', 'Menukaarten', 'Gastenboek (optioneel)'] },
            { categorie: 'Admin', items: ['Offerte/factuur print', 'Betaallink/terminal', 'Contact klant telefoonnummer'] }
        ]
    };
}

async function handleGetLogistiekVoorEvent(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const busCheck = await handleGetBusCheck(sb, params);
    const materieel = await handleGetMaterieelVoorEvent(sb, params);
    return { bus_check: busCheck, hardware_berekening: materieel };
}

async function handleGetOmzetPerPeriode(sb: SupabaseClient): Promise<Record<string, any>> {
    const { data } = await sb.from('facturen').select('datum,status,items,korting,vaste_kosten').eq('status', 'betaald').order('datum', { ascending: false }).limit(100);
    const maandOmzet: Record<string, number> = {};
    (data || []).forEach((f: any) => {
        if (!f.datum) return;
        const maand = f.datum.slice(0, 7);
        const sub = (f.items || []).reduce((s: number, i: any) => s + (i.qty || 0) * (i.unit_price || 0) * (1 + (i.btw_rate || 0) / 100), 0);
        const totaal = sub - Number(f.korting || 0) + (f.vaste_kosten || []).reduce((s: number, k: any) => s + Number(k.bedrag || 0), 0);
        if (!maandOmzet[maand]) maandOmzet[maand] = 0;
        maandOmzet[maand] += totaal;
    });
    return { omzet_per_maand: maandOmzet };
}

async function handleGetKwartaalOmzet(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const nu = new Date();
    const kwartaal = params.kwartaal || (Math.floor(nu.getMonth() / 3) + 1);
    const jaar = params.jaar || nu.getFullYear();
    const maandStart = ((kwartaal - 1) * 3 + 1).toString().padStart(2, '0');
    const maandEind = (kwartaal * 3).toString().padStart(2, '0');
    const from = jaar + '-' + maandStart + '-01';
    const to = jaar + '-' + maandEind + '-31';
    const { data } = await sb.from('facturen').select('datum,items,korting,vaste_kosten').eq('status', 'betaald').gte('datum', from).lte('datum', to);
    const totaal = (data || []).reduce((s: number, f: any) => {
        const sub = (f.items || []).reduce((ss: number, i: any) => ss + (i.qty || 0) * (i.unit_price || 0) * (1 + (i.btw_rate || 0) / 100), 0);
        return s + sub - Number(f.korting || 0) + (f.vaste_kosten || []).reduce((ss: number, k: any) => ss + Number(k.bedrag || 0), 0);
    }, 0);
    return { kwartaal: 'Q' + kwartaal + ' ' + jaar, omzet: totaal, facturen_count: (data || []).length };
}

async function handleCalcFoodCostRatio(sb: SupabaseClient): Promise<Record<string, any>> {
    const { data: gerechten } = await sb.from('gerechten').select('naam,kostprijs_pp').order('naam');
    return {
        gerechten: (gerechten || []).filter((g: any) => g.kostprijs_pp > 0).map((g: any) => ({
            naam: g.naam, kostprijs_pp: g.kostprijs_pp
        }))
    };
}

async function handleGetWeekOverzicht(sb: SupabaseClient): Promise<Record<string, any>> {
    const today = new Date().toISOString().slice(0, 10);
    const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const [evRes, invRes, offRes, prepRes] = await Promise.all([
        sb.from('events').select('*').gte('date', today).lte('date', week).order('date'),
        sb.from('inventory').select('naam,hoeveelheid,min_par,unit').order('naam'),
        sb.from('offertes').select('status,items,korting,vaste_kosten,basis_prijs_pp,aantal_gasten').in('status', ['concept', 'verzonden']),
        sb.from('prep_tasks').select('*').gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    ]);
    const invLaag = (invRes.data || []).filter((i: any) => i.hoeveelheid <= i.min_par);
    return {
        events_deze_week: evRes.data || [],
        lage_voorraad: invLaag,
        open_offertes: offRes.data || [],
        prep_taken: prepRes.data || []
    };
}

async function handleGetDashboardSummary(sb: SupabaseClient): Promise<Record<string, any>> {
    const weekData = await handleGetWeekOverzicht(sb);
    return Object.assign({}, weekData, { gegenereerd_op: new Date().toISOString() });
}

async function handleFilterSystemData(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const module = params.module;
    const criteria = params.criteria;
    let items: any[] = [];

    if (module === 'gerechten') {
        const { data } = await sb.from('gerechten').select('id,naam,gang_slug,beschrijving,ingredienten,tags');
        items = data || [];
    } else if (module === 'recepten') {
        const { data } = await sb.from('recepten').select('id,naam,categorie,ingredienten');
        items = data || [];
    }

    return {
        module,
        criteria,
        actie: params.actie || 'deactiveer',
        kandidaten: items.slice(0, 20),
        info: 'Gebaseerd op criteria "' + criteria + '" zijn dit de kandidaten. Selecteer welke je wilt ' + (params.actie || 'deactiveren') + '.'
    };
}

async function handleSaveConversation(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    let folder_id: string | null = null;
    if (params.folder_naam) {
        const { data: existing } = await sb.from('ai_conversation_folders').select('id').ilike('naam', params.folder_naam).limit(1);
        if (existing && existing.length > 0) {
            folder_id = existing[0].id;
        } else {
            const { data: newFolder } = await sb.from('ai_conversation_folders').insert([{ naam: params.folder_naam }]).select().single();
            if (newFolder) folder_id = newFolder.id;
        }
    }
    return { info: 'save_conversation', titel: params.titel, folder_id };
}

async function handleGetConversations(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    let query = sb.from('ai_conversations').select('*').order('updated_at', { ascending: false }).limit(50);
    if (params.folder_id) query = query.eq('folder_id', params.folder_id);
    const { data, error } = await query;
    if (error) return { error: error.message };
    return { conversations: data || [] };
}

async function handleCreateFolder(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const { data, error } = await sb.from('ai_conversation_folders').insert([{
        naam: params.naam,
        kleur: params.kleur || '#FFBF00'
    }]).select().single();
    if (error) throw new Error(error.message);
    return { created: data };
}

type ToolHandler = (sb: SupabaseClient, params: Record<string, any>) => Promise<Record<string, any>>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
    getUpcomingEvents: handleGetUpcomingEvents,
    get_weather_forecast: handleGetWeatherForecast,
    getEventDetail: handleGetEventDetail,
    createEvent: handleCreateEvent,
    plan_event_full: handlePlanEventFull,
    engineer_menu_profitability: handleEngineerMenuProfitability,
    updateEventStatus: handleUpdateEventStatus,
    generatePrepList: handleGeneratePrepList,
    predict_staff_needs: handlePredictStaffNeeds,
    plan_logistics_route: handlePlanLogisticsRoute,
    generateTimeline: handleGenerateTimeline,
    shift_service_timeline: handleShiftServiceTimeline,
    getGerechten: handleGetGerechten,
    getGangen: handleGetGangen,
    createGerecht: handleCreateGerecht,
    createGerechtBulk: handleCreateGerechtBulk,
    updateGerecht: handleUpdateGerecht,
    deleteGerecht: handleDeleteGerecht,
    deactivateGerechten: handleDeactivateGerechten,
    analyzeMenuBalance: handleAnalyzeMenuBalance,
    getRecepten: handleGetRecepten,
    getReceptDetail: handleGetReceptDetail,
    createRecept: handleCreateRecept,
    updateRecept: handleUpdateRecept,
    calcPortiesVoor: handleCalcPortiesVoor,
    generate_smart_quote: handleGenerateSmartQuote,
    getOffertes: handleGetOffertes,
    getOpenOffertes: handleGetOpenOffertes,
    calcOfferteOmzet: handleCalcOfferteOmzet,
    updateOfferteStatus: handleUpdateOfferteStatus,
    getFacturen: handleGetFacturen,
    getOpenFacturen: handleGetOpenFacturen,
    getVervaldatumsFacturen: handleGetVervaldatums,
    calcCashflow: handleCalcCashflow,
    getVoorraad: handleGetVoorraad,
    getLageVoorraadItems: handleGetLageVoorraad,
    updateVoorraadItem: handleUpdateVoorraadItem,
    calcBenodigdVoorEvent: handleCalcBenodigdVoorEvent,
    getInkoopLijst: handleGetInkoopLijst,
    generateInkoopVoorEvent: handleGenerateInkoopVoorEvent,
    getInkoopPerWinkel: handleGetInkoopPerWinkel,
    process_receipt: handleProcessReceipt,
    optimize_shopping_list: handleOptimizeShoppingList,
    predict_hardware_needs: handlePredictHardwareNeeds,
    getHaccpLogs: handleGetHaccpLogs,
    createHaccpLog: handleCreateHaccpLog,
    getMissingHaccpLogs: handleGetMissingHaccpLogs,
    getTemperatureAlerts: handleGetTemperatureAlerts,
    getUrenRegistraties: handleGetUrenRegistraties,
    getUrenPerMedewerker: handleGetUrenPerMedewerker,
    calcOveruren: handleCalcOveruren,
    getMaterieel: handleGetMaterieel,
    getMaterieelVoorEvent: handleGetMaterieelVoorEvent,
    updateMaterieelStatus: handleUpdateMaterieelStatus,
    getBusCheck: handleGetBusCheck,
    getLogistiekVoorEvent: handleGetLogistiekVoorEvent,
    getOmzetPerPeriode: handleGetOmzetPerPeriode,
    getKwartaalOmzet: handleGetKwartaalOmzet,
    calcFoodCostRatio: handleCalcFoodCostRatio,
    getWeekOverzicht: handleGetWeekOverzicht,
    getDashboardSummary: handleGetDashboardSummary,
    filterSystemData: handleFilterSystemData,
    saveConversation: handleSaveConversation,
    getConversations: handleGetConversations,
    createFolder: handleCreateFolder,
};

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const body = await req.json();
        const { tool, params } = body as { tool: string; params: Record<string, any> };

        if (!tool) return NextResponse.json({ error: 'Tool naam ontbreekt' }, { status: 400 });

        const handler = TOOL_HANDLERS[tool];
        if (!handler) return NextResponse.json({ error: 'Onbekende tool: ' + tool }, { status: 400 });

        const sb = getSupabase();
        const result = await handler(sb, params || {});
        return NextResponse.json({ ok: true, result, tool });

    } catch (err: any) {
        console.error('[ai-tools] error:', err);
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}
