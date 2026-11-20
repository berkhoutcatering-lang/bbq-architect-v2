/**
 * POST /api/toonbank/v1/pakjes/{stuk_id}/weg (contract 1.4, additief). Sleutel + medewerker,
 * geen body. Een verkeerd gescand pakje weghalen, zolang het nog op voorraad ligt.
 *   200 {weg: boolean}: onwaar als het pakje niet (meer) op voorraad ligt, geen pakje van de
 *   slager is of niet van deze organisatie is.
 */
import { haalPakjeWeg } from '@/lib/toonbank/pakjes';
import { optionsRoute, toonbankRoute, vanUitkomst } from '../../../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute<{ stuk_id: string }>({ naam: 'pakjes-weg', medewerker: true, maxBody: 256 }, async ({ params, store, apparaat }) => {
    return vanUitkomst(await haalPakjeWeg(store, apparaat!.organization_id, params.stuk_id ?? ''));
});
