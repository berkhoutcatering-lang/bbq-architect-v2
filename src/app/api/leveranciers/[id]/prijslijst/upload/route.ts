/**
 * POST /api/leveranciers/[id]/prijslijst/upload
 *
 * Realtime PDF-extractie (1 PDF, <60s). Voor PDFs 2..25 → /api/pricelists/batch.
 *
 * Pillar #2: 1e PDF binnen 30s. Pillar #5: BTW NIET AI-derived (zit niet in schema).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkAiCapServer, logAiUsageServer } from '@/lib/aiUsageServer';
import { createUpload, markUploadStatus, countUploadsThisMonth } from '@/lib/dal/pricelistUploads';
import { extractFromPdfSync, MODEL_NAME, humanizeAnthropicError } from '@/lib/ai/pricelistPdfPrompt';
import { processLines } from '@/lib/pricelistProcessor';
import { checkRateLimit } from '@/lib/rateLimit';
import { TIER_LIMITS } from '@/lib/featureFlags';
import {
    getPdfPageCountFromBuffer,
    MAX_PAGES_PER_PDF,
    SYNC_PAGE_THRESHOLD,
} from '@/lib/server/pdfSplitServer';
import { enqueueChunkedBatch } from '@/lib/ai/pricelistChunkedBatch';

export const runtime = 'nodejs';
/* 120s nodig: getPdfPageCount + split + storage upload + Batch enqueue.
   Voor sync path is dit ruim; chunked path doet alleen enqueue (geen wait). */
export const maxDuration = 120;

/* Monthly upload-cap per tier — P1 uit Phase 5 audit (OWASP API6). */
const MONTHLY_PDF_CAP: Record<string, number> = {
    starter: 5,
    professional: 50,
    enterprise: 500,
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
    const { id } = await ctx.params;
    const leverancierId = Number(id);
    if (!Number.isInteger(leverancierId) || leverancierId < 0) {
        return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }

    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: mem } = await sb
        .from('organization_members')
        .select('organization_id, organizations(plan)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    const orgId = (mem?.organization_id ?? null) as string | null;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    /* Verify leverancier-scope (skip als levId=0 — bulk-upload zonder gekoppelde lev) */
    if (leverancierId > 0) {
        const { data: lev } = await sb
            .from('leveranciers')
            .select('id')
            .eq('id', leverancierId)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (!lev) return NextResponse.json({ error: 'Leverancier niet gevonden' }, { status: 404 });
    }

    /* Rate-limit: 10 PDFs / 60s per org */
    const rl = checkRateLimit(`pricelist-upload:${orgId}`, 10);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: 'rate_limited', resetInSeconds: rl.resetInSeconds },
            { status: 429 },
        );
    }

    /* Monthly cap per tier */
    const plan = ((mem as unknown as { organizations: { plan: string } })?.organizations?.plan) || 'starter';
    const cap = MONTHLY_PDF_CAP[plan] ?? MONTHLY_PDF_CAP.starter;
    const usedThisMonth = await countUploadsThisMonth(orgId);
    if (usedThisMonth >= cap) {
        return NextResponse.json({
            error: 'monthly_cap_reached',
            used: usedThisMonth, cap, plan,
        }, { status: 429 });
    }

    /* AI cap check */
    const aiCap = await checkAiCapServer(orgId);
    if (!aiCap.allowed) {
        return NextResponse.json({
            error: 'ai_cap_exceeded',
            used: aiCap.used, cap: aiCap.cap, tier: aiCap.tier,
        }, { status: 429 });
    }

    /* Parse upload */
    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        return NextResponse.json({ error: 'invalid_form' }, { status: 400 });
    }
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'no_file' }, { status: 400 });
    if (file.type !== 'application/pdf') return NextResponse.json({ error: 'pdf_only' }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: 'empty_file' }, { status: 400 });
    if (file.size > 32 * 1024 * 1024) return NextResponse.json({ error: 'too_large' }, { status: 413 });

    const buf = Buffer.from(await file.arrayBuffer());

    /* Create upload row + storage upload (dedup-aware) */
    const upload = await createUpload({
        organizationId: orgId,
        userId: user.id,
        leverancierId: leverancierId > 0 ? leverancierId : null,
        filename: file.name,
        pdfBuffer: buf,
        processingMode: 'realtime',
    });

    if (upload.deduped) {
        let message: string;
        if (upload.reassigned) {
            message = 'PDF was eerder zonder leverancier geupload — nu gekoppeld aan deze leverancier.';
        } else if (upload.existingLeverancierId === (leverancierId > 0 ? leverancierId : null)) {
            message = 'Deze PDF is hier al verwerkt — open de bestaande review.';
        } else {
            message = `Deze PDF is al verwerkt onder een andere leverancier (#${upload.existingLeverancierId}).`;
        }
        return NextResponse.json({
            uploadId: upload.id,
            deduped: true,
            reassigned: upload.reassigned,
            existingStatus: upload.existingStatus,
            existingLeverancierId: upload.existingLeverancierId,
            message,
        });
    }

    /* Tel pagina's; bepaalt sync vs chunked-batch vs reject */
    const pageCount = await getPdfPageCountFromBuffer(buf);

    /* P0 fix: pageCount=0 = pdf-lib parse fail (corrupt/encrypted/lege PDF).
       Eerder viel dit stil door naar sync flow waar AI 100s+ kon hangen op
       een onparseable PDF. Nu: fail fast met duidelijke melding. */
    if (pageCount === 0) {
        await markUploadStatus(upload.id, {
            status: 'failed',
            page_count: 0,
            parse_error: 'PDF kon niet gelezen worden — mogelijk corrupt, beveiligd met wachtwoord, of geen geldige PDF.',
            parse_finished_at: new Date().toISOString(),
        });
        return NextResponse.json({
            error: 'pdf_unreadable',
            detail: 'Deze PDF kon niet gelezen worden. Check of het bestand niet beveiligd is met een wachtwoord en probeer opnieuw.',
            uploadId: upload.id,
        }, { status: 400 });
    }

    if (pageCount > MAX_PAGES_PER_PDF) {
        await markUploadStatus(upload.id, {
            status: 'failed',
            page_count: pageCount,
            parse_error: `PDF te groot (${pageCount} pagina's, max ${MAX_PAGES_PER_PDF}). Splits handmatig in delen.`,
            parse_finished_at: new Date().toISOString(),
        });
        return NextResponse.json({
            error: 'pdf_too_large',
            detail: `PDF heeft ${pageCount} pagina's; max ${MAX_PAGES_PER_PDF} per upload. Splits handmatig in delen onder ${MAX_PAGES_PER_PDF} pagina's.`,
            uploadId: upload.id,
            pageCount,
        }, { status: 413 });
    }

    /* CHUNKED PATH: 9-100 pagina's → server-side split + Anthropic Batch */
    if (pageCount > SYNC_PAGE_THRESHOLD) {
        try {
            const result = await enqueueChunkedBatch({
                parentUploadId: upload.id,
                organizationId: orgId,
                leverancierId: leverancierId > 0 ? leverancierId : null,
                pdfBuffer: buf,
                parentFilename: file.name,
                userId: user.id,
            });
            await markUploadStatus(upload.id, { page_count: pageCount });
            return NextResponse.json({
                uploadId: upload.id,
                chunked: true,
                chunkTotal: result.chunkTotal,
                batchId: result.batchId,
                pageCount,
                message: `PDF heeft ${pageCount} pagina's en wordt in ${result.chunkTotal} blokken verwerkt. Geschatte tijd: 1-5 minuten.`,
            });
        } catch (e) {
            const rawMsg = (e as Error).message || 'unknown';
            const userMsg = humanizeAnthropicError(e);
            await markUploadStatus(upload.id, {
                status: 'failed',
                page_count: pageCount,
                parse_error: userMsg.slice(0, 500),
                parse_finished_at: new Date().toISOString(),
            });
            console.warn(`[pricelist-upload] chunked enqueue fail ${upload.id}: ${rawMsg.slice(0, 300)}`);
            return NextResponse.json({
                error: 'chunked_enqueue_failed', detail: userMsg, uploadId: upload.id,
            }, { status: 500 });
        }
    }

    /* SYNC PATH: ≤8 pagina's → realtime extract */
    await markUploadStatus(upload.id, {
        status: 'parsing',
        page_count: pageCount,
        parse_started_at: new Date().toISOString(),
    });

    /* Extract via Anthropic */
    try {
        const result = await extractFromPdfSync({
            pdfBase64: buf.toString('base64'),
        });

        /* Log AI usage (non-blocking) */
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
            metadata: { feature: 'pricelist_pdf_extract', upload_id: upload.id, mode: 'realtime' },
        }).catch(() => { /* never block */ });

        /* Process lines naar review queue */
        const proc = await processLines({
            organizationId: orgId,
            leverancierId: leverancierId > 0 ? leverancierId : null,
            uploadId: upload.id,
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
        await markUploadStatus(upload.id, {
            status: 'failed',
            parse_error: userMsg.slice(0, 500),
            parse_finished_at: new Date().toISOString(),
        });
        /* Log volledige fout server-side voor debugging */
        console.warn(`[pricelist-upload] PDF ${upload.id} fail: ${rawMsg.slice(0, 300)}`);
        return NextResponse.json({
            error: 'parse_failed', detail: userMsg, uploadId: upload.id,
        }, { status: 500 });
    }
}
