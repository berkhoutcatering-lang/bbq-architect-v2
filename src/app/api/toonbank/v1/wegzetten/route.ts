/**
 * GET /api/toonbank/v1/wegzetten (BA-8, contract §1.10, §3.3): de open
 * wegzet-taken (view winkel_wegzet_taken, gefilterd op de organisatie van de
 * sleutel). Alleen ordernummer en naam; geen e-mail of telefoon.
 */
import { NextResponse } from 'next/server';
import { wegzetTakenAntwoord } from '@/lib/toonbank/vragen';
import { optionsRoute, toonbankRoute } from '../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const GET = toonbankRoute({ naam: 'wegzetten' }, async ({ store, orgId }) => {
    return NextResponse.json(wegzetTakenAntwoord(await store.wegzetTaken(orgId!)));
});
