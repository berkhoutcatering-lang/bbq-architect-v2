/**
 * GET /api/toonbank/v1/cadeaubonnen/{code} (contract 1.2: cadeaubonnen). Sleutel.
 * Wat er op een cadeaubon staat: altijd vers (geen ETag), alleen online.
 *   200 {code, status, saldo_cents, gereserveerd_cents, beschikbaar_cents, waarde_cents, geldig_tot}
 *   404 cadeaubon_onbekend
 * Hooguit 60 keer per minuut per IP: een code is als geld, raden moet niet lonen.
 */
import { zoekCadeaubon } from '@/lib/toonbank/cadeaubonnen';
import { optionsRoute, toonbankRoute, vanUitkomst } from '../../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const GET = toonbankRoute<{ code: string }>({ naam: 'cadeaubon', ipPerMinuut: 60 }, async ({ params, store, apparaat }) => {
    return vanUitkomst(await zoekCadeaubon(store, { orgId: apparaat!.organization_id, apparaatId: apparaat!.id, medewerkerId: null }, params.code ?? ''));
});
