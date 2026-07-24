/**
 * POST /api/extension/v2/runs/:runId/pause (§13.7 / §8.4)
 * Stopt nieuwe claims, verwijdert geen data. Body: { reason, retryAfter? }.
 *   needs_login  → paused_needs_login
 *   rate_limited → paused_rate_limited (bewaart retry_after)
 *   manual/anders→ paused
 */

import { NextRequest } from 'next/server';
import { authenticate, resolveRun, readLimitedJson, apiError, apiOk, optionsResponse } from '../../../_lib/guard';

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

    const body = (await readLimitedJson(req)) as Record<string, unknown> | null;
    const reason = typeof body?.reason === 'string' ? body!.reason : 'manual';
    const status = reason === 'needs_login' ? 'paused_needs_login'
        : reason === 'rate_limited' ? 'paused_rate_limited'
            : 'paused';

    const update: Record<string, unknown> = { status, heartbeat_at: new Date().toISOString() };
    if (status === 'paused_rate_limited' && body?.retryAfter) {
        const secs = Number(body.retryAfter);
        if (Number.isFinite(secs) && secs > 0) update.metadata = { ...(run.metadata ?? {}), retry_after: new Date(Date.now() + secs * 1000).toISOString() };
    }

    await sb.from('leverancier_sync_runs').update(update).eq('id', runId).eq('organization_id', auth.organizationId);
    await sb.from('leveranciers').update({ last_sync_status: status }).eq('id', run.leverancier_id);
    return apiOk({ status });
}
