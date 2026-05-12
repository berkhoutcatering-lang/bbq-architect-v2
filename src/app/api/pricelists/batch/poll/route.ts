/**
 * POST /api/pricelists/batch/poll
 *
 * Cron-route (Vercel cron, elke 5 min) of manual trigger. Vraagt Anthropic
 * Batch-API status, parsed alle results, schrijft mutations naar review queue.
 *
 * Auth: x-cron-secret header (Vercel cron sends this automatically when
 * CRON_SECRET env-var is set in vercel.json).
 */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { markUploadStatus } from '@/lib/dal/pricelistUploads';
import { parseAndValidate, estimateBatchCostCents } from '@/lib/ai/pricelistPdfPrompt';
import { processLines } from '@/lib/pricelistProcessor';
import { logAiUsageServer } from '@/lib/aiUsageServer';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface PendingUpload {
    id: string;
    organization_id: string;
    leverancier_id: number | null;
    anthropic_batch_id: string;
    uploaded_by: string | null;
}

export async function POST(req: NextRequest): Promise<Response> {
    /* Auth: alleen cron of admin met secret */
    const secret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
    }

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: pending, error } = await sb
        .from('org_pricelist_uploads')
        .select('id, organization_id, leverancier_id, anthropic_batch_id, uploaded_by')
        .eq('status', 'parsing')
        .not('anthropic_batch_id', 'is', null)
        .limit(200);

    if (error) {
        return NextResponse.json({ error: 'db_query_failed', detail: error.message }, { status: 500 });
    }
    if (!pending || pending.length === 0) {
        return NextResponse.json({ processed: 0, batches: 0 });
    }

    /* Group per batch_id */
    const byBatch = new Map<string, PendingUpload[]>();
    for (const p of pending as PendingUpload[]) {
        if (!p.anthropic_batch_id) continue;
        if (!byBatch.has(p.anthropic_batch_id)) byBatch.set(p.anthropic_batch_id, []);
        byBatch.get(p.anthropic_batch_id)!.push(p);
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let processedCount = 0;
    let batchesEnded = 0;
    const batchErrors: Array<{ batchId: string; err: string }> = [];

    for (const [batchId, uploads] of byBatch) {
        try {
            const batch = await client.messages.batches.retrieve(batchId);
            if (batch.processing_status !== 'ended') {
                continue; // nog niet klaar, volgende cron-tick
            }
            batchesEnded++;

            const stream = await client.messages.batches.results(batchId);
            for await (const item of stream) {
                const upload = uploads.find(u => u.id === item.custom_id);
                if (!upload) continue;

                if (item.result.type !== 'succeeded') {
                    const errMsg = item.result.type === 'errored'
                        ? `batch_error: ${item.result.error?.error?.message ?? 'unknown'}`
                        : `batch_${item.result.type}`;
                    await markUploadStatus(upload.id, {
                        status: 'failed',
                        parse_error: errMsg.slice(0, 500),
                        parse_finished_at: new Date().toISOString(),
                    });
                    continue;
                }

                const msg = item.result.message;
                const text = msg.content
                    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
                    .map(b => b.text).join('');

                try {
                    const lines = parseAndValidate(text);

                    if (lines.length > 500) {
                        await markUploadStatus(upload.id, {
                            status: 'failed',
                            parse_error: `TOO_MANY_LINES_SUSPICIOUS:${lines.length}`,
                            parse_finished_at: new Date().toISOString(),
                        });
                        continue;
                    }

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
                        model: 'claude-sonnet-4-6-batch',
                        tokens_input: u.input_tokens ?? 0,
                        tokens_output: u.output_tokens ?? 0,
                        tokens_cache_read: u.cache_read_input_tokens ?? 0,
                        tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
                        cost_eur_cents: costCents,
                        metadata: {
                            feature: 'pricelist_pdf_extract',
                            upload_id: upload.id,
                            mode: 'batch',
                            batch_id: batchId,
                        },
                    }).catch(() => { /* never block */ });

                    await processLines({
                        organizationId: upload.organization_id,
                        leverancierId: upload.leverancier_id,
                        uploadId: upload.id,
                        lines,
                        costCents,
                        model: 'claude-sonnet-4-6-batch',
                    });
                    processedCount++;
                } catch (parseErr) {
                    await markUploadStatus(upload.id, {
                        status: 'failed',
                        parse_error: `parse_fail: ${(parseErr as Error).message}`.slice(0, 500),
                        parse_finished_at: new Date().toISOString(),
                    });
                }
            }
        } catch (e) {
            batchErrors.push({ batchId, err: (e as Error).message });
        }
    }

    return NextResponse.json({
        processed: processedCount,
        batches: batchesEnded,
        pendingBatches: byBatch.size - batchesEnded,
        errors: batchErrors,
    });
}

/* GET — manual debug-call. */
export async function GET(req: NextRequest): Promise<Response> {
    return POST(req);
}
