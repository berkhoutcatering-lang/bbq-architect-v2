/**
 * DAL voor PDF-prijslijst-uploads.
 * Service-role only — bypassed RLS voor server-side flows (storage upload,
 * status-updates door parser, batch-poller).
 *
 * Pillar #4: dedup via SHA-256 content_hash. Twee keer dezelfde PDF uploaden
 * = idempotent. UI toont dat als "al verwerkt" zonder kosten te dupliceren.
 */
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function admin(): SupabaseClient {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY ontbreekt — kan pricelist niet verwerken');
    }
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

export interface CreateUploadArgs {
    organizationId: string;
    userId: string;
    leverancierId: number | null;
    filename: string;
    pdfBuffer: Buffer;
    processingMode: 'realtime' | 'batch';
}

export interface CreateUploadResult {
    id: string;
    storagePath: string;
    deduped: boolean;          // true = identieke hash al eerder geupload, returned existing
    reassigned: boolean;       // true = bestaande upload was niet-gekoppeld en is nu aan leverancier gekoppeld
    existingStatus: string | null; // status van bestaande row (alleen bij deduped)
    existingLeverancierId: number | null;
    contentHash: string;
}

export async function createUpload(args: CreateUploadArgs): Promise<CreateUploadResult> {
    const sb = admin();
    const hash = crypto.createHash('sha256').update(args.pdfBuffer).digest('hex');

    /* Check dedup vóór storage-upload — bespaart bandwidth */
    const { data: existing } = await sb
        .from('org_pricelist_uploads')
        .select('id, storage_path, status, leverancier_id')
        .eq('organization_id', args.organizationId)
        .eq('content_hash', hash)
        .maybeSingle();

    if (existing) {
        let reassigned = false;
        const existingLevId = existing.leverancier_id as number | null;

        /* Bestaande upload had geen leverancier én nieuwe upload heeft er wel een
           → koppel ze automatisch zodat de prijslijsten-page hem toont. */
        if (existingLevId == null && args.leverancierId != null) {
            const { error: relErr } = await sb
                .from('org_pricelist_uploads')
                .update({ leverancier_id: args.leverancierId })
                .eq('id', existing.id);
            if (!relErr) reassigned = true;
        }

        return {
            id: existing.id as string,
            storagePath: existing.storage_path as string,
            deduped: true,
            reassigned,
            existingStatus: (existing.status as string) ?? null,
            existingLeverancierId: reassigned ? args.leverancierId : existingLevId,
            contentHash: hash,
        };
    }

    const storagePath = `${args.organizationId}/${crypto.randomUUID()}.pdf`;

    const { error: upErr } = await sb.storage
        .from('pricelist-pdfs')
        .upload(storagePath, args.pdfBuffer, {
            contentType: 'application/pdf',
            upsert: false,
        });
    if (upErr) throw new Error(`STORAGE_UPLOAD: ${upErr.message}`);

    const { data, error } = await sb
        .from('org_pricelist_uploads')
        .insert({
            organization_id: args.organizationId,
            leverancier_id: args.leverancierId,
            uploaded_by: args.userId,
            filename: args.filename,
            storage_path: storagePath,
            size_bytes: args.pdfBuffer.length,
            content_hash: hash,
            status: 'uploaded',
            processing_mode: args.processingMode,
        })
        .select('id, storage_path')
        .single();

    if (error) {
        /* Race condition: 2 parallel uploads zelfde hash — return existing */
        if (error.code === '23505') {
            const { data: ex2 } = await sb
                .from('org_pricelist_uploads')
                .select('id, storage_path, status, leverancier_id')
                .eq('organization_id', args.organizationId)
                .eq('content_hash', hash)
                .single();
            if (ex2) {
                let reassigned = false;
                if (ex2.leverancier_id == null && args.leverancierId != null) {
                    await sb.from('org_pricelist_uploads')
                        .update({ leverancier_id: args.leverancierId })
                        .eq('id', ex2.id);
                    reassigned = true;
                }
                return {
                    id: ex2.id as string,
                    storagePath: ex2.storage_path as string,
                    deduped: true,
                    reassigned,
                    existingStatus: (ex2.status as string) ?? null,
                    existingLeverancierId: reassigned ? args.leverancierId : (ex2.leverancier_id as number | null),
                    contentHash: hash,
                };
            }
        }
        throw error;
    }

    return {
        id: data.id as string,
        storagePath: data.storage_path as string,
        deduped: false,
        reassigned: false,
        existingStatus: null,
        existingLeverancierId: null,
        contentHash: hash,
    };
}

export interface UploadStatusPatch {
    status?: string;
    anthropic_batch_id?: string;
    parse_started_at?: string;
    parse_finished_at?: string;
    parsed_product_count?: number;
    new_count?: number;
    updated_count?: number;
    ai_cost_cents?: number;
    ai_model?: string;
    page_count?: number;
    parse_error?: string | null;
    chunk_total?: number;
    aggregated_at?: string;
    extracted_lines?: unknown;
    retry_count?: number;
    manual_review_required?: boolean;
}

export async function markUploadStatus(uploadId: string, patch: UploadStatusPatch): Promise<void> {
    const sb = admin();
    const { error } = await sb.from('org_pricelist_uploads').update(patch).eq('id', uploadId);
    if (error) {
        console.warn(`[pricelistUploads] mark status fail ${uploadId}: ${error.message}`);
    }
}

/**
 * Tel uploads van deze maand voor cap-check (API6 OWASP).
 * Filter: alleen parents tellen mee (chunks zijn 'sub-uploads' van dezelfde PDF
 * en mogen quota niet vermenigvuldigen).
 */
export async function countUploadsThisMonth(organizationId: string): Promise<number> {
    const sb = admin();
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const { count } = await sb
        .from('org_pricelist_uploads')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .is('parent_upload_id', null)
        .gte('created_at', startOfMonth.toISOString());
    return count ?? 0;
}

/* ── Chunked-upload helpers ────────────────────────────────────────────────
   Een grote PDF (9-100p) wordt server-side in chunks van 25p geknipt en als
   sub-rijen onder een parent-rij opgeslagen. Chunks hebben geen content_hash
   en geen storage_path — de originele PDF zit eenmalig in storage onder de
   parent-rij. */

export interface CreateChunkRowArgs {
    organizationId: string;
    parentUploadId: string;
    leverancierId: number | null;
    chunkIndex: number;
    chunkTotal: number;
    pageStart: number;
    pageEnd: number;
    sizeBytes: number;
    userId: string;
    parentFilename: string;
}

export async function createChunkRow(args: CreateChunkRowArgs): Promise<string> {
    const sb = admin();
    const { data, error } = await sb
        .from('org_pricelist_uploads')
        .insert({
            organization_id: args.organizationId,
            leverancier_id: args.leverancierId,
            uploaded_by: args.userId,
            filename: `${args.parentFilename} · blok ${args.chunkIndex + 1}/${args.chunkTotal} (p${args.pageStart}-${args.pageEnd})`,
            storage_path: null,
            content_hash: null,
            size_bytes: args.sizeBytes,
            page_count: args.pageEnd - args.pageStart + 1,
            status: 'queued',
            processing_mode: 'batch',
            parent_upload_id: args.parentUploadId,
            chunk_index: args.chunkIndex,
            chunk_total: args.chunkTotal,
            page_start: args.pageStart,
            page_end: args.pageEnd,
        })
        .select('id')
        .single();

    if (error || !data) {
        throw new Error(`CHUNK_INSERT_FAIL: ${error?.message ?? 'unknown'}`);
    }
    return data.id as string;
}

export interface ChunkAggregateState {
    parentUploadId: string;
    organizationId: string;
    leverancierId: number | null;
    chunkTotal: number;
    chunksParsed: number;
    chunksFailed: number;
    chunksPending: number;
    allLines: unknown[];          // ParsedLine[] geaggregeerd
    totalCostCents: number;
    failedChunks: Array<{ id: string; chunkIndex: number; pageStart: number; pageEnd: number; error: string }>;
}

/**
 * Check chunk-progress voor een parent. Returnt geaggregeerde state zodat de
 * caller kan beslissen of aggregatie nu moet draaien (allChunksDone).
 */
export async function getChunkAggregateState(parentUploadId: string): Promise<ChunkAggregateState | null> {
    const sb = admin();

    /* Load parent */
    const { data: parent, error: pErr } = await sb
        .from('org_pricelist_uploads')
        .select('id, organization_id, leverancier_id, chunk_total')
        .eq('id', parentUploadId)
        .is('parent_upload_id', null)
        .maybeSingle();
    if (pErr || !parent) return null;

    /* Load all chunks */
    const { data: chunks, error: cErr } = await sb
        .from('org_pricelist_uploads')
        .select('id, chunk_index, page_start, page_end, status, extracted_lines, ai_cost_cents, parse_error')
        .eq('parent_upload_id', parentUploadId)
        .order('chunk_index', { ascending: true });
    if (cErr || !chunks) return null;

    const chunkTotal = (parent.chunk_total as number) ?? chunks.length;
    let parsed = 0;
    let failed = 0;
    let pending = 0;
    const allLines: unknown[] = [];
    let totalCost = 0;
    const failedChunks: ChunkAggregateState['failedChunks'] = [];

    for (const c of chunks) {
        const status = c.status as string;
        if (status === 'parsed') {
            parsed++;
            const lines = c.extracted_lines as unknown[] | null;
            if (Array.isArray(lines)) allLines.push(...lines);
            totalCost += (c.ai_cost_cents as number) ?? 0;
        } else if (status === 'failed') {
            failed++;
            failedChunks.push({
                id: c.id as string,
                chunkIndex: c.chunk_index as number,
                pageStart: c.page_start as number,
                pageEnd: c.page_end as number,
                error: (c.parse_error as string) ?? 'unknown',
            });
        } else {
            pending++;
        }
    }

    return {
        parentUploadId,
        organizationId: parent.organization_id as string,
        leverancierId: (parent.leverancier_id as number | null) ?? null,
        chunkTotal,
        chunksParsed: parsed,
        chunksFailed: failed,
        chunksPending: pending,
        allLines,
        totalCostCents: totalCost,
        failedChunks,
    };
}

/**
 * Load chunk-rij met parent-context. Gebruikt door per-chunk retry endpoint
 * om de originele PDF (storage_path zit op parent) opnieuw te kunnen splitten
 * en alleen deze ene chunk opnieuw te submitten.
 */
export interface ChunkWithParent {
    chunkId: string;
    parentUploadId: string;
    organizationId: string;
    leverancierId: number | null;
    chunkIndex: number;
    chunkTotal: number;
    pageStart: number;
    pageEnd: number;
    status: string;
    retryCount: number;
    parentStoragePath: string;
    parentFilename: string;
    uploadedBy: string | null;
}

export async function loadChunkWithParent(chunkId: string): Promise<ChunkWithParent | null> {
    const sb = admin();
    const { data, error } = await sb
        .from('org_pricelist_uploads')
        .select(`
            id, organization_id, leverancier_id, status, retry_count,
            chunk_index, chunk_total, page_start, page_end, parent_upload_id,
            uploaded_by,
            parent:parent_upload_id ( storage_path, filename )
        `)
        .eq('id', chunkId)
        .not('parent_upload_id', 'is', null)
        .maybeSingle();
    if (error || !data) return null;

    const parent = (data as unknown as { parent: { storage_path: string; filename: string } | null }).parent;
    if (!parent || !parent.storage_path) return null;

    return {
        chunkId: data.id as string,
        parentUploadId: data.parent_upload_id as string,
        organizationId: data.organization_id as string,
        leverancierId: (data.leverancier_id as number | null) ?? null,
        chunkIndex: data.chunk_index as number,
        chunkTotal: data.chunk_total as number,
        pageStart: data.page_start as number,
        pageEnd: data.page_end as number,
        status: data.status as string,
        retryCount: (data.retry_count as number) ?? 0,
        parentStoragePath: parent.storage_path,
        parentFilename: parent.filename,
        uploadedBy: (data.uploaded_by as string | null) ?? null,
    };
}

/**
 * Update parent-status nadat aggregator klaar is. Bepaalt 'parsed'/'partial'/
 * 'failed' op basis van child success-ratio.
 */
export function deriveParentStatus(state: ChunkAggregateState): 'parsed' | 'partial' | 'failed' {
    if (state.chunksFailed === 0 && state.chunksParsed === state.chunkTotal) return 'parsed';
    if (state.chunksParsed === 0) return 'failed';
    return 'partial';
}

/**
 * Atomic claim van de aggregator-lock op een parent-rij. Zet aggregated_at=now
 * en returnt true als deze call de eigenaar werd, false als iemand anders al
 * de claim had. Voorkomt dubbele processLines() bij race-condities tussen
 * chunks die tegelijk binnenkomen.
 */
export async function tryClaimAggregator(parentUploadId: string): Promise<boolean> {
    const sb = admin();
    const { data, error } = await sb
        .from('org_pricelist_uploads')
        .update({ aggregated_at: new Date().toISOString() })
        .eq('id', parentUploadId)
        .is('aggregated_at', null)
        .select('id');
    if (error) {
        console.warn(`[pricelistUploads] tryClaimAggregator fail ${parentUploadId}: ${error.message}`);
        return false;
    }
    return Array.isArray(data) && data.length > 0;
}

/**
 * Reset aggregator zodat een re-run mogelijk is na chunk-retry op een eerder
 * gefaalde of partial parent. Verwijdert pending mutations voor deze parent
 * (status='pending' blijft beperkt; approved/dismissed blijven behouden) en
 * cleart aggregated_at.
 */
export async function resetAggregatorForReRun(parentUploadId: string): Promise<void> {
    const sb = admin();

    /* Wis pending mutations van deze parent zodat re-aggregator geen dupes
       inserts. Approved/dismissed rows blijven staan want die zijn user-actions. */
    await sb
        .from('org_price_mutations')
        .delete()
        .eq('source_ref_id', parentUploadId)
        .eq('status', 'pending');

    /* Reset aggregator-claim én parse_error zodat opnieuw kan draaien */
    await sb
        .from('org_pricelist_uploads')
        .update({
            aggregated_at: null,
            parse_error: null,
            parse_finished_at: null,
            manual_review_required: false,
        })
        .eq('id', parentUploadId);
}
