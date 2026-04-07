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

    console.log('[SyncEngine] Offerte', offerte.id, '→ Event', event?.id, created ? '(nieuw)' : '(bijgewerkt)');
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
    console.log('[SyncEngine] PrepTasks aangemaakt voor event', eventId);
}

// ── 3: Offerte → Factuur concept ──────────────────────────────────────────────
export async function autoCreateFactuurDraft(offerte: Offerte & { event_id: number }): Promise<Factuur | null> {
    if (!supabase || !offerte.event_id) return null;

    const existing = await supabase.from('facturen').select('id').eq('event_id', offerte.event_id).limit(1);
    if (existing.data && existing.data.length > 0) return null;

    const count = await supabase.from('facturen').select('id', { count: 'exact', head: true });
    const nr = 'F' + new Date().getFullYear() + '-' + String((count.count || 0) + 1).padStart(3, '0');

    const factuurPayload = {
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

    const res = await supabase.from('facturen').insert(factuurPayload).select().single();
    if (res.data) {
        console.log('[SyncEngine] Factuur-concept aangemaakt:', (res.data as Factuur).nummer);
    }
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
