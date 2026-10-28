/**
 * POST /api/toonbank/v1/pinbetalingen/{poging_id}/annuleren (contract 1.3). Sleutel + medewerker.
 * De medewerker breekt af: BBQ Architect vraagt de myPOS de betaling te stoppen en geeft de stand.
 * Was hij al gelukt, dan `gelukt`. Twee keer kan geen kwaad.
 *   200 {poging_id, stand, …} · 404 niet_gevonden · 503 mypos_onbereikbaar
 */
import { annuleerPinbetaling } from '@/lib/toonbank/pinkoppeling';
import { foutAntwoord, optionsRoute, toonbankRoute, vanUitkomst } from '../../../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = toonbankRoute<{ poging_id: string }>({ naam: 'pinbetaling-annuleren', medewerker: true, maxBody: 256 }, async ({ params, store, apparaat }) => {
    if (!UUID.test(params.poging_id ?? '')) return foutAntwoord('niet_gevonden', 'Deze pinbetaling kent BBQ Architect niet.', { poging_id: params.poging_id ?? null });
    return vanUitkomst(await annuleerPinbetaling(store, { orgId: apparaat!.organization_id, apparaatId: apparaat!.id }, params.poging_id.toLowerCase()));
});
