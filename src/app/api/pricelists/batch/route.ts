/**
 * POST /api/pricelists/batch
 *
 * Enqueue 2-24 PDFs naar Anthropic Batch API (50% korting, delivery binnen 24u
 * meestal binnen 1u). Tag elke upload met batch_id zodat /poll de resultaten
 * terug kan koppelen.
 *
 * Pillar #2: realtime + batch hybrid voor 25-PDFs flow.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkAiCapServer } from '@/lib/aiUsageServer';
import { createUpload, markUploadStatus, countUploadsThisMonth } from '@/lib/dal/pricelistUploads';
import { enqueueBatchExtraction, type BatchEnqueueItem } from '@/lib/ai/pricelistPdfPrompt';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MONTHLY_PDF_CAP: Record<string, number> = {
    starter: 5,
    professional: 50,
    enterprise: 500,
};

export async function POST(req: NextRequest): Promise<Response> {
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

    const rl = checkRateLimit(`pricelist-batch:${orgId}`, 5);
    if (!rl.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

    const aiCap = await checkAiCapServer(orgId);
    if (!aiCap.allowed) {
        return NextResponse.json({ error: 'ai_cap_exceeded', tier: aiCap.tier }, { status: 429 });
    }

    let form: FormData;
    try { form = await req.formData(); }
    catch { return NextResponse.json({ error: 'invalid_form' }, { status: 400 }); }

    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: 'no_files' }, { status: 400 });
    if (files.length > 25) return NextResponse.json({ error: 'too_many', max: 25 }, { status: 400 });

    let leverancierId: number | null = null;
    const metaRaw = form.get('meta');
    if (typeof metaRaw === 'string' && metaRaw.length > 0) {
        try {
            const m = JSON.parse(metaRaw) as { leverancierId?: number | null };
            if (typeof m.leverancierId === 'number' && Number.isFinite(m.leverancierId)) {
                leverancierId = m.leverancierId;
            }
        } catch { /* ignore — meta optional */ }
    }

    /* Monthly cap check */
    const plan = ((mem as unknown as { organizations: { plan: string } })?.organizations?.plan) || 'starter';
    const cap = MONTHLY_PDF_CAP[plan] ?? MONTHLY_PDF_CAP.starter;
    const used = await countUploadsThisMonth(orgId);
    if (used + files.length > cap) {
        return NextResponse.json({
            error: 'monthly_cap_reached', used, cap, plan, attempted: files.length,
        }, { status: 429 });
    }

    /* Scope-check leverancier indien gekoppeld */
    if (leverancierId != null) {
        const { data: lev } = await sb
            .from('leveranciers')
            .select('id')
            .eq('id', leverancierId)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (!lev) leverancierId = null; // fail-safe: drop ipv reject
    }

    /* Upload + create row per PDF */
    const enqueueItems: BatchEnqueueItem[] = [];
    const uploadIds: string[] = [];
    const skipped: Array<{ filename: string; reason: string }> = [];

    for (const f of files) {
        if (f.type !== 'application/pdf') {
            skipped.push({ filename: f.name, reason: 'pdf_only' });
            continue;
        }
        if (f.size === 0 || f.size > 32 * 1024 * 1024) {
            skipped.push({ filename: f.name, reason: 'size_invalid' });
            continue;
        }
        const buf = Buffer.from(await f.arrayBuffer());
        const u = await createUpload({
            organizationId: orgId,
            userId: user.id,
            leverancierId,
            filename: f.name,
            pdfBuffer: buf,
            processingMode: 'batch',
        });
        if (u.deduped) {
            skipped.push({ filename: f.name, reason: 'duplicate' });
            uploadIds.push(u.id);
            continue;
        }
        uploadIds.push(u.id);
        enqueueItems.push({ uploadId: u.id, pdfBase64: buf.toString('base64') });
        await markUploadStatus(u.id, { status: 'queued' });
    }

    if (enqueueItems.length === 0) {
        return NextResponse.json({
            batchId: null, uploadIds, skipped,
            message: 'Niets te verwerken — alle PDFs waren duplicates of invalid',
        });
    }

    /* Enqueue Anthropic Batch */
    try {
        const { batchId } = await enqueueBatchExtraction(enqueueItems);
        await Promise.all(enqueueItems.map(item =>
            markUploadStatus(item.uploadId, {
                status: 'parsing',
                anthropic_batch_id: batchId,
                parse_started_at: new Date().toISOString(),
            }),
        ));
        return NextResponse.json({
            batchId, uploadIds, skipped,
            enqueuedCount: enqueueItems.length,
        });
    } catch (e) {
        const msg = (e as Error).message || 'unknown';
        await Promise.all(enqueueItems.map(item =>
            markUploadStatus(item.uploadId, {
                status: 'failed',
                parse_error: `batch_enqueue_failed: ${msg}`.slice(0, 500),
                parse_finished_at: new Date().toISOString(),
            }),
        ));
        return NextResponse.json({ error: 'batch_enqueue_failed', detail: msg }, { status: 500 });
    }
}
