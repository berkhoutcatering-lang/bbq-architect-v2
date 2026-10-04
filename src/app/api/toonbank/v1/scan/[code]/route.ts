/**
 * GET /api/toonbank/v1/scan/{code} (BA-8, contract §2, §3.3) via scan_resolve:
 * een dooscode (of de volledige doos-URL …/g/{code}) → {soort: 'doos', code,
 * order_id, nummer}; de EAN van een één-slot-artikel op de Toonbank →
 * {soort: 'artikel', code, artikel_id}; anders {soort: 'onbekend', code}.
 * De tablet zoekt eerst lokaal; dit is voor wat lokaal niet zeker is.
 */
import { NextResponse } from 'next/server';
import { scanAntwoord } from '@/lib/toonbank/vragen';
import { optionsRoute, toonbankRoute } from '../../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const GET = toonbankRoute<{ code: string }>({ naam: 'scan' }, async ({ params, store, orgId }) => {
    return NextResponse.json(await scanAntwoord(store, orgId!, params.code ?? ''));
});
