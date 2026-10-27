/**
 * POST /api/toonbank/v1/dozen/{code}/ophalen (BA-10, contract §3.2, §3.3).
 * Sleutel + medewerker. Body {gebeurtenis_id, moment, bon_id, rest, leeftijd},
 * net als bij een order. Via de vernieuwde winkel_doos_ophalen: bij alcohol
 * zonder vaststelling leeftijd_nodig, met de medewerker en de bon. Een
 * volledige doos-URL (…/g/{code}) wordt eerst de code.
 *   200 {uitkomst, order_id, nummer, rest_cents, opgehaald_at, code, nog_open} — elke uitkomst
 *   400 ongeldig_verzoek
 */
import { ophaalVraag } from '@/lib/toonbank/afhalen';
import { DoosOphalenVerzoek } from '@/lib/toonbank/contract';
import { naToonbankBoekingen } from '@/lib/toonbank/naAfloop';
import { scanCode } from '@/lib/toonbank/vragen';
import { foutAntwoord, optionsRoute, toonbankRoute, valideer, vanUitkomst } from '../../../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute<{ code: string }>({ naam: 'doos-ophalen', medewerker: true, maxBody: 2048 }, async ({ params, store, body, apparaat, sessie, contract }) => {
    const code = scanCode(params.code ?? '');
    if (!code) return foutAntwoord('ongeldig_verzoek', 'Geen dooscode.', { punten: [{ pad: 'code', melding: 'leeg' }] });
    const v = valideer(DoosOphalenVerzoek, body);
    if ('antwoord' in v) return v.antwoord;
    const orgId = apparaat!.organization_id;
    const r = await ophaalVraag(store, { orgId, apparaatId: apparaat!.id, medewerkerId: sessie!.medewerker_id, contract },
        { soort: 'doos', code }, v.data);
    naToonbankBoekingen(orgId, r.productIds);
    return vanUitkomst(r.uitkomst);
});
