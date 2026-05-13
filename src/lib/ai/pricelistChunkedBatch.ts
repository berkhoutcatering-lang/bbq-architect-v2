/**
 * Pricelist Chunked Batch — splits een grote PDF (9-100p) in 25p chunks en
 * submit alle chunks naar 1 Anthropic Batch. De poller verwerkt elke chunk,
 * en als alle chunks done zijn triggert aggregator de dedup + write naar
 * org_price_mutations review queue.
 *
 * Pillar #1: AI loopt nooit vast — chunks zijn klein genoeg voor max_tokens
 * Pillar #2: Per chunk retry mogelijk
 * Pillar #4: Per-chunk LLM01 threshold (MAX_LINES_PER_CHUNK = 250)
 * Pillar #5: Quota = 1 parent ongeacht chunkcount
 */
import 'server-only';
import {
    enqueueBatchExtraction,
    type BatchEnqueueItem,
    type ParsedLine,
    parsedLinesArraySchema,
    MAX_LINES_PER_AGGREGATE,
    MODEL_NAME,
} from '@/lib/ai/pricelistPdfPrompt';
import {
    splitPdfBufferIntoChunks,
} from '@/lib/server/pdfSplitServer';
import {
    createChunkRow,
    markUploadStatus,
    getChunkAggregateState,
    deriveParentStatus,
    tryClaimAggregator,
    type ChunkAggregateState,
} from '@/lib/dal/pricelistUploads';
import { processLines } from '@/lib/pricelistProcessor';

export interface EnqueueChunkedArgs {
    parentUploadId: string;
    organizationId: string;
    leverancierId: number | null;
    pdfBuffer: Buffer;
    parentFilename: string;
    userId: string;
}

export interface EnqueueChunkedResult {
    chunkIds: string[];
    chunkTotal: number;
    batchId: string;
}

export async function enqueueChunkedBatch(args: EnqueueChunkedArgs): Promise<EnqueueChunkedResult> {
    const chunks = await splitPdfBufferIntoChunks(args.pdfBuffer);
    if (chunks.length === 0) throw new Error('NO_CHUNKS');

    /* Insert chunk-rijen */
    const chunkIds: string[] = [];
    for (const c of chunks) {
        const id = await createChunkRow({
            organizationId: args.organizationId,
            parentUploadId: args.parentUploadId,
            leverancierId: args.leverancierId,
            chunkIndex: c.chunkIndex,
            chunkTotal: c.chunkTotal,
            pageStart: c.pageStart,
            pageEnd: c.pageEnd,
            sizeBytes: c.buffer.length,
            userId: args.userId,
            parentFilename: args.parentFilename,
        });
        chunkIds.push(id);
    }

    /* Build batch items with chunk-meta voor page-range prompt */
    const items: BatchEnqueueItem[] = chunks.map((c, i) => ({
        uploadId: chunkIds[i],
        pdfBase64: c.buffer.toString('base64'),
        chunkMeta: {
            pageStart: c.pageStart,
            pageEnd: c.pageEnd,
            chunkIndex: c.chunkIndex,
            chunkTotal: c.chunkTotal,
        },
    }));

    const { batchId } = await enqueueBatchExtraction(items);

    /* Mark chunks + parent als parsing met batch_id */
    const now = new Date().toISOString();
    await Promise.all([
        ...chunkIds.map(id => markUploadStatus(id, {
            status: 'parsing',
            anthropic_batch_id: batchId,
            parse_started_at: now,
        })),
        markUploadStatus(args.parentUploadId, {
            status: 'parsing',
            anthropic_batch_id: batchId,
            chunk_total: chunks.length,
            parse_started_at: now,
        }),
    ]);

    return { chunkIds, chunkTotal: chunks.length, batchId };
}

/**
 * Dedup over chunks: groepeer op lower(naam) + lower(eenheid),
 * kies regel met hoogste confidence. Behoud volgorde van eerste verschijning.
 */
export function dedupLines(lines: ParsedLine[]): ParsedLine[] {
    const seen = new Map<string, ParsedLine>();
    for (const l of lines) {
        const key = `${l.parsed_naam.trim().toLowerCase()}|${(l.parsed_eenheid ?? '').trim().toLowerCase()}`;
        const prev = seen.get(key);
        if (!prev || l.confidence > prev.confidence) {
            seen.set(key, l);
        }
    }
    return Array.from(seen.values());
}

/**
 * Trigger aggregator als alle chunks done zijn. Idempotent: tweede call
 * doet niks als parent al `aggregated_at` heeft. Returnt 'pending' | 'done'.
 *
 * Stappen:
 * 1. Load state via getChunkAggregateState
 * 2. Als chunksPending > 0: skip (volgende poll-tick pakt het op)
 * 3. Dedup all lines, check MAX_LINES_PER_AGGREGATE backstop
 * 4. processLines op parent (schrijft mutations + zet parent status='parsed')
 * 5. Override parent status naar 'partial' indien chunksFailed > 0
 */
export async function aggregateParentIfDone(parentUploadId: string): Promise<{
    state: 'pending' | 'done' | 'not_found' | 'already_aggregated';
    productCount?: number;
    failedChunks?: number;
    manualReview?: boolean;
}> {
    const state = await getChunkAggregateState(parentUploadId);
    if (!state) return { state: 'not_found' };

    /* Niet alle chunks done — wachten op volgende tick */
    if (state.chunksPending > 0) {
        return { state: 'pending' };
    }

    /* Atomic claim — voorkomt dubbele processLines bij gelijktijdige chunk-finish.
       Eerste call die hier komt krijgt true; tweede call krijgt false en stopt. */
    const claimed = await tryClaimAggregator(parentUploadId);
    if (!claimed) {
        return { state: 'already_aggregated', productCount: 0, failedChunks: state.chunksFailed };
    }

    /* Alle chunks done — alle gefaald = parent failed */
    if (state.chunksParsed === 0) {
        await markUploadStatus(parentUploadId, {
            status: 'failed',
            parse_error: `Alle ${state.chunkTotal} blokken faalden. Eerste fout: ${state.failedChunks[0]?.error?.slice(0, 200) ?? 'unknown'}`,
            parse_finished_at: new Date().toISOString(),
        });
        return { state: 'done', productCount: 0, failedChunks: state.chunksFailed };
    }

    /* Aggregeer + dedup. LLM01 backstop: > 5000 = manual review required. */
    const rawLines = parsedLinesArraySchema.safeParse(state.allLines);
    if (!rawLines.success) {
        await markUploadStatus(parentUploadId, {
            status: 'failed',
            parse_error: `aggregator_schema_fail: ${rawLines.error.message.slice(0, 200)}`,
            parse_finished_at: new Date().toISOString(),
        });
        return { state: 'done', productCount: 0, failedChunks: state.chunksFailed };
    }

    const deduped = dedupLines(rawLines.data);
    const manualReview = deduped.length > MAX_LINES_PER_AGGREGATE;

    if (manualReview) {
        /* LLM01 backstop: te veel producten = vlag voor handmatige check, geen auto-write */
        await markUploadStatus(parentUploadId, {
            status: 'failed',
            parse_error: `TOO_MANY_LINES_SUSPICIOUS_AGGREGATE:${deduped.length} (limiet ${MAX_LINES_PER_AGGREGATE})`,
            manual_review_required: true,
            parse_finished_at: new Date().toISOString(),
        });
        return { state: 'done', productCount: deduped.length, failedChunks: state.chunksFailed, manualReview: true };
    }

    /* Schrijf naar review queue (source_ref_id = parent). processLines markeert
       de parent als 'parsed' aan het eind. */
    try {
        await processLines({
            organizationId: state.organizationId,
            leverancierId: state.leverancierId,
            uploadId: parentUploadId,
            lines: deduped,
            costCents: state.totalCostCents,
            model: `${MODEL_NAME}-batch-chunked`,
        });
    } catch (e) {
        await markUploadStatus(parentUploadId, {
            status: 'failed',
            parse_error: `aggregator_process_fail: ${(e as Error).message.slice(0, 200)}`,
            parse_finished_at: new Date().toISOString(),
        });
        return { state: 'done', productCount: 0, failedChunks: state.chunksFailed };
    }

    /* Override status naar 'partial' indien een of meer chunks gefaald zijn.
       processLines() zet 'parsed' standaard; we overschrijven alleen als nodig. */
    const finalStatus = deriveParentStatus(state);
    if (finalStatus !== 'parsed') {
        await markUploadStatus(parentUploadId, { status: finalStatus });
    }

    return {
        state: 'done',
        productCount: deduped.length,
        failedChunks: state.chunksFailed,
        manualReview: false,
    };
}

/* Re-export helper voor poller voor consistente status-check */
export type { ChunkAggregateState };
