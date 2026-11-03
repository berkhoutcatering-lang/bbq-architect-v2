/**
 * GET /api/toonbank/v1/partijen (contract 1.4): de open leveringen per product
 * (het A4 van de slager: productiedatum en THT), om bij het stickeren te
 * kiezen. Alleen wat niet is afgesloten en een THT van vandaag of later heeft.
 * Zonder migratie 20261103120000 een lege lijst.
 */
import { NextResponse } from 'next/server';
import { partijenAntwoord } from '@/lib/toonbank/vragen';
import { optionsRoute, toonbankRoute } from '../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const GET = toonbankRoute({ naam: 'partijen' }, async ({ store, orgId }) => {
    return NextResponse.json(partijenAntwoord(await store.partijen(orgId!)), { headers: { 'Cache-Control': 'private, no-cache' } });
});
