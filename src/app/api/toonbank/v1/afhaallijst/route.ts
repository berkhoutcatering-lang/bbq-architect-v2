/**
 * GET /api/toonbank/v1/afhaallijst?datum={jjjj-mm-dd} (BA-8, contract §3.3).
 * Betaalde afhaalorders van die dag met hun dozen: order_id, nummer, naam,
 * afhaalmoment, alcohol, rest_cents, status, apart_gezet. Alleen naam en
 * ordernummer; geen e-mail of telefoon. versie = afhaallijst_versie (ook in
 * GET status).
 */
import { NextResponse } from 'next/server';
import { afhaallijstAntwoord, leesDatum } from '@/lib/toonbank/vragen';
import { foutAntwoord, optionsRoute, toonbankRoute } from '../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const GET = toonbankRoute({ naam: 'afhaallijst' }, async ({ req, store, orgId }) => {
    const datum = leesDatum(req.nextUrl.searchParams.get('datum'));
    if (!datum) return foutAntwoord('ongeldig_verzoek', 'datum is een dag als jjjj-mm-dd.', { punten: [{ pad: 'datum', melding: 'jjjj-mm-dd' }] });
    return NextResponse.json(afhaallijstAntwoord(await store.afhaallijst(orgId!, datum)));
});
