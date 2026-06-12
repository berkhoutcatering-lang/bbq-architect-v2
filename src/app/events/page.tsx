/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { today } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import EventsListV2 from '@/components/redesign/EventsListV2';
import PageGuideNote from '@/components/PageGuideNote';
import { PartyPopper } from 'lucide-react';
import type { Event as DbEvent, Offerte } from '@/types';

export default function Events() {
    const { data: events } = useSupabase<DbEvent>('events', []);
    const { data: offertes } = useSupabase<Offerte>('offertes', []);
    const { data: prepTasks } = useSupabase<{ id: number; event_id: number; done: boolean }>('prep_tasks', []);
    const showToast = useToast();
    const { orgId } = useOrg();
    const router = useRouter();

    async function newEvent() {
        /* RLS rejects inserts without organization_id. */
        if (!orgId) {
            showToast('Geen organisatie gevonden — ververs de pagina en probeer opnieuw.', 'error');
            return;
        }
        /* Create with sensible defaults, then jump to the hub where the full editor lives. */
        const defaults = {
            organization_id: orgId,
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
        <div className="main-content">
            <PageGuideNote
                id="events"
                accent="#ec4899"
                icon={<PartyPopper size={14} />}
                intro="Hier maak je nieuwe events aan en zie je alle lopende — van offerte-aanvraag tot service en reflectie."
                actions={[
                    { lead: 'Nieuw event', text: 'rechtsboven start een leeg event en springt meteen naar de event-hub waar je alles invult.' },
                    { lead: 'Klik op een event', text: 'om naar zijn hub te gaan — daar leven klantgesprek, prep, HACCP, service en reflectie.' },
                    { lead: 'Status-kleuren in de timeline', text: 'tonen direct welke events bevestigd zijn en welke nog wachten op actie.' },
                ]}
            />
            <EventsListV2
                events={sorted}
                offertes={offertes}
                prepTasks={prepTasks}
                onOpen={function (ev) { router.push(`/events/${ev.id}/hub`); }}
                onNew={newEvent}
            />
        </div>
    );
}
