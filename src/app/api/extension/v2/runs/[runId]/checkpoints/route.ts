/**
 * POST /api/extension/v2/runs/:runId/checkpoints — transactioneel checkpoint (§13.5).
 *
 * Header: Idempotency-Key: <task idempotency key>
 * Body:   { taskId, observations[], nextTasks[], adapterDiagnostics }
 *
 * De TS-laag beslist accepted/quarantined/rejected + deterministische prijzen;
 * daarna doet één RPC (extension_v2_apply_checkpoint) alle inserts, upserts,
 * ACK en tellerophoging ATOMAIR + idempotent. Dezelfde request tien keer sturen
 * geeft exact hetzelfde resultaat en geen duplicaten.
 */

import { NextRequest } from 'next/server';
import { authenticate, resolveRun, readLimitedJson, apiError, apiOk, optionsResponse } from '../../../_lib/guard';
import { buildCheckpointDecisions, extractIdentityKeys, type CheckpointScope, type PriorInfo } from '@/lib/supplierSync/checkpoint';
import { LIMITS } from '@/lib/supplierSync/observationSchema';

export const runtime = 'nodejs';

export function OPTIONS() {
    return optionsResponse();
}

export async function POST(req: NextRequest, context: { params: Promise<{ runId: string }> }) {
    const { runId } = await context.params;
    const gate = await authenticate(req);
    if (gate instanceof Response) return gate;
    const { auth, sb } = gate;

    const idemKey = req.headers.get('idempotency-key');
    if (!idemKey) return apiError('CHECKPOINT_CONFLICT', 'Idempotency-Key header verplicht.', 400);

    const run = await resolveRun(sb, auth.organizationId, runId);
    if (!run) return apiError('RUN_NOT_RESUMABLE', 'Run niet gevonden voor deze organisatie.', 404);
    if (run.status === 'cancelled') return apiError('RUN_NOT_RESUMABLE', 'Run is geannuleerd.', 409);

    const body = (await readLimitedJson(req)) as Record<string, unknown> | null;
    if (!body) return apiError('INVALID_OBSERVATION', 'Ongeldige of te grote body.', 400);

    const taskId = typeof body.taskId === 'string' ? body.taskId : null;
    if (!taskId) return apiError('CHECKPOINT_CONFLICT', 'taskId verplicht.', 400);

    const observations = Array.isArray(body.observations) ? body.observations : [];
    if (observations.length > LIMITS.maxObservationsPerCheckpoint) {
        return apiError('PAYLOAD_TOO_LARGE', `Maximaal ${LIMITS.maxObservationsPerCheckpoint} observations per checkpoint.`, 413);
    }
    const nextTasks = Array.isArray(body.nextTasks) ? body.nextTasks : [];

    const scope: CheckpointScope = {
        organizationId: auth.organizationId,
        supplierId: run.leverancier_id,
        supplierAccountKey: run.supplier_account_key ?? '',
        adapterKnownActive: true,
    };

    /* Prior-prijzen gericht ophalen (indexed point lookup, geen volledige tabel). */
    const priorByIdentity = new Map<string, PriorInfo>();
    const idKeys = extractIdentityKeys(observations, scope);
    if (idKeys.length > 0) {
        const { data: priors } = await sb
            .from('supplier_products')
            .select('id, identity_key, current_price_id')
            .eq('organization_id', auth.organizationId)
            .in('identity_key', idKeys);
        const priceIds = (priors ?? []).map((p) => p.current_price_id).filter((x): x is number => typeof x === 'number');
        const priceById = new Map<number, number>();
        if (priceIds.length > 0) {
            const { data: prices } = await sb
                .from('supplier_product_prices')
                .select('id, effective_price_ex_vat')
                .in('id', priceIds);
            for (const pr of prices ?? []) {
                priceById.set(pr.id, Math.round(Number(pr.effective_price_ex_vat) * 100));
            }
        }
        for (const p of priors ?? []) {
            if (p.identity_key) {
                priorByIdentity.set(p.identity_key, {
                    effectiveCents: p.current_price_id ? priceById.get(p.current_price_id) ?? null : null,
                });
            }
        }
    }

    const { decisions } = buildCheckpointDecisions(observations, scope, priorByIdentity);

    const { data, error } = await sb.rpc('extension_v2_apply_checkpoint', {
        p_org: auth.organizationId,
        p_run_id: runId,
        p_task_id: taskId,
        p_idempotency_key: idemKey,
        p_decisions: decisions,
        p_next_tasks: nextTasks,
        p_diagnostics: (body.adapterDiagnostics && typeof body.adapterDiagnostics === 'object') ? body.adapterDiagnostics : {},
        p_approved_by: auth.userId,
    });

    if (error) {
        if (/RUN_NOT_FOUND/.test(error.message)) return apiError('RUN_NOT_RESUMABLE', 'Run niet gevonden.', 404);
        return apiError('CHECKPOINT_CONFLICT', error.message, 409);
    }

    return apiOk({ checkpoint: data });
}
