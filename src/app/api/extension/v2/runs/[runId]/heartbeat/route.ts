/**
 * POST /api/extension/v2/runs/:runId/heartbeat (§13.6)
 * Alleen voor zichtbaarheid en stale-detectie — niet om correctness te garanderen.
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

    await sb.from('leverancier_sync_runs').update({ heartbeat_at: new Date().toISOString() }).eq('id', runId);
    return apiOk({ status: run.status });
}
