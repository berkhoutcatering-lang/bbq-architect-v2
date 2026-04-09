'use client';
// ─── BBQ Sync Engine ──────────────────────────────────────────────────────────
// Cross-module synchronisatie: Offerte → Event → PrepTasks → Factuur

import { supabase } from '@/lib/supabase';
import type { Offerte, DbEvent, Factuur } from '@/types';

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

// ── 1: Offerte → Event ────────────────────────────────────────────────────────
export async function syncOffertaToEvent(offerte: Offerte): Promise<{ event: DbEvent | null; created: boolean } | null> {
    if (!supabase) return null;

    const eventId = offerte.event_id;
    const eventDate = offerte.datum || today();
    const eventPayload = {
        name: 'Event ' + (offerte.client_naam || offerte.nummer || 'Onbekend'),
        date: eventDate,
        guests: offerte.aantal_gasten || 0,
        client_naam: offerte.client_naam || '',
        ppp: offerte.basis_prijs_pp || 0,
        status: 'confirmed',
        notes: offerte.notitie || '',
        offerte_id: offerte.id,
    };

    let event: DbEvent | null = null;
    let created = false;

    if (eventId) {
        const upd = await supabase.from('events').update(eventPayload).eq('id', eventId).select().single();
        if (upd.error) {
            console.error('[SyncEngine] Event update error:', upd.error);
            return null;
        }
        event = upd.data as DbEvent | null;
    } else {
        const ins = await supabase.from('events').insert(eventPayload).select().single();
        if (ins.error) {
            console.error('[SyncEngine] Event insert error:', ins.error);
            return null;
        }
        event = ins.data as DbEvent | null;
        created = true;

        if (event) {
            const linkRes = await supabase.from('offertes').update({ event_id: event.id }).eq('id', offerte.id);
            if (linkRes.error) {
                console.error('[SyncEngine] Offerte link error:', linkRes.error);
            }
        }
    }

    if (event) {
        await autoCreatePrepTasks(event.id, eventDate, offerte.client_naam);
    }

    return { event, created };
}

// ── 2: Event → PrepTasks ──────────────────────────────────────────────────────
export async function autoCreatePrepTasks(eventId: number, eventDate: string, clientNaam: string): Promise<void> {
    if (!supabase || !eventId || !eventDate) return;

    const existing = await supabase.from('prep_tasks').select('id').eq('event_id', eventId);
    if (existing.error) {
        console.error('[SyncEngine] PrepTasks check error:', existing.error);
        return;
    }
    if (existing.data && existing.data.length > 0) return;

    const taken = [
        { dagen: 3, text: 'Boodschappen doen & inkoop controleren voor ' + (clientNaam || 'event'), done: false },
        { dagen: 3, text: 'Vlees marineren & voorbereidingen starten', done: false },
        { dagen: 2, text: 'Mise-en-place: sauzen, bijgerechten, desserts voorbereiden', done: false },
        { dagen: 2, text: 'Materiaal & BBQ controleren (schoonmaak, gas, gereedschap)', done: false },
        { dagen: 1, text: 'Materiaal inladen in de bus (RTR-checklist)', done: false },
        { dagen: 1, text: 'Definitieve bevestiging met klant — locatie, timing, dieetwensen', done: false },
        { dagen: 0, text: 'EVENT DAG: opstelling, aansteken BBQ 2 uur voor service', done: false },
    ];

    const rows = taken.map(function (t) {
        return {
            event_id: eventId,
            text: t.text,
            done: t.done,
            dagen: t.dagen,
            datum: addDays(eventDate, -t.dagen),
        };
    });

    const insertRes = await supabase.from('prep_tasks').insert(rows);
    if (insertRes.error) {
        console.error('[SyncEngine] PrepTasks insert error:', insertRes.error);
        return;
    }
}

// ── 3: Offerte → Factuur (auto-verzonden bij acceptatie) ─────────────────────
export async function autoCreateFactuurDraft(offerte: Offerte & { event_id: number }): Promise<Factuur | null> {
    if (!supabase || !offerte.event_id) return null;

    const existing = await supabase.from('facturen').select('id').eq('event_id', offerte.event_id).limit(1);
    if (existing.data && existing.data.length > 0) return null;

    // Gebruik MAX nummer i.p.v. count om duplicaten te voorkomen
    const year = new Date().getFullYear();
    const prefix = 'F' + year + '-';
    const latest = await supabase.from('facturen')
        .select('nummer')
        .like('nummer', prefix + '%')
        .order('nummer', { ascending: false })
        .limit(1);
    let nextNum = 1;
    if (latest.data && latest.data.length > 0) {
        const lastNr = (latest.data[0] as any).nummer || '';
        const numPart = parseInt(lastNr.replace(prefix, ''), 10);
        if (!isNaN(numPart)) nextNum = numPart + 1;
    }
    const nr = prefix + String(nextNum).padStart(3, '0');

    const factuurPayload = {
        nummer: nr,
        event_id: offerte.event_id,
        offerte_id: offerte.id,
        client_naam: offerte.client_naam || '',
        status: 'verzonden',
        datum: today(),
        vervaldatum: addDays(today(), 14),
        items: offerte.items || [],
        korting: offerte.korting || 0,
        notitie: 'Automatisch aangemaakt en verzonden op basis van geaccepteerde offerte ' + (offerte.nummer || offerte.id),
    };

    const res = await supabase.from('facturen').insert(factuurPayload).select().single();
    return res.data as Factuur | null;
}

// ── 4: Volledige offerte acceptatie flow ──────────────────────────────────────
export async function acceptOfferte(offerte: Offerte): Promise<{ event: DbEvent | null; created: boolean; factuur: Factuur | null } | null> {
    if (!supabase) return null;

    await supabase.from('offertes').update({ status: 'geaccepteerd' }).eq('id', offerte.id);

    const result = await syncOffertaToEvent({ ...offerte, status: 'geaccepteerd' } as Offerte);
    if (!result) return null;
    const { event, created } = result;

    let factuur: Factuur | null = null;
    if (event) {
        factuur = await autoCreateFactuurDraft({ ...offerte, event_id: event.id } as Offerte & { event_id: number });
    }

    return { event, created, factuur };
}
