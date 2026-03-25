'use client';
// ─── BBQ Sync Engine ──────────────────────────────────────────────────────────
// Cross-module synchronisatie: Offerte → Event → PrepTasks → Factuur
// Import deze functies in elke pagina die data synchroon wil houden.

import { supabase } from '@/lib/supabase';

// ── Hulpfuncties ──────────────────────────────────────────────────────────────
function today() {
    return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
    var d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

// ── 1: Offerte → Event ────────────────────────────────────────────────────────
/**
 * Maak of update een event op basis van een offerte.
 * Wordt aangeroepen als offerte status → geaccepteerd.
 * @param {Object} offerte - de offerte row
 * @returns {Object} { event, created } - het event en of het nieuw is
 */
export async function syncOffertaToEvent(offerte) {
    if (!supabase) return null;

    // Kijk of er al een event gekoppeld is
    var eventId = offerte.event_id;
    var eventDate = offerte.datum || today();
    var eventPayload = {
        name: 'Event ' + (offerte.client_naam || offerte.nummer || 'Onbekend'),
        date: eventDate,
        guests: offerte.aantal_gasten || 0,
        client_naam: offerte.client_naam || '',
        ppp: offerte.basis_prijs_pp || 0,
        status: 'confirmed',
        notes: offerte.notitie || '',
        offerte_id: offerte.id,
    };

    var event;
    var created = false;

    if (eventId) {
        // Update bestaand event
        var upd = await supabase.from('events').update(eventPayload).eq('id', eventId).select().single();
        event = upd.data;
    } else {
        // Nieuw event aanmaken
        var ins = await supabase.from('events').insert(eventPayload).select().single();
        event = ins.data;
        created = true;

        if (event) {
            // Koppel event_id terug aan offerte
            await supabase.from('offertes').update({ event_id: event.id }).eq('id', offerte.id);
        }
    }

    if (event) {
        // Auto prep-taken aanmaken
        await autoCreatePrepTasks(event.id, eventDate, offerte.client_naam);
    }

    console.log('[SyncEngine] Offerte', offerte.id, '→ Event', event?.id, created ? '(nieuw)' : '(bijgewerkt)');
    return { event, created };
}

// ── 2: Event → PrepTasks ──────────────────────────────────────────────────────
/**
 * Standaard prep-taken aanmaken voor een event.
 * Controleert eerst of er al taken bestaan om duplicaten te voorkomen.
 */
export async function autoCreatePrepTasks(eventId, eventDate, clientNaam) {
    if (!supabase || !eventId || !eventDate) return;

    // Check bestaande taken
    var existing = await supabase.from('prep_tasks').select('id').eq('event_id', eventId);
    if (existing.data && existing.data.length > 0) return; // al aangemaakt

    var taken = [
        { dagen: 3, text: 'Boodschappen doen & inkoop controleren voor ' + (clientNaam || 'event'), done: false },
        { dagen: 3, text: 'Vlees marineren & voorbereidingen starten', done: false },
        { dagen: 2, text: 'Mise-en-place: sauzen, bijgerechten, desserts voorbereiden', done: false },
        { dagen: 2, text: 'Materiaal & BBQ controleren (schoonmaak, gas, gereedschap)', done: false },
        { dagen: 1, text: 'Materiaal inladen in de bus (RTR-checklist)', done: false },
        { dagen: 1, text: 'Definitieve bevestiging met klant — locatie, timing, dieetwensen', done: false },
        { dagen: 0, text: 'EVENT DAG: opstelling, aansteken BBQ 2 uur voor service', done: false },
    ];

    var rows = taken.map(function (t) {
        return {
            event_id: eventId,
            text: t.text,
            done: t.done,
            dagen: t.dagen,
            datum: addDays(eventDate, -t.dagen),
        };
    });

    await supabase.from('prep_tasks').insert(rows);
    console.log('[SyncEngine] PrepTasks aangemaakt voor event', eventId);
}

// ── 3: Offerte → Factuur concept ──────────────────────────────────────────────
/**
 * Maak automatisch een factuur-concept aan op basis van een geaccepteerde offerte.
 * Alleen als er nog geen factuur bestaat voor dit event.
 */
export async function autoCreateFactuurDraft(offerte) {
    if (!supabase || !offerte.event_id) return null;

    // Check bestaande factuur
    var existing = await supabase.from('facturen').select('id').eq('event_id', offerte.event_id).limit(1);
    if (existing.data && existing.data.length > 0) return null; // al aangemaakt

    // Genereer factuurnummer
    var count = await supabase.from('facturen').select('id', { count: 'exact', head: true });
    var nr = 'F' + new Date().getFullYear() + '-' + String((count.count || 0) + 1).padStart(3, '0');

    var factuurPayload = {
        nummer: nr,
        event_id: offerte.event_id,
        offerte_id: offerte.id,
        client_naam: offerte.client_naam || '',
        status: 'concept',
        datum: today(),
        vervaldatum: addDays(today(), 14),
        items: offerte.items || [],
        korting: offerte.korting || 0,
        notitie: 'Automatisch aangemaakt op basis van offerte ' + (offerte.nummer || offerte.id),
    };

    var res = await supabase.from('facturen').insert(factuurPayload).select().single();
    if (res.data) {
        console.log('[SyncEngine] Factuur-concept aangemaakt:', res.data.nummer);
    }
    return res.data;
}

// ── 4: Volledige offerte acceptatie flow ──────────────────────────────────────
/**
 * Master sync: call deze functie als een offerte geaccepteerd wordt.
 * Doet alles in één keer: event, prep-taken, factuur.
 * @returns {{ event, factuur, prepTasksAangemaakt }}
 */
export async function acceptOfferte(offerte) {
    if (!supabase) return null;

    // Update status
    await supabase.from('offertes').update({ status: 'geaccepteerd' }).eq('id', offerte.id);

    // Event aanmaken/bijwerken + prep-taken
    var { event, created } = await syncOffertaToEvent({ ...offerte, status: 'geaccepteerd' });

    // Factuur concept
    var factuur = null;
    if (event) {
        factuur = await autoCreateFactuurDraft({ ...offerte, event_id: event.id });
    }

    return { event, created, factuur };
}
