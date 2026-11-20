/**
 * POST /api/toonbank/v1/codes/{artikel_id}/weghalen (contract 1.4, additief). Sleutel +
 * medewerker, geen body. Ongedaan maken na een verkeerde scan: de streepjescode van het product
 * achter het artikel weghalen.
 *   200 {weg: boolean, catalogus_versie}: onwaar als er geen code was of het artikel er niet is.
 */
import { haalCodeWeg } from '@/lib/toonbank/codes';
import { optionsRoute, toonbankRoute, vanUitkomst } from '../../../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute<{ artikel_id: string }>({ naam: 'codes-weghalen', medewerker: true, maxBody: 256 }, async ({ params, store, apparaat }) => {
    return vanUitkomst(await haalCodeWeg(store, apparaat!.organization_id, params.artikel_id ?? ''));
});
