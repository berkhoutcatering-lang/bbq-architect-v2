/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/**
 * /events/[id]/logistiek — Logistiek tab voor één event.
 *
 * Volgt patroon van andere event-tabs (klantgesprek, prep-counter, etc.):
 * EventTabs bovenaan + LogistiekPanel met 6 collapsible accordion cards.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Smartphone, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import EventTabs from '@/components/EventTabs';
import LogistiekPanel from '@/components/logistiek/LogistiekPanel';
import { AiProposalModalAutoOpen } from '@/components/logistiek/AiProposalModal';

import HubHeader from '@/components/chassis/HubHeader';
interface EventRow {
    id: number;
    name: string | null;
    date: string | null;
    guests: number | null;
    location: string | null;
    client_naam: string | null;
}

export default function EventLogistiekPage() {
    const params = useParams();
    const router = useRouter();
    const eventId = Number.parseInt(String(params.id ?? ''), 10);

    const [event, setEvent] = useState<EventRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [aiPending, setAiPending] = useState(false);

    useEffect(() => {
        if (!Number.isFinite(eventId) || eventId <= 0 || !supabase) { setLoading(false); return; }
        let cancelled = false;
        (async () => {
            const { data: ev } = await supabase
                .from('events')
                .select('id, name, date, guests, location, client_naam')
                .eq('id', eventId)
                .single();
            if (cancelled) return;
            setEvent((ev as EventRow | null) ?? null);

            const { data: pending } = await supabase
                .from('event_checklist_items')
                .select('id')
                .eq('event_id', eventId)
                .eq('ai_pending', true)
                .limit(1);
            if (cancelled) return;
            setAiPending((pending ?? []).length > 0);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [eventId]);

    if (loading) {
        return (
            <div className="redesign-root" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                Laden…
            </div>
        );
    }

    if (!event) {
        return (
            <div className="redesign-root" style={{ padding: 40, textAlign: 'center' }}>
                <p>Event niet gevonden.</p>
                <button onClick={() => router.push('/events')} className="mt-3 px-4 py-2 rounded-lg"
                    style={{ background: 'var(--brand)', color: '#000', fontWeight: 700 }}>
                    Naar events
                </button>
            </div>
        );
    }

    const dateLabel = event.date
        ? new Date(event.date + 'T00:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
        : '';
    const eventNaam = event.client_naam || event.name || `Event #${event.id}`;

    return (
        <div className="redesign-root">
            <div className="main" style={{ padding: '24px 0 40px' }}>
                {/* Dezelfde stapel als de event-hub had: terug-knop, tabs met
                    eyebrow, dan pas een eigen kop. Nu: kop, dan tabs. */}
                <HubHeader
                    kruimels={[{ label: 'Event', href: `/events/${event.id}/hub` }]}
                    titel={eventNaam}
                    onderschrift={`Logistiek · ${event.guests ?? 0} gasten · ${dateLabel}${event.location ? ` · ${event.location}` : ''}`}
                    actie={<>
                        {aiPending && (
                            <Link href={`/logistiek?proposal=${event.id}`} className="btn btn-primary"><Sparkles size={13} /> AI-voorstel klaar</Link>
                        )}
                        <Link href="/logistiek/field" className="btn btn-ghost"><Smartphone size={13} /> Veldmodus</Link>
                    </>}
                />

                <EventTabs eventId={event.id} eventName={event.name ?? undefined} toonKop={false} />

                <LogistiekPanel eventId={event.id} />
            </div>

            {/* Modal opent automatisch bij ?proposal=<eventId>. */}
            <AiProposalModalAutoOpen />
        </div>
    );
}
