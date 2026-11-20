/**
 * POST /api/toonbank/v1/pakjes (contract 1.4, additief). Sleutel + medewerker, alleen online.
 * Een pakje van de slager (21 PPPP K CCCCC E) binnenmelden vanaf het scherm "Vlees binnen".
 * Body {pakje_id, code, tht, product_id?}. Idempotent op pakje_id: hetzelfde verzoek nog eens geeft
 * hetzelfde antwoord en nooit een tweede pakje. Geen journaalregel.
 *   200 {uitkomst: binnen | onbekend | controlecijfer | geen_prijscode, …}
 *   409 nummer_bezet (de PLU hoort al bij een ander product) · 404 niet_gevonden (product_id)
 *   400 ongeldig_verzoek
 */
import { PakjeBinnenVerzoek } from '@/lib/toonbank/contract';
import { meldPakjeBinnen } from '@/lib/toonbank/pakjes';
import { optionsRoute, toonbankRoute, valideer, vanUitkomst } from '../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute({ naam: 'pakjes', medewerker: true, maxBody: 1024 }, async ({ store, apparaat, body }) => {
    const v = valideer(PakjeBinnenVerzoek, body);
    if ('antwoord' in v) return v.antwoord;
    return vanUitkomst(await meldPakjeBinnen(store, apparaat!.organization_id, v.data));
});
