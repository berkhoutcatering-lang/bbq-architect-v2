/**
 * GET /api/toonbank/v1/catalogus?sinds={versie} (BA-8, contract §3.3).
 * ETag op de catalogusversie: met if-none-match en dezelfde versie 304. Anders
 * altijd de volledige catalogus (volledig: true); `sinds` wordt gelezen maar
 * nog niet gebruikt (geen gewijzigd_in_versie per rij, contract §1.6).
 * Artikelen met kanaal toonbank, een prijs en geen leeg slot; producten met
 * statiegeld; EAN-codes; groepen. Foto: 256 px uit winkel-fotos.
 */
import { NextResponse } from 'next/server';
import { catalogusAntwoord } from '@/lib/toonbank/vragen';
import { etag, foutAntwoord, komtOvereen, nietGewijzigd, optionsRoute, toonbankRoute } from '../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const GET = toonbankRoute({ naam: 'catalogus' }, async ({ req, store, orgId }) => {
    const sinds = req.nextUrl.searchParams.get('sinds');
    if (sinds !== null && sinds !== '' && !/^\d{1,15}$/.test(sinds)) {
        return foutAntwoord('ongeldig_verzoek', 'sinds is een versie: een geheel getal van 0 of meer.', { punten: [{ pad: 'sinds', melding: 'geheel getal' }] });
    }
    const versie = await store.catalogusVersie(orgId!);
    if (komtOvereen(req, etag('catalogus', versie))) return nietGewijzigd(etag('catalogus', versie));

    const antwoord = catalogusAntwoord(await store.catalogus(orgId!), process.env.NEXT_PUBLIC_SUPABASE_URL ?? null);
    return NextResponse.json(antwoord, { headers: { ETag: etag('catalogus', antwoord.versie), 'Cache-Control': 'private, no-cache' } });
});
