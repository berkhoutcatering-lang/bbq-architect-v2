/**
 * POST /api/pricelists/batch/poll-mine
 *
 * Geauthenticeerde versie van /api/pricelists/batch/poll die alleen de
 * huidige org's batches polled. Sam kan dit via "Refresh batches"-knop
 * triggeren zodat hij niet 24u op de daily cron hoeft te wachten (Vercel
 * Hobby tier laat alleen daily crons toe).
 *
 * Chunk-aware: items met parent_upload_id krijgen lines opgeslagen op chunk-rij
 * en triggeren parent-aggregator als alle siblings done zijn.
 */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import { handleBatchResultItem, type PendingUploadRow } from '@/lib/ai/pricelistBatchProcessing';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest): Promise<Response> {
    /* Auth: bestaande user-session via Supabase SSR */
    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: mem } = await sb
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    const orgId = mem?.organization_id as string | undefined;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    /* Rate limit: 6× per minuut per org — voorkomt thundering herd */
    const rl = checkRateLimit(`pricelist-poll-mine:${orgId}`, 6);
    if (!rl.allowed) {
        return NextResponse.json({
            error: 'rate_limited',
            resetInSeconds: rl.resetInSeconds,
        }, { status: 429 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
    }

    /* Service-role client voor updates (RLS skip nodig om status te wijzigen) */
    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } },
    );

    /* Vind alleen DEZE org's batches die nog parsing zijn — chunks EN standalone */
    const { data: pending, error } = await admin
        .from('org_pricelist_uploads')
        .select('id, organization_id, leverancier_id, anthropic_batch_id, uploaded_by, parent_upload_id, chunk_index, page_start, page_end')
        .eq('organization_id', orgId)
        .eq('status', 'parsing')
        .not('anthropic_batch_id', 'is', null)
        .limit(200);

    if (error) {
        return NextResponse.json({ error: 'db_query_failed', detail: error.message }, { status: 500 });
    }
    if (!pending || pending.length === 0) {
        return NextResponse.json({ processed: 0, batches: 0, pendingBatches: 0 });
    }

    /* Group per batch_id, exclude container-parents */
    const byBatch = new Map<string, PendingUploadRow[]>();
    for (const p of pending as PendingUploadRow[]) {
        if (!p.anthropic_batch_id) continue;
        const isContainerParent = p.parent_upload_id == null && p.chunk_index == null
            && pending.some(o => o.parent_upload_id === p.id);
        if (isContainerParent) continue;

        if (!byBatch.has(p.anthropic_batch_id)) byBatch.set(p.anthropic_batch_id, []);
        byBatch.get(p.anthropic_batch_id)!.push(p);
    }

    /* P0: disable SDK retries om Vercel function timeout te respecteren */
    const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        maxRetries: 0,
    });
    let processedCount = 0;
    let batchesEnded = 0;
    const stillPending: string[] = [];

    for (const [batchId, uploads] of byBatch) {
        try {
            const batch = await client.messages.batches.retrieve(batchId);
            if (batch.processing_status !== 'ended') {
                stillPending.push(batchId);
                continue;
            }
            batchesEnded++;

            const stream = await client.messages.batches.results(batchId);
            for await (const item of stream) {
                const upload = uploads.find(u => u.id === item.custom_id);
                if (!upload) continue;
                const outcome = await handleBatchResultItem(item, upload, { triggeredBy: 'user_poll' });
                if (outcome.succeeded) processedCount++;
            }
        } catch (e) {
            stillPending.push(batchId);
            console.warn(`[poll-mine] batch ${batchId} retrieve fail: ${(e as Error).message}`);
        }
    }

    return NextResponse.json({
        processed: processedCount,
        batches: batchesEnded,
        pendingBatches: stillPending.length,
    });
}
