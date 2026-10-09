/**
 * POST /api/toonbank/v1/dagstaten (BA-10, contract §1.5, §3.3, §6.6).
 * Sleutel + medewerker. Body: één melding met soort "dagstaat". Eerst in het
 * journaal (de envelop), dan streng (DagstaatMelding), dan verwerken en
 * narekenen uit de bonnen (src/lib/toonbank/dagstaten.ts).
 *   200 {dagstaat_id, journaal: nieuw|bestond, status, verschillen}
 *   400 ongeldig_verzoek (geen JSON of de envelop klopt niet; niets opgeslagen)
 *   426 contract_verouderd (pas ná het opslaan)
 * Weigert nooit om een inhoudelijke reden: een verschil wordt "Te controleren".
 */
import { ontvangDagstaat } from '@/lib/toonbank/dagstaten';
import { naToonbankBoekingen } from '@/lib/toonbank/naAfloop';
import { optionsRoute, toonbankRoute, vanUitkomst } from '../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute({ naam: 'dagstaten', medewerker: true, maxBody: 64 * 1024, bewaarVerouderd: true }, async ({ store, apparaat, body, contract, verouderd }) => {
    const orgId = apparaat!.organization_id;
    const r = await ontvangDagstaat(store, { orgId, apparaatId: apparaat!.id, contract, verouderd }, body);
    naToonbankBoekingen(orgId, r.productIds);
    return vanUitkomst(r.uitkomst);
});
