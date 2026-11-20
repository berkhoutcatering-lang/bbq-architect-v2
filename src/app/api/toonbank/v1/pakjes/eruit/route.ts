/**
 * POST /api/toonbank/v1/pakjes/eruit (contract 1.4, additief). Sleutel + medewerker, alleen online.
 * Weggooien of invriezen: een pakje van de slager (21…) of een gestickerd stuk kaas (29…) met één
 * scan uit de winkelvoorraad. Body {verzoek_id, code, wat}. Bij gelijke codes het pakje met de
 * vroegste THT. Idempotent op verzoek_id. Geen journaalregel; wie het deed komt uit de sessie.
 *   200 {uitkomst: eruit | niet_op_voorraad | controlecijfer, …}
 *   400 ongeldig_verzoek · 404 niet_gevonden zolang de migratie er niet is
 */
import { PakjeEruitVerzoek } from '@/lib/toonbank/contract';
import { haalPakjeEruit } from '@/lib/toonbank/pakjes';
import { optionsRoute, toonbankRoute, valideer, vanUitkomst } from '../../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute({ naam: 'pakjes-eruit', medewerker: true, maxBody: 1024 }, async ({ store, apparaat, sessie, body }) => {
    const v = valideer(PakjeEruitVerzoek, body);
    if ('antwoord' in v) return v.antwoord;
    return vanUitkomst(await haalPakjeEruit(store, {
        orgId: apparaat!.organization_id, medewerkerId: sessie?.medewerker_id ?? null, apparaatId: apparaat!.id,
    }, v.data));
});
