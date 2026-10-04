/**
 * POST /api/toonbank/v1/koppelen — een tablet koppelen (BA-7b, contract §3.3).
 * Body {koppelcode: "123456", naam?}. Antwoord {apparaat_id, code, naam,
 * sleutel}; de sleutel komt maar één keer. Fout: 403 koppelcode_ongeldig
 * (fout, verlopen, gebruikt of na 5 pogingen), 429 te_snel (10 per minuut per
 * IP). Geen sleutel nodig; logica in src/lib/toonbank/koppelen.ts.
 */
import { KoppelVerzoek } from '@/lib/toonbank/contract';
import { koppel } from '@/lib/toonbank/koppelen';
import { optionsRoute, toonbankRoute, valideer, vanUitkomst } from '../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute({ naam: 'koppelen', sleutel: false, ipPerMinuut: 10, maxBody: 2048 }, async ({ store, body }) => {
    const v = valideer(KoppelVerzoek, body);
    if ('antwoord' in v) return v.antwoord;
    return vanUitkomst(await koppel(store, v.data));
});
