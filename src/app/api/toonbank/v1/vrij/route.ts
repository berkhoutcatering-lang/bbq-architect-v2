/**
 * GET /api/toonbank/v1/vrij?sinds={voorraad_versie} (BA-8, contract §1.9, §3.3).
 * Per product ligt er / gereserveerd / vrij (winkel_vrij_producten) met de
 * reserveringen per order: nummer, naam, afhaalmoment, aantal; nooit e-mail of
 * telefoon. Altijd volledig. ETag op de voorraadversie én vrij_verloopt_at
 * (een verlopen reservering verandert vrij zonder nieuwe versie): met
 * if-none-match en dezelfde stand 304.
 */
import { NextResponse } from 'next/server';
import { vrijAntwoord, vrijEtagSleutel } from '@/lib/toonbank/vragen';
import { etag, foutAntwoord, komtOvereen, nietGewijzigd, optionsRoute, toonbankRoute } from '../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const GET = toonbankRoute({ naam: 'vrij' }, async ({ req, store, orgId }) => {
    const sinds = req.nextUrl.searchParams.get('sinds');
    if (sinds !== null && sinds !== '' && !/^\d{1,15}$/.test(sinds)) {
        return foutAntwoord('ongeldig_verzoek', 'sinds is een versie: een geheel getal van 0 of meer.', { punten: [{ pad: 'sinds', melding: 'geheel getal' }] });
    }
    /* Eerst de stand: het antwoord hoort nooit bij een oudere versie dan zijn getallen. */
    const stand = await store.voorraadStand(orgId!);
    const tag = etag('vrij', vrijEtagSleutel(stand.versie, stand.vrij_verloopt_at));
    if (komtOvereen(req, tag)) return nietGewijzigd(tag);

    const antwoord = vrijAntwoord(await store.vrij(orgId!));
    return NextResponse.json(antwoord, {
        headers: { ETag: etag('vrij', vrijEtagSleutel(antwoord.versie, antwoord.vrij_verloopt_at)), 'Cache-Control': 'private, no-cache' },
    });
});
