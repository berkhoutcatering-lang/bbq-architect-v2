/**
 * POST /api/extension/v2/runs/:runId/resume (§13.7)
 * Hervat een gepauzeerde run — status terug naar 'running'. De runner hervat
 * daarna vanaf de eerste niet-bevestigde taak (server is bron van waarheid).
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
    if (run.status === 'cancelled' || run.status === 'completed') {
        return apiError('RUN_NOT_RESUMABLE', `Run met status ${run.status} kan niet hervat worden.`, 409);
    }

    await sb.from('leverancier_sync_runs')
        .update({ status: 'running', heartbeat_at: new Date().toISOString() })
        .eq('id', runId).eq('organization_id', auth.organizationId);
    await sb.from('leveranciers').update({ last_sync_status: 'running' }).eq('id', run.leverancier_id);
    return apiOk({ status: 'running' });
}
