/**
 * POST /api/pricelists/batch/poll
 *
 * Cron-route (Vercel cron, elke 5 min) of manual trigger. Vraagt Anthropic
 * Batch-API status, parsed alle results, schrijft mutations naar review queue.
 *
 * Chunk-aware: items met parent_upload_id krijgen lines opgeslagen op chunk-rij
 * en triggeren parent-aggregator als alle siblings done zijn.
 *
 * Auth: x-cron-secret header (Vercel cron sends this automatically when
 * CRON_SECRET env-var is set in vercel.json).
 */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { handleBatchResultItem, type PendingUploadRow } from '@/lib/ai/pricelistBatchProcessing';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

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

    /* Laad alle parsing-uploads met batch_id — chunks EN standalone uploads.
       Parents zonder eigen batch worden in poller niet aangeraakt; die zijn
       container-rijen die via aggregator op chunk-done geüpdatet worden. */
    const { data: pending, error } = await sb
        .from('org_pricelist_uploads')
        .select('id, organization_id, leverancier_id, anthropic_batch_id, uploaded_by, parent_upload_id, chunk_index, page_start, page_end')
        .eq('status', 'parsing')
        .not('anthropic_batch_id', 'is', null)
        .limit(400);

    if (error) {
        return NextResponse.json({ error: 'db_query_failed', detail: error.message }, { status: 500 });
    }
    if (!pending || pending.length === 0) {
        return NextResponse.json({ processed: 0, batches: 0 });
    }

    /* Group per batch_id — exclude parent rows (chunk-parents have batch_id
       same as their chunks; we want chunks here, not the parent placeholder). */
    const byBatch = new Map<string, PendingUploadRow[]>();
    for (const p of pending as PendingUploadRow[]) {
        if (!p.anthropic_batch_id) continue;
        /* Parent met chunks: skip (chunks zelf zijn er ook bij). Een rij is parent
           als parent_upload_id IS NULL EN chunk_index IS NULL. */
        const isContainerParent = p.parent_upload_id == null && p.chunk_index == null
            && pending.some(o => o.parent_upload_id === p.id);
        if (isContainerParent) continue;

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
            if (batch.processing_status !== 'ended') continue;
            batchesEnded++;

            const stream = await client.messages.batches.results(batchId);
            for await (const item of stream) {
                const upload = uploads.find(u => u.id === item.custom_id);
                if (!upload) continue;
                const outcome = await handleBatchResultItem(item, upload, { triggeredBy: 'cron' });
                if (outcome.succeeded) processedCount++;
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
