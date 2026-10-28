/**
 * POST /api/toonbank/v1/pinbetalingen (contract 1.3: pinnen via de koppeling met de myPOS).
 * Sleutel + medewerker. Body {poging_id, bon_id, bonnummer, bedrag_cents}. BBQ Architect legt de
 * pinbetaling vast (uniek op poging_id) en stuurt hem dan naar de myPOS van deze tablet via de
 * ePOS API. Hetzelfde poging_id opnieuw: dezelfde stand, nooit een tweede betaling.
 *   200 {poging_id, stand, bedrag_cents, melding, mypos_referentie, terminal}
 *   409 pin_koppeling_uit · 409 terminal_bezet · 503 mypos_onbereikbaar (de tablet pint dan met de hand)
 */
import { PinbetalingVerzoek } from '@/lib/toonbank/contract';
import { startPinbetaling } from '@/lib/toonbank/pinkoppeling';
import { optionsRoute, toonbankRoute, valideer, vanUitkomst } from '../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute({ naam: 'pinbetalingen', medewerker: true, maxBody: 1024 }, async ({ store, body, apparaat }) => {
    const v = valideer(PinbetalingVerzoek, body);
    if ('antwoord' in v) return v.antwoord;
    return vanUitkomst(await startPinbetaling(store, { orgId: apparaat!.organization_id, apparaatId: apparaat!.id }, v.data));
});
