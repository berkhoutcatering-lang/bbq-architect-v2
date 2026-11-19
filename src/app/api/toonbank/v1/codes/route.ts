/**
 * POST /api/toonbank/v1/codes (contract 1.4, additief). Sleutel + medewerker, alleen online.
 * Scherm "Codes koppelen" op de Toonbank: de streepjescode (EAN) van een los product vastleggen.
 * Body {artikel_id, code}. Dezelfde code die al bij het product hoort: gewoon "gekoppeld".
 *   200 {uitkomst: gekoppeld | ongeldig | al_gekoppeld | kan_niet, …} · 400 ongeldig_verzoek
 */
import { CodeKoppelVerzoek } from '@/lib/toonbank/contract';
import { koppelCode } from '@/lib/toonbank/codes';
import { optionsRoute, toonbankRoute, valideer, vanUitkomst } from '../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute({ naam: 'codes', medewerker: true, maxBody: 512 }, async ({ store, apparaat, body }) => {
    const v = valideer(CodeKoppelVerzoek, body);
    if ('antwoord' in v) return v.antwoord;
    return vanUitkomst(await koppelCode(store, apparaat!.organization_id, v.data));
});
