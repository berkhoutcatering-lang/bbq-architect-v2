import { redirect } from 'next/navigation';

interface PageProps {
    searchParams: Promise<{ modus?: string; event?: string; display?: string }>;
}

/**
 * Backwards-compat redirect — was de oude prep+service-modus-route.
 * Routes splitsen sinds Sprint 2 V1.6:
 *   /keuken/kookbord                              → prep (MEP)
 *   /events/[id]/service/plattegrond              → service floor-plan
 */
export default async function LegacyBoardRedirect({ searchParams }: PageProps) {
    const params = await searchParams;
    const modus = params.modus;
    const eventId = params.event;
    const display = params.display === 'true';

    // Service-modus met event → naar plattegrond-tab op event-route
    if (modus === 'service' && eventId) {
        redirect(`/events/${eventId}/service/plattegrond${display ? '?display=true' : ''}`);
    }

    // Service-modus zonder event → naar kookbord (gebruiker moet event kiezen via /plannen of /vandaag)
    if (modus === 'service') {
        redirect('/keuken/kookbord');
    }

    // Default (geen modus of modus=mep) → kookbord
    redirect(`/keuken/kookbord${display ? '?display=true' : ''}`);
}
