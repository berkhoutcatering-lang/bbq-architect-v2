/**
 * GET /api/toonbank/v1/pinbetalingen/{poging_id} (contract 1.3). Sleutel + medewerker.
 * De stand van een pinbetaling via de koppeling; zolang hij wacht, vraagt BBQ Architect het myPOS.
 * De tablet vraagt dit elke 1,5 seconde.
 *   200 {poging_id, stand, bedrag_cents, melding, mypos_referentie, terminal} · 404 niet_gevonden
 */
import { pinbetalingStand } from '@/lib/toonbank/pinkoppeling';
import { foutAntwoord, optionsRoute, toonbankRoute, vanUitkomst } from '../../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = toonbankRoute<{ poging_id: string }>({ naam: 'pinbetaling-stand', medewerker: true }, async ({ params, store, apparaat }) => {
    if (!UUID.test(params.poging_id ?? '')) return foutAntwoord('niet_gevonden', 'Deze pinbetaling kent BBQ Architect niet.', { poging_id: params.poging_id ?? null });
    return vanUitkomst(await pinbetalingStand(store, { orgId: apparaat!.organization_id, apparaatId: apparaat!.id }, params.poging_id.toLowerCase()));
});
