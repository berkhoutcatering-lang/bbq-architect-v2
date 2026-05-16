/**
 * Gedeelde helper voor poller-routes: verwerkt een Anthropic Batch-result-item.
 *
 * Twee paden:
 * - Upload is STANDALONE (parent_upload_id IS NULL): bestaande flow, schrijf
 *   direct naar org_price_mutations via processLines.
 * - Upload is CHUNK (parent_upload_id IS NOT NULL): sla extracted lines op
 *   chunk-rij, en als alle siblings done zijn: trigger aggregator op parent.
 *
 * Wordt aangeroepen vanuit /api/pricelists/batch/poll (cron) én
 * /api/pricelists/batch/poll-mine (user-triggered).
 */
import 'server-only';
import type AnthropicType from '@anthropic-ai/sdk';
import {
    parseAndValidate,
    estimateBatchCostCents,
    MAX_LINES_PER_CHUNK,
    MODEL_NAME,
} from '@/lib/ai/pricelistPdfPrompt';
import { processLines } from '@/lib/pricelistProcessor';
import { markUploadStatus } from '@/lib/dal/pricelistUploads';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { aggregateParentIfDone } from '@/lib/ai/pricelistChunkedBatch';

export interface PendingUploadRow {
    id: string;
    organization_id: string;
    leverancier_id: number | null;
    anthropic_batch_id: string;
    uploaded_by: string | null;
    parent_upload_id: string | null;
    chunk_index: number | null;
    page_start: number | null;
    page_end: number | null;
}

export interface BatchResultOutcome {
    succeeded: boolean;
    isChunk: boolean;
    parentUploadId?: string;
    aggregated?: boolean;
}

export async function handleBatchResultItem(
    item: AnthropicType.Messages.Batches.MessageBatchIndividualResponse,
    upload: PendingUploadRow,
    opts: { triggeredBy?: 'cron' | 'user_poll' } = {},
): Promise<BatchResultOutcome> {
    const isChunk = upload.parent_upload_id != null;
    const now = new Date().toISOString();

    /* Batch result failed */
    if (item.result.type !== 'succeeded') {
        const errMsg = item.result.type === 'errored'
            ? `batch_error: ${item.result.error?.error?.message ?? 'unknown'}`
            : `batch_${item.result.type}`;
        await markUploadStatus(upload.id, {
            status: 'failed',
            parse_error: errMsg.slice(0, 500),
            parse_finished_at: now,
        });

        /* Chunk failed → check of parent kan aggregeren (andere chunks misschien klaar) */
        if (isChunk && upload.parent_upload_id) {
            await aggregateParentIfDone(upload.parent_upload_id);
            return { succeeded: false, isChunk: true, parentUploadId: upload.parent_upload_id, aggregated: true };
        }
        return { succeeded: false, isChunk: false };
    }

    /* Batch result succeeded: parse JSON */
    const msg = item.result.message;
    const text = msg.content
        .filter((b): b is AnthropicType.TextBlock => b.type === 'text')
        .map(b => b.text).join('');

    let lines;
    try {
        lines = parseAndValidate(text);
    } catch (parseErr) {
        await markUploadStatus(upload.id, {
            status: 'failed',
            parse_error: `parse_fail: ${(parseErr as Error).message}`.slice(0, 500),
            parse_finished_at: now,
        });
        if (isChunk && upload.parent_upload_id) {
            await aggregateParentIfDone(upload.parent_upload_id);
            return { succeeded: false, isChunk: true, parentUploadId: upload.parent_upload_id, aggregated: true };
        }
        return { succeeded: false, isChunk: false };
    }

    /* LLM01 per-chunk threshold (geldt ook voor standalone uploads) */
    if (lines.length > MAX_LINES_PER_CHUNK) {
        await markUploadStatus(upload.id, {
            status: 'failed',
            parse_error: `TOO_MANY_LINES_SUSPICIOUS:${lines.length}`,
            parse_finished_at: now,
        });
        if (isChunk && upload.parent_upload_id) {
            await aggregateParentIfDone(upload.parent_upload_id);
            return { succeeded: false, isChunk: true, parentUploadId: upload.parent_upload_id, aggregated: true };
        }
        return { succeeded: false, isChunk: false };
    }

    /* Cost & usage tracking */
    const u = msg.usage;
    const costCents = estimateBatchCostCents(
        u.input_tokens ?? 0,
        u.output_tokens ?? 0,
        u.cache_read_input_tokens ?? 0,
    );

    logAiUsageServer({
        organization_id: upload.organization_id,
        user_id: upload.uploaded_by,
        action_type: 'other',
        model: `${MODEL_NAME}-batch`,
        tokens_input: u.input_tokens ?? 0,
        tokens_output: u.output_tokens ?? 0,
        tokens_cache_read: u.cache_read_input_tokens ?? 0,
        tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
        cost_eur_cents: costCents,
        metadata: {
            feature: 'pricelist_pdf_extract',
            upload_id: upload.id,
            mode: isChunk ? 'batch_chunk' : 'batch',
            parent_upload_id: upload.parent_upload_id ?? undefined,
            chunk_index: upload.chunk_index ?? undefined,
            triggered_by: opts.triggeredBy ?? 'cron',
        },
    }).catch(() => { /* never block */ });

    /* CHUNK path: store lines on chunk row, trigger aggregator */
    if (isChunk && upload.parent_upload_id) {
        await markUploadStatus(upload.id, {
            status: 'parsed',
            extracted_lines: lines,
            parsed_product_count: lines.length,
            ai_cost_cents: costCents,
            ai_model: `${MODEL_NAME}-batch-chunk`,
            parse_finished_at: now,
        });
        const agg = await aggregateParentIfDone(upload.parent_upload_id);
        return {
            succeeded: true,
            isChunk: true,
            parentUploadId: upload.parent_upload_id,
            aggregated: agg.state === 'done',
        };
    }

    /* STANDALONE path: bestaande flow — direct schrijven naar review queue */
    await processLines({
        organizationId: upload.organization_id,
        leverancierId: upload.leverancier_id,
        uploadId: upload.id,
        lines,
        costCents,
        model: `${MODEL_NAME}-batch`,
    });

    return { succeeded: true, isChunk: false };
}
