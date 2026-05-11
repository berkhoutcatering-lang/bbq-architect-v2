'use client';

import Link from 'next/link';
import { HandPlatter, MapPin } from 'lucide-react';

interface Props {
    eventId: number;
    /** Welke tab is op dit moment actief — bepaalt highlighting. */
    activeTab: 'gangen' | 'plattegrond';
}

/**
 * ServiceTabBar — switcher tussen "Gangen" (course-flow) en "Plattegrond" (floor-plan)
 * binnen de service-modus van een event. Sticky bovenaan.
 *
 * Route-mapping:
 *   - Gangen      → /events/[id]/service
 *   - Plattegrond → /events/[id]/service/plattegrond
 */
export default function ServiceTabBar({ eventId, activeTab }: Props) {
    return (
        <div className="prep-service-tabbar">
            <Link
                href={`/events/${eventId}/service`}
                className={`prep-service-tab ${activeTab === 'gangen' ? 'is-active' : ''}`}
                aria-current={activeTab === 'gangen' ? 'page' : undefined}
            >
                <HandPlatter size={16} />
                <span>Gangen</span>
            </Link>
            <Link
                href={`/events/${eventId}/service/plattegrond`}
                className={`prep-service-tab ${activeTab === 'plattegrond' ? 'is-active' : ''}`}
                aria-current={activeTab === 'plattegrond' ? 'page' : undefined}
            >
                <MapPin size={16} />
                <span>Plattegrond</span>
            </Link>
        </div>
    );
}
