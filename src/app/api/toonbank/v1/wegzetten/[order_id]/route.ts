/**
 * POST /api/toonbank/v1/wegzetten/{order_id} (BA-8, contract §3.2, §3.3).
 * Sleutel + medewerker. Body {gebeurtenis_id, moment}. Vinkt de wegzet-taak af
 * via winkel_zet_order_apart (bron toonbank); verzoek en uitkomst gaan in het
 * journaal (soort wegzetten). Idempotent op gebeurtenis_id.
 *   200 {uitkomst: apart | al_apart | geen_taak, voorraad_versie, boekingen}
 *   404 niet_gevonden · 409 niet_betaald (WV006) · 422 te_weinig_voorraad (WV010, niets geboekt)
 */
import { WegzetVerzoek } from '@/lib/toonbank/contract';
import { wegzetVraag } from '@/lib/toonbank/vragen';
import { foutAntwoord, optionsRoute, toonbankRoute, valideer, vanUitkomst } from '../../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute<{ order_id: string }>({ naam: 'wegzetten-apart', medewerker: true, maxBody: 2048 }, async ({ params, store, body, apparaat, sessie, contract }) => {
    if (!/^\d{1,15}$/.test(params.order_id ?? '')) return foutAntwoord('niet_gevonden', 'Deze order bestaat niet.', { order_id: params.order_id ?? null });
    const v = valideer(WegzetVerzoek, body);
    if ('antwoord' in v) return v.antwoord;
    return vanUitkomst(await wegzetVraag(store, {
        orgId: apparaat!.organization_id, apparaatId: apparaat!.id, medewerkerId: sessie!.medewerker_id, contract,
    }, Number(params.order_id), 'apart', v.data));
});
