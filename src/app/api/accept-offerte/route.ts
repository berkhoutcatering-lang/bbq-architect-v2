/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const sb = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDaysStr(d: string, n: number) {
    const dt = new Date(d);
    dt.setDate(dt.getDate() + n);
    return dt.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
    try {
        if (!sb) return NextResponse.json({ error: 'Geen database verbinding' }, { status: 500 });

        const { offerteId } = await req.json();
        if (!offerteId) return NextResponse.json({ error: 'Geen offerte ID' }, { status: 400 });

        // 1. Fetch offerte
        const { data: offerte, error: fetchErr } = await sb.from('offertes').select('*').eq('id', offerteId).single();
        if (fetchErr || !offerte) return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 });

        // Already accepted? Skip workflow but return success
        if (offerte.status === 'geaccepteerd' || offerte.status === 'akkoord' || offerte.status === 'betaald') {
            return NextResponse.json({ success: true, message: 'Offerte was al geaccepteerd', skipped: true });
        }

        // 2. Update offerte status
        const { error: updateErr } = await sb.from('offertes').update({ status: 'geaccepteerd' }).eq('id', offerteId);
        if (updateErr) return NextResponse.json({ error: 'Status update mislukt: ' + updateErr.message }, { status: 500 });

        // 3. Parse items safely
        let items = offerte.items;
        if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
        if (!Array.isArray(items)) { items = []; }

        // 3b. Sync to event (create or update)
        let eventId: number | null = null;
        try {
            let totalBedrag = 0;
            let estimatedGuests = offerte.aantal_gasten || 0;
            (items).forEach(function (item: any) {
                totalBedrag += (item.qty || 0) * (item.prijs || 0);
                if (!estimatedGuests && (item.qty || 0) > estimatedGuests) estimatedGuests = item.qty || 0;
            });
            const ppp = estimatedGuests > 0 ? totalBedrag / estimatedGuests : 45;

            const { data: existingEvents } = await sb.from('events').select('id').eq('offerte_id', offerteId);
            const existing = existingEvents && existingEvents.length > 0 ? existingEvents[0] : null;

            // Clean duplicates
            if (existingEvents && existingEvents.length > 1) {
                for (let i = 1; i < existingEvents.length; i++) {
                    await sb.from('events').delete().eq('id', existingEvents[i].id);
                }
            }

            const payload: Record<string, any> = {
                name: 'Offerte: ' + (offerte.client_naam || offerte.nummer || 'Onbekend'),
                date: offerte.datum || todayStr(),
                guests: estimatedGuests || 50,
                ppp: Math.round(ppp * 100) / 100,
                location: offerte.client_adres || '',
                client_naam: offerte.client_naam || '',
                client_adres: offerte.client_adres || '',
                status: 'confirmed',
                notitie: offerte.notitie || ''
            };

            if (existing) {
                await sb.from('events').update(payload).eq('id', existing.id);
                eventId = existing.id;
            } else {
                payload.offerte_id = offerteId;
                payload.type = 'Zakelijk';
                payload.menu = [];
                const ins = await sb.from('events').insert(payload).select();
                eventId = ins.data && ins.data[0] ? ins.data[0].id : null;
            }
        } catch (e: any) {
            console.error('[ACCEPT-API] Event sync error:', e.message);
        }

        if (!eventId) {
            return NextResponse.json({ success: true, message: 'Offerte geaccepteerd, maar event kon niet aangemaakt worden', workflow: null });
        }

        // 4. Run acceptance workflow (parallel)
        const results: Record<string, any> = {};

        // 4a. Auto-create factuur
        try {
            const { data: existingF } = await sb.from('facturen').select('id')
                .eq('client_naam', offerte.client_naam).limit(1);

            // Get settings for betaaltermijn
            const { data: settingsRows } = await sb.from('settings').select('*').limit(1);
            const settings = settingsRows && settingsRows[0] ? settingsRows[0] : {};
            const betaaltermijn = settings.betaaltermijn || 14;

            // Get facturen count for nummer
            const { count } = await sb.from('facturen').select('id', { count: 'exact', head: true });
            const prefix = settings.factuur_prefix || 'F2026-';
            const nummer = prefix + String((count || 0) + 1).padStart(3, '0');

            if (!existingF || existingF.length === 0) {
                await sb.from('facturen').insert({
                    nummer: nummer,
                    status: 'concept',
                    client_naam: offerte.client_naam || '',
                    client_adres: offerte.client_adres || '',
                    datum: todayStr(),
                    vervaldatum: addDaysStr(todayStr(), betaaltermijn),
                    items: items
                });
                results.factuur = { success: true, message: 'Factuur ' + nummer + ' aangemaakt' };
            } else {
                results.factuur = { success: true, message: 'Factuur bestond al' };
            }
        } catch (e: any) {
            results.factuur = { success: false, message: 'Factuur fout: ' + e.message };
        }

        // 4b. Auto-generate prep tasks
        try {
            const tasks = [
                { event_id: eventId, text: 'Voorraad check en ingredienten bestellen', dagen: -3, done: false },
                { event_id: eventId, text: 'Materieel controleren en inladen', dagen: -3, done: false },
                { event_id: eventId, text: 'Rubs en sauzen aanmaken', dagen: -2, done: false },
                { event_id: eventId, text: 'Rookhout weken', dagen: -2, done: false },
                { event_id: eventId, text: 'Smoker/BBQ testen', dagen: -1, done: false },
                { event_id: eventId, text: 'Bus inladen', dagen: -1, done: false },
                { event_id: eventId, text: 'Service materiaal checken', dagen: -1, done: false },
                { event_id: eventId, text: 'Smoke/BBQ aansteken 4-6u voor service', dagen: 0, done: false },
                { event_id: eventId, text: 'Sauzen opwarmen', dagen: 0, done: false },
                { event_id: eventId, text: 'Garnituren snijden', dagen: 0, done: false },
                { event_id: eventId, text: 'Service-station opzetten', dagen: 0, done: false },
                { event_id: eventId, text: 'HACCP temperaturen registreren', dagen: 0, done: false }
            ];
            await sb.from('prep_tasks').insert(tasks);
            results.prep = { success: true, message: tasks.length + ' prep-taken aangemaakt' };
        } catch (e: any) {
            results.prep = { success: false, message: 'Prep fout: ' + e.message };
        }

        // 4c. HACCP templates
        try {
            const menuItems: string[] = [];
            const menuSel = offerte.menu_selectie;
            if (Array.isArray(menuSel)) {
                menuSel.forEach(function (sel: any) {
                    const naam = sel.gerecht_naam || sel.naam || '';
                    if (naam) menuItems.push(naam);
                });
            } else if (menuSel && typeof menuSel === 'object') {
                Object.values(menuSel).forEach(function (arr: any) {
                    if (Array.isArray(arr)) {
                        // Even indices are dish names, odd are descriptions
                        arr.forEach(function (sel: any, idx: number) {
                            if (idx % 2 === 0) {
                                const naam = typeof sel === 'string' ? sel : (sel.gerecht_naam || sel.naam || '');
                                if (naam) menuItems.push(naam);
                            }
                        });
                    }
                });
            }

            if (menuItems.length > 0) {
                const { data: event } = await sb.from('events').select('date').eq('id', eventId).single();
                const eventDatum = event?.date || todayStr();
                const records: any[] = [];
                menuItems.forEach(function (naam: string) {
                    records.push({ event_id: eventId, datum: eventDatum, tijd: '', wat: naam + ' \u2014 Ontvangst grondstoffen', temp: 0, type: 'ontvangst', status: 'ok', notitie: 'Automatisch aangemaakt bij offerte-acceptatie' });
                    records.push({ event_id: eventId, datum: eventDatum, tijd: '', wat: naam + ' \u2014 Kerntemperatuur bereiding', temp: 0, type: 'bereiding', status: 'ok', notitie: 'Automatisch aangemaakt bij offerte-acceptatie' });
                    records.push({ event_id: eventId, datum: eventDatum, tijd: '', wat: naam + ' \u2014 Uitgifte temperatuur', temp: 0, type: 'uitgifte', status: 'ok', notitie: 'Automatisch aangemaakt bij offerte-acceptatie' });
                });
                await sb.from('haccp_records').insert(records);
                results.haccp = { success: true, message: records.length + ' HACCP-sjablonen voor ' + menuItems.length + ' gerechten' };
            } else {
                results.haccp = { success: true, message: 'Geen menu-items voor HACCP' };
            }
        } catch (e: any) {
            results.haccp = { success: false, message: 'HACCP fout: ' + e.message };
        }

        return NextResponse.json({
            success: true,
            message: 'Offerte geaccepteerd en workflow uitgevoerd',
            eventId: eventId,
            workflow: results
        });

    } catch (e: any) {
        console.error('[ACCEPT-API] Error:', e);
        return NextResponse.json({ error: 'Server fout: ' + (e.message || '') }, { status: 500 });
    }
}
