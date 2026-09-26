/**
 * GET/POST /api/cron/voorraad-dagstart
 *
 * Elke ochtend (W4, besluit Mathijs 26 sep): alle voorraadmeldingen opnieuw
 * bekijken — winkel, pakketten, vooruitkijken én keuken — en daarna één
 * overzicht mailen naar winkel_instellingen.melding_email. "Op" en "pakket
 * dicht" gaan daarnaast al direct bij de mutatie.
 *
 * Schema: 07:00 UTC = 08:00 in de winter (december), 09:00 in de zomer.
 * Vercel Hobby staat alleen dagelijkse crons toe.
 *
 * Auth: CRON_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';
import { evalueerKeukenMeldingen, evalueerWinkelMeldingen, stuurDagoverzicht } from '@/lib/voorraad/meldingen';

export const runtime = 'nodejs';
export const maxDuration = 120;

async function run(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!cronSecret || provided !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sb = createServiceSupabase();
    const { data: orgs, error } = await sb.from('winkel_instellingen').select('organization_id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const resultaten: { orgId: string; nieuw: number; overzicht: { verstuurd: boolean; aantal: number; fout?: string } }[] = [];
    for (const { organization_id: orgId } of orgs ?? []) {
        const w = await evalueerWinkelMeldingen(orgId as string);
        const k = await evalueerKeukenMeldingen(orgId as string);
        const overzicht = await stuurDagoverzicht(orgId as string);
        resultaten.push({ orgId: orgId as string, nieuw: w.length + k.length, overzicht });
    }
    return NextResponse.json({ ok: true, resultaten });
}

export const GET = run;
export const POST = run;
