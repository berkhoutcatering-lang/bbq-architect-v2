'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import type { DbEvent } from '@/types/database.types';

import ServiceTabBar from '@/components/service/ServiceTabBar';
import FloorPlanView from '../../../../../keuken/board/_components/floor-plan/FloorPlanView';

interface Props {
    eventId: number;
}

/**
 * PlattegrondClient — event-bound floor-plan editor.
 *
 * Verschil met de oude /keuken/board?modus=service:
 *   - Zit onder /events/[id]/ namespace → event-context is gegeven, geen picker meer
 *   - Tab-bar bovenaan: switch tussen Gangen (course-flow) ⇄ Plattegrond (deze)
 *   - Service-zones, gast-pins, smoker-pluim — alles via FloorPlanView component
 */
export default function PlattegrondClient({ eventId }: Props) {
    const router = useRouter();
    const { orgId } = useOrg();
    const [event, setEvent] = useState<DbEvent | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!supabase || !orgId) return;
        let cancelled = false;
        async function load() {
            if (!supabase) return;
            setLoading(true);
            const { data, error } = await supabase
                .from('events')
                .select('*')
                .eq('id', eventId)
                .eq('organization_id', orgId)
                .maybeSingle();
            if (cancelled) return;
            if (error || !data) {
                setError('Event niet gevonden of geen toegang');
                setLoading(false);
                return;
            }
            setEvent(data as DbEvent);
            setLoading(false);
        }
        load();
        return () => { cancelled = true; };
    }, [eventId, orgId]);

    return (
        <div className="kds-layout prep-layout">
            {/* Top: event-naam links, tab-bar midden, exit rechts */}
            <div className="kds-top-strip">
                <div className="kds-top-event">
                    <span className="kds-top-event__name">{event?.name || 'Plattegrond'}</span>
                    <span className="kds-top-event__meta">
                        {event?.date && `${event.date}`}
                        {event?.guests ? ` · ${event.guests} gasten` : ''}
                    </span>
                </div>

                <ServiceTabBar eventId={eventId} activeTab="plattegrond" />

                <button
                    onClick={() => router.push(`/events/${eventId}/hub`)}
                    className="kds-top-exit"
                    aria-label="Sluit service-modus"
                    title="Terug naar event"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Body */}
            {loading && (
                <div className="prep-canvas-wrap prep-canvas-wrap--loading">Event laden…</div>
            )}
            {error && (
                <div className="prep-board__placeholder">
                    <h2>Geen toegang</h2>
                    <p>{error}</p>
                </div>
            )}
            {event && !loading && !error && <FloorPlanView event={event} />}

            {/* Vraag Rook FAB */}
            <button
                type="button"
                className="prep-rook-fab"
                onClick={() => window.dispatchEvent(new Event('open-chat'))}
                aria-label="Vraag Rook"
                title="Vraag Rook · Cmd+K"
            >
                <Sparkles size={20} />
                <span className="prep-rook-fab__label">Vraag Rook</span>
            </button>
        </div>
    );
}
