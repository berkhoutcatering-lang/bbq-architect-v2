/**
 * POST /api/toonbank/v1/cadeaubonnen/{code}/vrijgeven (contract 1.2). Sleutel + medewerker.
 * Body {reservering_id}. De verkoop gaat niet door: de reservering van deze tablet vervalt.
 * Twee keer kan geen kwaad; lukt het niet (geen verbinding), dan vervalt hij vanzelf.
 *   200 {reservering_id, vrijgegeven, beschikbaar_cents} (vrijgegeven onwaar als hij al verlopen,
 *   gebruikt of vrijgegeven was) · 404 cadeaubon_onbekend · 400 ongeldig_verzoek
 */
import { CadeaubonVrijgevenVerzoek } from '@/lib/toonbank/contract';
import { geefCadeaubonVrij } from '@/lib/toonbank/cadeaubonnen';
import { optionsRoute, toonbankRoute, valideer, vanUitkomst } from '../../../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute<{ code: string }>({ naam: 'cadeaubon-vrijgeven', medewerker: true, maxBody: 512 }, async ({ params, store, apparaat, sessie, body }) => {
    const v = valideer(CadeaubonVrijgevenVerzoek, body);
    if ('antwoord' in v) return v.antwoord;
    return vanUitkomst(await geefCadeaubonVrij(store, { orgId: apparaat!.organization_id, apparaatId: apparaat!.id, medewerkerId: sessie!.medewerker_id }, params.code ?? '', v.data));
});
