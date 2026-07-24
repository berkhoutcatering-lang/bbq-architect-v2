/**
 * POST /api/extension/v2/runs/:runId/tasks/claim — claim de volgende taak (§13.4).
 * Atomair via RPC (FOR UPDATE SKIP LOCKED, lease-based). Een verlopen claim wordt
 * na de lease opnieuw beschikbaar. Claimt alleen als de run 'running' is.
 */

import { NextRequest } from 'next/server';
import { authenticate, resolveRun, readLimitedJson, apiError, apiOk, optionsResponse } from '../../../../_lib/guard';

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
    if (!run) return apiError('RUN_NOT_RESUMABLE', 'Run niet gevonden voor deze organisatie.', 404);
    if (run.status !== 'running') return apiOk({ task: null, runStatus: run.status });

    const body = (await readLimitedJson(req)) as Record<string, unknown> | null;
    const leaseSeconds = Number.isFinite(Number(body?.leaseSeconds)) ? Number(body!.leaseSeconds) : 120;
    const claimedBy = typeof body?.claimedBy === 'string' ? (body!.claimedBy as string).slice(0, 120) : `key:${auth.keyId}`;

    const { data, error } = await sb.rpc('extension_v2_claim_task', {
        p_org: auth.organizationId,
        p_run_id: runId,
        p_lease_seconds: leaseSeconds,
        p_claimed_by: claimedBy,
    });

    if (error) return apiError('RUN_NOT_RESUMABLE', error.message, 500);

    await sb.from('leverancier_sync_runs').update({ heartbeat_at: new Date().toISOString() }).eq('id', runId);
    return apiOk(data ?? { task: null });
}
