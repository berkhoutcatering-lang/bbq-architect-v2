/**
 * POST /api/toonbank/v1/wegzetten/{order_id}/ongedaan (BA-8, contract §3.2, §3.3).
 * Sleutel + medewerker. Body {gebeurtenis_id, moment, reden?}. Draait apart
 * zetten dezelfde dag terug via winkel_zet_order_apart_terug (retour per
 * product); verzoek en uitkomst gaan in het journaal. Idempotent op
 * gebeurtenis_id.
 *   200 {uitkomst: ongedaan | niet_apart | geen_taak, voorraad_versie, boekingen}
 *   404 niet_gevonden · 422 niet_zelfde_dag · 422 al_opgehaald (WV011); niets geboekt
 */
import { OngedaanVerzoek } from '@/lib/toonbank/contract';
import { wegzetVraag } from '@/lib/toonbank/vragen';
import { foutAntwoord, optionsRoute, toonbankRoute, valideer, vanUitkomst } from '../../../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute<{ order_id: string }>({ naam: 'wegzetten-ongedaan', medewerker: true, maxBody: 2048 }, async ({ params, store, body, apparaat, sessie, contract }) => {
    if (!/^\d{1,15}$/.test(params.order_id ?? '')) return foutAntwoord('niet_gevonden', 'Deze order bestaat niet.', { order_id: params.order_id ?? null });
    const v = valideer(OngedaanVerzoek, body);
    if ('antwoord' in v) return v.antwoord;
    return vanUitkomst(await wegzetVraag(store, {
        orgId: apparaat!.organization_id, apparaatId: apparaat!.id, medewerkerId: sessie!.medewerker_id, contract,
    }, Number(params.order_id), 'ongedaan', v.data));
});
