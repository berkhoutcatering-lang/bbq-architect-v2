/**
 * POST /api/leveranciers/[id]/prijslijst/[uploadId]/delete
 *
 * Volledige cleanup van een upload:
 * - Storage PDF wordt verwijderd
 * - Chunk-rijen worden verwijderd (CASCADE via FK)
 * - Pending mutations worden verwijderd
 * - Approved/dismissed mutations BLIJVEN (user-actions, nooit auto-cleanen)
 * - Parent-rij wordt verwijderd
 *
 * Werkt in elke status (uploaded/queued/parsing/parsed/partial/failed/dismissed).
 * Na delete kan dezelfde PDF opnieuw worden geupload (content_hash is weg).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

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

    /* Load upload + scope-check. Alleen parents kunnen verwijderd worden via
       deze route; chunks gaan automatisch mee via ON DELETE CASCADE. */
    const { data: upload, error: upErr } = await admin
        .from('org_pricelist_uploads')
        .select('id, organization_id, leverancier_id, storage_path, parent_upload_id')
        .eq('id', uploadId)
        .eq('organization_id', orgId)
        .maybeSingle();

    if (upErr || !upload) {
        return NextResponse.json({ error: 'upload_not_found' }, { status: 404 });
    }
    if (upload.parent_upload_id != null) {
        return NextResponse.json({
            error: 'cannot_delete_chunk',
            detail: 'Een chunk kan niet apart verwijderd worden — verwijder de parent upload.',
        }, { status: 400 });
    }
    if (levId > 0 && upload.leverancier_id !== levId) {
        return NextResponse.json({ error: 'leverancier_mismatch' }, { status: 403 });
    }

    /* Count approved/dismissed mutations zodat we kunnen rapporteren wat blijft staan */
    const { count: keptCount } = await admin
        .from('org_price_mutations')
        .select('id', { count: 'exact', head: true })
        .eq('source_ref_id', uploadId)
        .in('status', ['approved', 'dismissed', 'auto_committed', 'superseded']);

    /* Delete pending mutations (approved/dismissed/auto_committed/superseded blijven) */
    const { error: mutErr } = await admin
        .from('org_price_mutations')
        .delete()
        .eq('source_ref_id', uploadId)
        .eq('status', 'pending');
    if (mutErr) {
        console.warn(`[delete-upload] pending mutations delete fail ${uploadId}: ${mutErr.message}`);
    }

    /* Delete PDF uit storage. Best-effort: als storage-delete faalt, gaan
       we door — DB-delete is belangrijker zodat user kan re-uploaden. */
    if (upload.storage_path) {
        const { error: storErr } = await admin.storage
            .from('pricelist-pdfs')
            .remove([upload.storage_path as string]);
        if (storErr) {
            console.warn(`[delete-upload] storage remove fail ${upload.storage_path}: ${storErr.message}`);
        }
    }

    /* Delete parent-rij. ON DELETE CASCADE op parent_upload_id verwijdert
       automatisch alle chunk-rijen. */
    const { error: delErr } = await admin
        .from('org_pricelist_uploads')
        .delete()
        .eq('id', uploadId);
    if (delErr) {
        return NextResponse.json({
            error: 'delete_failed',
            detail: delErr.message,
        }, { status: 500 });
    }

    return NextResponse.json({
        ok: true,
        uploadId,
        keptMutations: keptCount ?? 0,
    });
}
