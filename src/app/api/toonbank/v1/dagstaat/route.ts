/**
 * GET /api/toonbank/v1/dagstaat?datum={jjjj-mm-dd} (BA-10, contract §3.3).
 * Sleutel + medewerker. Wat BBQ Architect van die dag van deze tablet kent,
 * ter controle bij het afsluiten: {datum, apparaat_code, aantal_bonnen,
 * hoogste_bonnummer, omzet: [{pct, incl_cents, btw_cents}], pin_cents,
 * contant_cents}. De btw per tarief is de som van de bon-btw.
 */
import { NextResponse } from 'next/server';
import { dagstaatOverzichtAntwoord } from '@/lib/toonbank/dagstaten';
import { leesDatum } from '@/lib/toonbank/vragen';
import { foutAntwoord, optionsRoute, toonbankRoute } from '../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const GET = toonbankRoute({ naam: 'dagstaat', medewerker: true }, async ({ req, store, apparaat }) => {
    const datum = leesDatum(req.nextUrl.searchParams.get('datum'));
    if (!datum) return foutAntwoord('ongeldig_verzoek', 'datum is jjjj-mm-dd.', { punten: [{ pad: 'datum', melding: 'jjjj-mm-dd' }] });
    const ruw = await store.dagstaatOverzicht(apparaat!.organization_id, apparaat!.id, datum);
    return NextResponse.json(dagstaatOverzichtAntwoord(ruw));
});
