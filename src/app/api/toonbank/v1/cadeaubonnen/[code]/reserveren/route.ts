/**
 * POST /api/toonbank/v1/cadeaubonnen/{code}/reserveren (contract 1.2). Sleutel + medewerker.
 * Body {reservering_id, bon_id, bedrag_cents}. BBQ Architect houdt het bedrag 15 minuten vast voor
 * deze bon; afgeschreven wordt pas als de bon binnenkomt (POST bonnen). Dezelfde reservering_id
 * opnieuw: hetzelfde antwoord, niets nieuws.
 *   200 {reservering_id, code, bedrag_cents, beschikbaar_na_cents, verloopt_at}
 *   404 cadeaubon_onbekend · 422 cadeaubon_saldo_te_laag (details beschikbaar_cents),
 *   cadeaubon_verlopen, cadeaubon_geblokkeerd · 400 ongeldig_verzoek
 */
import { CadeaubonReserveerVerzoek } from '@/lib/toonbank/contract';
import { reserveerCadeaubon } from '@/lib/toonbank/cadeaubonnen';
import { optionsRoute, toonbankRoute, valideer, vanUitkomst } from '../../../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute<{ code: string }>({ naam: 'cadeaubon-reserveren', medewerker: true, maxBody: 1024, ipPerMinuut: 60 }, async ({ params, store, apparaat, sessie, body }) => {
    const v = valideer(CadeaubonReserveerVerzoek, body);
    if ('antwoord' in v) return v.antwoord;
    return vanUitkomst(await reserveerCadeaubon(store, { orgId: apparaat!.organization_id, apparaatId: apparaat!.id, medewerkerId: sessie!.medewerker_id }, params.code ?? '', v.data));
});
