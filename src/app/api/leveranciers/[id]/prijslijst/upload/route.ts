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
import { extractFromPdfSync, MODEL_NAME } from '@/lib/ai/pricelistPdfPrompt';
import { processLines } from '@/lib/pricelistProcessor';
import { checkRateLimit } from '@/lib/rateLimit';
import { TIER_LIMITS } from '@/lib/featureFlags';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
        return NextResponse.json({
            uploadId: upload.id, deduped: true,
            message: 'Deze PDF is eerder geupload. Open de bestaande review.',
        });
    }

    await markUploadStatus(upload.id, {
        status: 'parsing',
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
        const msg = (e as Error).message || 'unknown';
        await markUploadStatus(upload.id, {
            status: 'failed',
            parse_error: msg.slice(0, 500),
            parse_finished_at: new Date().toISOString(),
        });
        return NextResponse.json({
            error: 'parse_failed', detail: msg, uploadId: upload.id,
        }, { status: 500 });
    }
}
