/**
 * POST /api/toonbank/v1/pakjes/{stuk_id}/terug (contract 1.4, additief). Sleutel + medewerker,
 * geen body. Een pakje dat per ongeluk is weggegooid of ingevroren weer op voorraad zetten.
 *   200 {terug: boolean}: onwaar als het niet via pakjes/eruit eruit ging, al terug is, in de
 *   vriezerlijst al als gebruikt is afgevinkt of niet van deze organisatie is.
 */
import { zetPakjeTerug } from '@/lib/toonbank/pakjes';
import { optionsRoute, toonbankRoute, vanUitkomst } from '../../../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute<{ stuk_id: string }>({ naam: 'pakjes-terug', medewerker: true, maxBody: 256 }, async ({ params, store, apparaat }) => {
    return vanUitkomst(await zetPakjeTerug(store, apparaat!.organization_id, params.stuk_id ?? ''));
});
