/**
 * /events/[id]/service/plattegrond — Service-modus, plattegrond-tab.
 *
 * Floor-plan editor met gast-pins (allergeen-ring), service-zones en
 * smoker-rookpluim. Was /keuken/board?modus=service&event=X — verhuisd
 * naar event-specifieke route zodat service-werk (gang-flow + plattegrond)
 * onder één event-context valt.
 *
 * Tegenhanger: /events/[id]/service voor de gang-flow.
 */

import PlattegrondClient from './_components/PlattegrondClient';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function PlattegrondPage({ params }: PageProps) {
    const { id } = await params;
    const eventId = parseInt(id, 10);
    if (!Number.isFinite(eventId) || eventId <= 0) {
        return <div className="prep-canvas-wrap prep-canvas-wrap--loading">Ongeldige event-id</div>;
    }
    return <PlattegrondClient eventId={eventId} />;
}
