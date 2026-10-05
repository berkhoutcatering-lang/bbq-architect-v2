/**
 * POST /api/toonbank/v1/koppelen — een tablet koppelen (BA-7b, contract §3.3).
 * Body {koppelcode: "123456", naam?}. Antwoord {apparaat_id, code, naam,
 * sleutel}; de sleutel komt maar één keer. Fout: 403 koppelcode_ongeldig
 * (fout, verlopen, gebruikt of na 25 pogingen), 429 te_snel (10 per minuut per
 * IP in het geheugen, en 5 foute codes per 15 minuten per bron in de database:
 * een IPv4-adres of een IPv6-/56; review M2 klein 7, hercontrole N4b). Geen sleutel nodig; logica in src/lib/toonbank/koppelen.ts.
 */
import { KoppelVerzoek } from '@/lib/toonbank/contract';
import { koppel, koppelBron } from '@/lib/toonbank/koppelen';
import { ipVan, optionsRoute, toonbankRoute, valideer, vanUitkomst } from '../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute({ naam: 'koppelen', sleutel: false, ipPerMinuut: 10, maxBody: 2048 }, async ({ req, store, body }) => {
    const v = valideer(KoppelVerzoek, body);
    if ('antwoord' in v) return v.antwoord;
    return vanUitkomst(await koppel(store, v.data, koppelBron(ipVan(req))));
});
