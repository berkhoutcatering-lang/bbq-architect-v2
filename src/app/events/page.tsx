/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { today } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import EventsTimeline from '@/components/redesign/EventsTimeline';
import type { Event as DbEvent, Offerte } from '@/types';

export default function Events() {
    const { data: events } = useSupabase<DbEvent>('events', []);
    const { data: offertes } = useSupabase<Offerte>('offertes', []);
    const { data: prepTasks } = useSupabase<{ id: number; event_id: number; done: boolean }>('prep_tasks', []);
    const showToast = useToast();
    const router = useRouter();

    async function newEvent() {
        /* Create with sensible defaults, then jump to the hub where the full editor lives. */
        const defaults = {
            name: 'Nieuw event',
            date: today(),
            guests: 50,
            ppp: 45,
            status: 'pending' as const,
            type: 'Particulier',
            location: '',
            client_naam: '',
            client_adres: '',
            client_tel: '',
            client_email: '',
            notitie: '',
            menu: [],
        };
        const { data, error } = await supabase.from('events').insert(defaults).select('id').single();
        if (error || !data) {
            showToast('Fout bij aanmaken: ' + (error?.message || 'onbekend'), 'error');
            return;
        }
        showToast('Event aangemaakt — vul de details aan', 'success');
        router.push(`/events/${data.id}/hub`);
    }

    const sorted = events.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    return (
        <EventsTimeline
            events={sorted}
            offertes={offertes}
            prepTasks={prepTasks}
            onOpen={function (ev) { router.push(`/events/${ev.id}/hub`); }}
            onNew={newEvent}
        />
    );
}
