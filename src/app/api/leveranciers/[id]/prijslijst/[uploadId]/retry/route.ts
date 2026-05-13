/**
 * POST /api/leveranciers/[id]/prijslijst/[uploadId]/retry
 *
 * Probeer een eerder gefaalde PDF-upload opnieuw. Twee modes:
 * - Zonder ?chunkId: hele upload retry (standalone sync flow)
 * - Met ?chunkId=<uuid>: per-chunk retry — splits parent PDF opnieuw, neemt
 *   alleen die ene chunk's pagina-range, draait sync extract, triggert
 *   aggregator op parent
 *
 * Max 2 retries per chunk. Daarna blijft chunk 'failed'.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { checkAiCapServer, logAiUsageServer } from '@/lib/aiUsageServer';
import {
    markUploadStatus,
    loadChunkWithParent,
    resetAggregatorForReRun,
} from '@/lib/dal/pricelistUploads';
import {
    extractFromPdfSync,
    MODEL_NAME,
    humanizeAnthropicError,
} from '@/lib/ai/pricelistPdfPrompt';
import { processLines } from '@/lib/pricelistProcessor';
import { checkRateLimit } from '@/lib/rateLimit';
import { splitPdfBufferIntoChunks } from '@/lib/server/pdfSplitServer';
import { aggregateParentIfDone } from '@/lib/ai/pricelistChunkedBatch';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_CHUNK_RETRIES = 2;

export async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ id: string; uploadId: string }> },
): Promise<Response> {
    const { id, uploadId } = await ctx.params;
    const levId = Number(id);
    if (!Number.isInteger(levId) || levId < 0) {
        return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }

    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: mem } = await sb
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    const orgId = mem?.organization_id as string | undefined;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const rl = checkRateLimit(`pricelist-retry:${orgId}`, 5);
    if (!rl.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

    const aiCap = await checkAiCapServer(orgId);
    if (!aiCap.allowed) {
        return NextResponse.json({ error: 'ai_cap_exceeded', tier: aiCap.tier }, { status: 429 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
    }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } },
    );

    /* Decide mode: chunk retry vs whole-upload retry */
    const url = new URL(req.url);
    const chunkId = url.searchParams.get('chunkId');

    if (chunkId) {
        return retryChunk({ chunkId, parentUploadId: uploadId, orgId, levId, userId: user.id, admin });
    }

    return retryWholeUpload({ uploadId, orgId, levId, userId: user.id, admin });
}

interface RetryDeps {
    orgId: string;
    levId: number;
    userId: string;
    admin: SupabaseClient;
}

async function retryWholeUpload(args: RetryDeps & { uploadId: string }): Promise<Response> {
    const { uploadId, orgId, levId, userId, admin } = args;

    const { data: upload, error: upErr } = await admin
        .from('org_pricelist_uploads')
        .select('id, organization_id, leverancier_id, storage_path, status, filename, parent_upload_id')
        .eq('id', uploadId)
        .eq('organization_id', orgId)
        .maybeSingle();

    if (upErr || !upload) {
        return NextResponse.json({ error: 'upload_not_found' }, { status: 404 });
    }
    if (upload.parent_upload_id != null) {
        return NextResponse.json({
            error: 'use_chunk_retry',
            detail: 'Deze rij is een chunk; gebruik ?chunkId=... voor chunk-level retry',
        }, { status: 400 });
    }
    if (upload.status !== 'failed') {
        return NextResponse.json({
            error: 'not_retryable',
            detail: `Status is '${upload.status}', alleen 'failed' kan retry`,
        }, { status: 400 });
    }
    if (levId > 0 && upload.leverancier_id !== levId) {
        return NextResponse.json({ error: 'leverancier_mismatch' }, { status: 403 });
    }

    const { data: pdfBlob, error: dlErr } = await admin.storage
        .from('pricelist-pdfs')
        .download(upload.storage_path as string);
    if (dlErr || !pdfBlob) {
        return NextResponse.json({
            error: 'pdf_not_in_storage',
            detail: dlErr?.message,
        }, { status: 500 });
    }

    await markUploadStatus(upload.id as string, {
        status: 'parsing',
        parse_started_at: new Date().toISOString(),
        parse_error: null,
    });

    const buf = Buffer.from(await pdfBlob.arrayBuffer());

    try {
        const result = await extractFromPdfSync({ pdfBase64: buf.toString('base64') });

        logAiUsageServer({
            organization_id: orgId,
            user_id: userId,
            action_type: 'other',
            model: result.model,
            tokens_input: result.inputTokens,
            tokens_output: result.outputTokens,
            tokens_cache_read: result.cacheReadTokens,
            tokens_cache_creation: result.cacheCreationTokens,
            cost_eur_cents: result.costCents,
            metadata: { feature: 'pricelist_pdf_extract', upload_id: upload.id, mode: 'retry' },
        }).catch(() => { /* never block */ });

        const proc = await processLines({
            organizationId: orgId,
            leverancierId: (upload.leverancier_id as number | null) ?? null,
            uploadId: upload.id as string,
            lines: result.lines,
            costCents: result.costCents,
            model: result.model,
        });

        return NextResponse.json({
            uploadId: upload.id,
            status: 'parsed',
            lineCount: result.lines.length,
            inserted: proc.inserted,
            newCount: proc.newCount,
            updatedCount: proc.updatedCount,
            costCents: result.costCents,
            model: MODEL_NAME,
        });
    } catch (e) {
        const rawMsg = (e as Error).message || 'unknown';
        const userMsg = humanizeAnthropicError(e);
        await markUploadStatus(upload.id as string, {
            status: 'failed',
            parse_error: userMsg.slice(0, 500),
            parse_finished_at: new Date().toISOString(),
        });
        console.warn(`[pricelist-retry] PDF ${upload.id} fail again: ${rawMsg.slice(0, 300)}`);
        return NextResponse.json({
            error: 'retry_failed', detail: userMsg, uploadId: upload.id,
        }, { status: 500 });
    }
}

async function retryChunk(args: RetryDeps & { chunkId: string; parentUploadId: string }): Promise<Response> {
    const { chunkId, parentUploadId, orgId, levId, userId, admin } = args;

    /* Load chunk via DAL helper — bevat parent storage path */
    const chunk = await loadChunkWithParent(chunkId);
    if (!chunk) {
        return NextResponse.json({ error: 'chunk_not_found' }, { status: 404 });
    }
    if (chunk.organizationId !== orgId) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (chunk.parentUploadId !== parentUploadId) {
        return NextResponse.json({ error: 'chunk_parent_mismatch' }, { status: 400 });
    }
    if (levId > 0 && chunk.leverancierId !== levId) {
        return NextResponse.json({ error: 'leverancier_mismatch' }, { status: 403 });
    }
    if (chunk.status !== 'failed') {
        return NextResponse.json({
            error: 'not_retryable',
            detail: `Chunk-status is '${chunk.status}', alleen 'failed' kan retry`,
        }, { status: 400 });
    }
    if (chunk.retryCount >= MAX_CHUNK_RETRIES) {
        return NextResponse.json({
            error: 'max_retries_reached',
            detail: `Chunk al ${MAX_CHUNK_RETRIES}× geprobeerd. Upload de PDF opnieuw.`,
        }, { status: 400 });
    }

    /* Download parent PDF + split + extract die ene chunk */
    const { data: pdfBlob, error: dlErr } = await admin.storage
        .from('pricelist-pdfs')
        .download(chunk.parentStoragePath);
    if (dlErr || !pdfBlob) {
        return NextResponse.json({
            error: 'pdf_not_in_storage',
            detail: dlErr?.message,
        }, { status: 500 });
    }

    await markUploadStatus(chunkId, {
        status: 'parsing',
        retry_count: chunk.retryCount + 1,
        parse_started_at: new Date().toISOString(),
        parse_error: null,
    });

    const parentBuf = Buffer.from(await pdfBlob.arrayBuffer());

    try {
        const chunks = await splitPdfBufferIntoChunks(parentBuf);
        const target = chunks.find(c => c.chunkIndex === chunk.chunkIndex);
        if (!target) {
            throw new Error(`chunk index ${chunk.chunkIndex} niet teruggevonden in split`);
        }

        const result = await extractFromPdfSync({
            pdfBase64: target.buffer.toString('base64'),
            chunkMeta: {
                pageStart: target.pageStart,
                pageEnd: target.pageEnd,
                chunkIndex: target.chunkIndex,
                chunkTotal: target.chunkTotal,
            },
        });

        logAiUsageServer({
            organization_id: orgId,
            user_id: userId,
            action_type: 'other',
            model: result.model,
            tokens_input: result.inputTokens,
            tokens_output: result.outputTokens,
            tokens_cache_read: result.cacheReadTokens,
            tokens_cache_creation: result.cacheCreationTokens,
            cost_eur_cents: result.costCents,
            metadata: {
                feature: 'pricelist_pdf_extract',
                upload_id: chunkId,
                parent_upload_id: parentUploadId,
                mode: 'chunk_retry',
                chunk_index: chunk.chunkIndex,
            },
        }).catch(() => { /* never block */ });

        await markUploadStatus(chunkId, {
            status: 'parsed',
            extracted_lines: result.lines,
            parsed_product_count: result.lines.length,
            ai_cost_cents: result.costCents,
            ai_model: result.model,
            parse_finished_at: new Date().toISOString(),
        });

        /* Als parent al 'partial' of 'failed' was, was aggregator gedraaid met
           onvolledige set. Reset aggregator-claim + pending mutations zodat de
           re-run de nieuwe chunk-lines meeneemt. */
        const { data: parentRow } = await admin
            .from('org_pricelist_uploads')
            .select('status, aggregated_at')
            .eq('id', parentUploadId)
            .maybeSingle();
        if (parentRow && parentRow.aggregated_at != null) {
            await resetAggregatorForReRun(parentUploadId);
        }

        /* Trigger aggregator op parent */
        const agg = await aggregateParentIfDone(parentUploadId);

        return NextResponse.json({
            chunkId,
            parentUploadId,
            status: 'parsed',
            lineCount: result.lines.length,
            costCents: result.costCents,
            parentState: agg.state,
            parentProductCount: agg.productCount,
            parentManualReview: agg.manualReview,
        });
    } catch (e) {
        const rawMsg = (e as Error).message || 'unknown';
        const userMsg = humanizeAnthropicError(e);
        await markUploadStatus(chunkId, {
            status: 'failed',
            parse_error: userMsg.slice(0, 500),
            parse_finished_at: new Date().toISOString(),
        });
        /* Aggregator runt nog steeds — partial-success mogelijk */
        await aggregateParentIfDone(parentUploadId).catch(() => { /* ignore */ });
        console.warn(`[chunk-retry] ${chunkId} fail: ${rawMsg.slice(0, 300)}`);
        return NextResponse.json({
            error: 'chunk_retry_failed',
            detail: userMsg,
            chunkId,
            retryCount: chunk.retryCount + 1,
            maxRetries: MAX_CHUNK_RETRIES,
        }, { status: 500 });
    }
}
