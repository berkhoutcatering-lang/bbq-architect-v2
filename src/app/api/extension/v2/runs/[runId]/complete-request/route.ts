/**
 * POST /api/extension/v2/runs/:runId/complete-request (§13.8)
 * De EXTENSIE vraagt om afronding; de SERVER bepaalt het eindresultaat via RPC.
 * Nooit 'completed' met open taken of onverwacht nul producten.
 */

import { NextRequest } from 'next/server';
import { authenticate, resolveRun, apiError, apiOk, optionsResponse } from '../../../_lib/guard';
import { refreshBoughtInPrices } from '@/lib/dal/priceRefreshBoughtIn';

export const runtime = 'nodejs';

export function OPTIONS() {
    return optionsResponse();
}

export async function POST(req: NextRequest, context: { params: Promise<{ runId: string }> }) {
    const { runId } = await context.params;
    const gate = await authenticate(req);
    if (gate instanceof Response) return gate;
    const { auth, sb } = gate;

    const run = await resolveRun(sb, auth.organizationId, runId);
    if (!run) return apiError('RUN_NOT_RESUMABLE', 'Run niet gevonden.', 404);

    const { data, error } = await sb.rpc('extension_v2_complete_run', {
        p_org: auth.organizationId,
        p_run_id: runId,
    });
    if (error) return apiError('RUN_INCOMPLETE', error.message, 500);

    const status = (data as { status?: string })?.status ?? 'running';
    if (status === 'completed' || status === 'partial' || status === 'failed') {
        const { count } = await sb
            .from('supplier_products')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', auth.organizationId)
            .eq('supplier_id', run.leverancier_id)
            .eq('active', true);
        await sb.from('leveranciers').update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: status,
            products_count: count ?? 0,
        }).eq('id', run.leverancier_id);

        /* Cohesie: laat de zojuist gesynchroniseerde prijzen doorwerken naar
           gerecht-kostprijzen van bought-in componenten die aan deze producten
           gekoppeld zijn (niet-blokkerend — een refresh-fout mag de sync-afronding
           niet breken). */
        let costRefresh: unknown = null;
        try {
            costRefresh = await refreshBoughtInPrices(sb, auth.organizationId);
        } catch (e) {
            console.warn('[v2 complete] bought-in refresh faalde (niet-blokkerend):', (e as Error).message);
        }
        return apiOk({ result: data, costRefresh });
    }

    return apiOk({ result: data });
}
