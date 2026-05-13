/**
 * POST /api/leveranciers/[id]/prijslijst/[uploadId]/cancel
 *
 * Force-stop een upload die in 'parsing' of 'queued' blijft hangen. Zet status
 * op 'failed' zodat user retry kan klikken of dezelfde PDF opnieuw kan uploaden.
 *
 * Voor chunked parents: zet ook alle child-chunks op 'failed' zodat aggregator
 * niet meer triggert.
 *
 * Geen Anthropic cancel-call: Vercel function is sowieso al gedood (timeout)
 * of de Batch API loopt nog door en levert later resultaten — die worden dan
 * genegeerd want de upload-rij is al 'failed'.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { markUploadStatus } from '@/lib/dal/pricelistUploads';

export const runtime = 'nodejs';
export const maxDuration = 30;

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
        .select('id, organization_id, leverancier_id, status, parent_upload_id, chunk_total')
        .eq('id', uploadId)
        .eq('organization_id', orgId)
        .maybeSingle();

    if (upErr || !upload) {
        return NextResponse.json({ error: 'upload_not_found' }, { status: 404 });
    }
    if (levId > 0 && upload.leverancier_id !== levId && upload.parent_upload_id == null) {
        return NextResponse.json({ error: 'leverancier_mismatch' }, { status: 403 });
    }
    if (upload.status === 'parsed' || upload.status === 'partial' || upload.status === 'dismissed') {
        return NextResponse.json({
            error: 'not_cancellable',
            detail: `Status is '${upload.status}', alleen parsing/queued/failed kan geannuleerd worden.`,
        }, { status: 400 });
    }
    if (upload.status === 'failed') {
        /* Already failed — no-op, return success */
        return NextResponse.json({ ok: true, alreadyFailed: true });
    }

    const errorMsg = 'Handmatig geannuleerd door gebruiker';
    const now = new Date().toISOString();

    /* Cancel parent + alle nog-actieve chunks */
    await markUploadStatus(uploadId, {
        status: 'failed',
        parse_error: errorMsg,
        parse_finished_at: now,
    });

    /* Voor chunked parents: cancel ook child-chunks die nog parsing/queued zijn */
    if ((upload.chunk_total ?? 0) > 0 && upload.parent_upload_id == null) {
        await admin
            .from('org_pricelist_uploads')
            .update({
                status: 'failed',
                parse_error: errorMsg,
                parse_finished_at: now,
            })
            .eq('parent_upload_id', uploadId)
            .in('status', ['parsing', 'queued']);
    }

    return NextResponse.json({ ok: true, uploadId });
}
