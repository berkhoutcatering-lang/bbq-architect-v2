/**
 * POST /api/extension/v2/runs/:runId/cancel (§13.7 / §8.4)
 * Cancel is persisted op de server. Een al geclaimde taak mag nog veilig ACK'en,
 * maar er wordt daarna niets nieuws geclaimd (claim-route weigert bij niet-running).
 */

import { NextRequest } from 'next/server';
import { authenticate, resolveRun, apiError, apiOk, optionsResponse } from '../../../_lib/guard';

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

    await sb.from('leverancier_sync_runs')
        .update({ status: 'cancelled', finished_at: new Date().toISOString(), finish_reason: 'cancelled_by_user' })
        .eq('id', runId).eq('organization_id', auth.organizationId);
    await sb.from('leveranciers').update({ last_sync_status: 'cancelled' }).eq('id', run.leverancier_id);
    return apiOk({ status: 'cancelled' });
}
