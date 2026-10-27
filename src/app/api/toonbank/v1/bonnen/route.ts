/**
 * POST /api/toonbank/v1/bonnen (BA-9, contract §1.2, §3.3, §5, §6.6).
 * Sleutel; de medewerker staat per melding in de body. Body {meldingen: […]},
 * hooguit 50: bonnen, tegenbonnen en de kleine meldingen (pinpoging,
 * inloggen, uitloggen, vrij_overschreden, dag_openen), elk met een eigen
 * soort. Eerst opslaan in het journaal, dan verwerken (src/lib/toonbank/bonnen.ts).
 *   200 {resultaten: [{gebeurtenis_id, journaal: nieuw|bestond, verwerking}], bevestigd_tot_volgnummer}
 *   400 ongeldig_verzoek (geen JSON of de envelop klopt niet; niets opgeslagen)
 *   413 te_groot (meer dan 50, of een te grote body)
 *   426 contract_verouderd (pas ná het opslaan)
 * Weigert nooit om een inhoudelijke reden: wat niet klopt wordt "Te controleren".
 */
import { ontvangBonnen } from '@/lib/toonbank/bonnen';
import { naToonbankBoekingen } from '@/lib/toonbank/naAfloop';
import { optionsRoute, toonbankRoute, vanUitkomst } from '../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute({ naam: 'bonnen', maxBody: 1024 * 1024, bewaarVerouderd: true }, async ({ store, apparaat, body, contract, verouderd }) => {
    const orgId = apparaat!.organization_id;
    const r = await ontvangBonnen(store, { orgId, apparaatId: apparaat!.id, contract, verouderd }, body);
    naToonbankBoekingen(orgId, r.productIds);
    return vanUitkomst(r.uitkomst);
});
