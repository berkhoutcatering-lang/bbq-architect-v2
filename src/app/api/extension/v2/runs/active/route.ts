/**
 * GET /api/extension/v2/runs/active?supplierId=123&accountKey=... (§13.2)
 * Retourneert de actieve of gepauzeerde run met volledige tellingen, of null.
 */

import { NextRequest } from 'next/server';
import { authenticate, verifySupplier, apiError, apiOk, optionsResponse } from '../../_lib/guard';

export const runtime = 'nodejs';

export function OPTIONS() {
    return optionsResponse();
}

const ACTIVE = ['running', 'paused', 'paused_needs_login', 'paused_rate_limited'];

export async function GET(req: NextRequest) {
    const gate = await authenticate(req);
    if (gate instanceof Response) return gate;
    const { auth, sb } = gate;

    const supplierId = Number(req.nextUrl.searchParams.get('supplierId'));
    const accountKey = req.nextUrl.searchParams.get('accountKey') ?? '';

    const lev = await verifySupplier(sb, auth.organizationId, supplierId);
    if (!lev) return apiError('WRONG_ORIGIN', 'Leverancier niet gevonden voor deze organisatie.', 404);

    // Actieve/gepauzeerde run, OF een run die net (<5 min) is afgerond — zodat het
    // side panel de eindstatus (completed/partial/failed) nog kan tonen i.p.v. te bevriezen.
    const recentlyFinished = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: run } = await sb
        .from('leverancier_sync_runs')
        .select('*')
        .eq('organization_id', auth.organizationId)
        .eq('leverancier_id', supplierId)
        .or(`status.in.(${ACTIVE.join(',')}),finished_at.gte.${recentlyFinished}`)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!run) return apiOk({ run: null });
    if (accountKey && (run.supplier_account_key ?? '') !== accountKey) return apiOk({ run: null });

    return apiOk({ run });
}
