/**
 * Helpers voor /api/email/inbound — HMAC-verificatie, address-resolve,
 * attachment-staging.
 *
 * De Cloudflare Email Worker stuurt een POST naar /api/email/inbound met deze
 * payload + signature header. Dit bestand bundelt alle helpers zodat de route
 * zelf kort blijft.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServiceSupabase } from './supabase-server';

const STAGING_BUCKET = 'email-attachments';

export interface InboundEmailPayload {
    to: string;
    from: string;
    fromName?: string;
    subject?: string;
    messageId: string;
    bodyExcerpt?: string;
    spfPass?: boolean;
    dkimPass?: boolean;
    attachments: Array<{
        filename: string;
        mimeType: string;
        base64: string;
        sizeBytes?: number;
    }>;
}

/**
 * Verifieer HMAC-signature van Cloudflare Worker.
 * Header `x-cf-signature` = hex(HMAC-SHA256(rawBody, secret)).
 *
 * Returnt true bij match, false bij mismatch of ontbrekende secret.
 * Tijd-veilige vergelijking om timing-attacks te vermijden.
 */
export function verifyInboundSignature(rawBody: string, signatureHeader: string | null): boolean {
    const secret = process.env.EMAIL_INBOUND_SECRET;
    if (!secret) {
        console.warn('[email-inbound] EMAIL_INBOUND_SECRET ontbreekt — alle requests worden afgewezen');
        return false;
    }
    if (!signatureHeader) return false;

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (expected.length !== signatureHeader.length) return false;
    try {
        return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signatureHeader, 'hex'));
    } catch {
        return false;
    }
}

/**
 * Parse `pl-{slug}@in.bbqarchitect.app` of `pl-{slug}@<host>` → slug.
 * Onbekende formaten geven null terug zodat caller een 404 kan retourneren.
 */
export function extractInboxSlug(toAddress: string): string | null {
    const local = (toAddress || '').split('@')[0]?.toLowerCase();
    if (!local) return null;
    const match = local.match(/^pl-([a-z0-9]+)$/);
    return match ? match[1] : null;
}

/**
 * Resolve een inbox-adres naar een organization_id.
 * Gebruikt de v_org_inbox_address view zodat de slug-normalisatie identiek is
 * aan wat de migration definieert.
 */
export async function resolveOrgFromAddress(toAddress: string): Promise<string | null> {
    const slug = extractInboxSlug(toAddress);
    if (!slug) return null;

    const sb = createServiceSupabase();
    const { data } = await sb
        .from('v_org_inbox_address')
        .select('organization_id, inbox_local')
        .eq('inbox_local', `pl-${slug}`)
        .limit(1)
        .maybeSingle();

    return data?.organization_id ?? null;
}

/**
 * Plaats één attachment in Supabase Storage en schrijf de metadata-row.
 * Pad-conventie matcht de RLS-policy in migration 024:
 *   email-attachments/{org_id}/{inbox_id}/{timestamp}-{safeName}
 */
export async function stageAttachment(args: {
    organizationId: string;
    inboxId: string;
    filename: string;
    mimeType: string;
    base64: string;
    sizeBytes?: number;
}): Promise<{ id: string; storagePath: string } | null> {
    const sb = createServiceSupabase();
    const safeName = args.filename
        .toLowerCase()
        .replace(/[^a-z0-9.\-_]+/g, '-')
        .slice(0, 80);
    const storagePath = `${args.organizationId}/${args.inboxId}/${Date.now()}-${safeName}`;

    const buf = Buffer.from(args.base64, 'base64');
    const sizeBytes = args.sizeBytes ?? buf.length;

    /* Storage-upload */
    const upload = await sb.storage
        .from(STAGING_BUCKET)
        .upload(storagePath, buf, {
            contentType: args.mimeType,
            upsert: false,
            cacheControl: '3600',
        });

    if (upload.error) {
        console.error('[email-inbound] storage upload faal:', upload.error.message);
        return null;
    }

    /* Metadata-row */
    const { data, error } = await sb
        .from('org_email_attachments')
        .insert({
            inbox_id: args.inboxId,
            organization_id: args.organizationId,
            filename: args.filename,
            mime_type: args.mimeType,
            storage_path: storagePath,
            size_bytes: sizeBytes,
            parse_status: 'pending',
        })
        .select('id, storage_path')
        .single();

    if (error || !data) {
        console.error('[email-inbound] attachments-row faal:', error?.message);
        return null;
    }

    return { id: data.id, storagePath: data.storage_path };
}

/**
 * Markeer een inbox-row + bijhorende attachments als failed.
 * Wordt gebruikt als parse-pipeline ergens vastloopt.
 */
export async function markInboxFailed(inboxId: string, reason: string): Promise<void> {
    const sb = createServiceSupabase();
    await sb
        .from('org_email_inbox')
        .update({ status: 'failed', parse_error: reason.slice(0, 1000) })
        .eq('id', inboxId);
}
