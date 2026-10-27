/**
 * GET /api/toonbank/v1/medewerkers — namen en rol voor het inlogscherm
 * (BA-7b, contract §3.3). Alleen wie actief is en een toonbank_rol heeft.
 * Nooit inloggegevens.
 */
import { NextResponse } from 'next/server';
import { medewerkersAntwoord } from '@/lib/toonbank/status';
import { optionsRoute, toonbankRoute } from '../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const GET = toonbankRoute({ naam: 'medewerkers' }, async ({ store, orgId }) => {
    return NextResponse.json(await medewerkersAntwoord(store, orgId!));
});
