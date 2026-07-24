/**
 * POST /api/extension/v2/runs/:runId/tasks — registreer ontdekte taken (§13.3).
 * Body: { tasks: [{ idempotencyKey, taskType, sourceUrl?, sourceCursor?, payload?, priority? }] }
 * Idempotente upsert op (organization_id, idempotency_key) — geen duplicaten.
 */

import { NextRequest } from 'next/server';
import { authenticate, resolveRun, readLimitedJson, apiError, apiOk, optionsResponse } from '../../../_lib/guard';

export const runtime = 'nodejs';

const TASK_TYPES = ['api_cursor', 'category_page', 'product_detail', 'favorites', 'preflight'];

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

    const body = (await readLimitedJson(req)) as Record<string, unknown> | null;
    const tasks = Array.isArray(body?.tasks) ? body!.tasks : [];
    if (tasks.length === 0) return apiOk({ added: 0 });
    if (tasks.length > 500) return apiError('PAYLOAD_TOO_LARGE', 'Maximaal 500 taken per registratie.', 413);

    const rows = tasks
        .map((t) => t as Record<string, unknown>)
        .filter((t) => typeof t.idempotencyKey === 'string' && TASK_TYPES.includes(t.taskType as string))
        .map((t) => ({
            organization_id: auth.organizationId,
            run_id: runId,
            supplier_id: run.leverancier_id,
            idempotency_key: t.idempotencyKey as string,
            task_type: t.taskType as string,
            source_url: typeof t.sourceUrl === 'string' ? t.sourceUrl : null,
            source_cursor: typeof t.sourceCursor === 'string' ? t.sourceCursor : null,
            payload: (t.payload && typeof t.payload === 'object') ? t.payload : {},
            priority: Number.isFinite(Number(t.priority)) ? Number(t.priority) : 100,
        }));

    if (rows.length === 0) return apiError('INVALID_OBSERVATION', 'Geen geldige taken.', 400);

    const { data: inserted, error } = await sb
        .from('supplier_sync_tasks')
        .upsert(rows, { onConflict: 'organization_id,idempotency_key', ignoreDuplicates: true })
        .select('id');

    if (error) return apiError('CHECKPOINT_CONFLICT', error.message, 500);

    const { count } = await sb
        .from('supplier_sync_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('run_id', runId);
    await sb.from('leverancier_sync_runs').update({ tasks_total: count ?? 0, heartbeat_at: new Date().toISOString() }).eq('id', runId);

    return apiOk({ added: inserted?.length ?? 0, tasksTotal: count ?? 0 });
}
