/**
 * GET /api/leveranciers/[id]/prijslijsten
 *
 * Lijst van pricelist-uploads voor één leverancier, scoped op org via RLS.
 * Filtert chunks weg (parent_upload_id IS NULL) en geeft per upload de
 * chunk-aggregate-stats mee (chunk_total / chunks_done / chunks_failed) zodat
 * de UI per-chunk progress kan tonen.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

interface UploadView {
    id: string;
    filename: string;
    size_bytes: number | null;
    page_count: number | null;
    status: string;
    processing_mode: string;
    parsed_product_count: number | null;
    new_count: number | null;
    updated_count: number | null;
    ai_cost_cents: number | null;
    ai_model: string | null;
    parse_error: string | null;
    manual_review_required: boolean | null;
    created_at: string;
    parse_finished_at: string | null;
    chunk_total: number | null;
    chunks_done: number;
    chunks_failed: number;
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }): Promise<Response> {
    const { id } = await context.params;
    const leverancierId = Number(id);
    if (!Number.isInteger(leverancierId)) {
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

    const { data: lev } = await sb
        .from('leveranciers')
        .select('id, naam')
        .eq('id', leverancierId)
        .eq('organization_id', orgId)
        .maybeSingle();
    if (!lev) return NextResponse.json({ error: 'leverancier niet gevonden' }, { status: 404 });

    /* Alleen parents tonen — chunks zijn UI-only subdetails per parent */
    const { data, error } = await sb
        .from('org_pricelist_uploads')
        .select(`
            id, filename, size_bytes, page_count, status, processing_mode,
            parsed_product_count, new_count, updated_count, ai_cost_cents, ai_model,
            parse_error, manual_review_required, created_at, parse_finished_at, chunk_total
        `)
        .eq('organization_id', orgId)
        .eq('leverancier_id', leverancierId)
        .is('parent_upload_id', null)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    /* Voor parents met chunks: aggregate chunk-counts in één call */
    const parents = (data ?? []) as Array<Omit<UploadView, 'chunks_done' | 'chunks_failed'>>;
    const chunkedParentIds = parents.filter(p => (p.chunk_total ?? 0) > 0).map(p => p.id);

    let chunkAgg = new Map<string, { done: number; failed: number }>();
    if (chunkedParentIds.length > 0) {
        const { data: chunks } = await sb
            .from('org_pricelist_uploads')
            .select('parent_upload_id, status')
            .in('parent_upload_id', chunkedParentIds);
        for (const c of (chunks ?? []) as Array<{ parent_upload_id: string; status: string }>) {
            const cur = chunkAgg.get(c.parent_upload_id) ?? { done: 0, failed: 0 };
            if (c.status === 'parsed') cur.done++;
            else if (c.status === 'failed') cur.failed++;
            chunkAgg.set(c.parent_upload_id, cur);
        }
    }

    const uploads: UploadView[] = parents.map(p => ({
        ...p,
        chunks_done: chunkAgg.get(p.id)?.done ?? 0,
        chunks_failed: chunkAgg.get(p.id)?.failed ?? 0,
    }));

    return NextResponse.json({
        leverancier: lev,
        uploads,
        count: uploads.length,
    });
}
