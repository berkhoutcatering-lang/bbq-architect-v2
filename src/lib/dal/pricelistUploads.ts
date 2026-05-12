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
        .gte('created_at', startOfMonth.toISOString());
    return count ?? 0;
}
