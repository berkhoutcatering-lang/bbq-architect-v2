/**
 * POST /api/leveranciers/[id]/prijslijst/[uploadId]/retry
 *
 * Probeer een eerder gefaalde PDF-upload opnieuw. Haalt de PDF uit Storage,
 * stuurt 'm opnieuw door Anthropic met retry, en schrijft mutations naar
 * review queue. Geen nieuwe upload nodig — saves bandwidth + content_hash
 * dedup conflict wordt vermeden.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { checkAiCapServer, logAiUsageServer } from '@/lib/aiUsageServer';
import { markUploadStatus } from '@/lib/dal/pricelistUploads';
import { extractFromPdfSync, MODEL_NAME, humanizeAnthropicError } from '@/lib/ai/pricelistPdfPrompt';
import { processLines } from '@/lib/pricelistProcessor';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
    _req: NextRequest,
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

    /* Rate limit: 5 retries per minuut per org */
    const rl = checkRateLimit(`pricelist-retry:${orgId}`, 5);
    if (!rl.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

    /* AI cap */
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

    /* Load upload + scope-check */
    const { data: upload, error: upErr } = await admin
        .from('org_pricelist_uploads')
        .select('id, organization_id, leverancier_id, storage_path, status, filename')
        .eq('id', uploadId)
        .eq('organization_id', orgId)
        .maybeSingle();

    if (upErr || !upload) {
        return NextResponse.json({ error: 'upload_not_found' }, { status: 404 });
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

    /* Download PDF van storage */
    const { data: pdfBlob, error: dlErr } = await admin.storage
        .from('pricelist-pdfs')
        .download(upload.storage_path as string);
    if (dlErr || !pdfBlob) {
        return NextResponse.json({
            error: 'pdf_not_in_storage',
            detail: dlErr?.message,
        }, { status: 500 });
    }

    /* Mark as parsing + clear error */
    await markUploadStatus(upload.id as string, {
        status: 'parsing',
        parse_started_at: new Date().toISOString(),
        parse_error: null,
    });

    const buf = Buffer.from(await pdfBlob.arrayBuffer());

    try {
        const result = await extractFromPdfSync({
            pdfBase64: buf.toString('base64'),
        });

        logAiUsageServer({
            organization_id: orgId,
            user_id: user.id,
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
