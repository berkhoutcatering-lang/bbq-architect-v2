/**
 * GET /api/pricelists/uploads/[parentId]/chunks
 *
 * Per-chunk status voor één parent-upload. UI gebruikt dit voor de
 * progress-strip en per-chunk retry-knop.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ parentId: string }> }): Promise<Response> {
    const { parentId } = await ctx.params;
    if (!parentId || parentId.length < 10) {
        return NextResponse.json({ error: 'invalid_parent_id' }, { status: 400 });
    }

    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    /* Scope-check: parent moet binnen org liggen (RLS doet de heavy lifting) */
    const { data: parent } = await sb
        .from('org_pricelist_uploads')
        .select('id, leverancier_id, status, chunk_total, manual_review_required, parsed_product_count, new_count, updated_count, ai_cost_cents, parse_error, aggregated_at')
        .eq('id', parentId)
        .is('parent_upload_id', null)
        .maybeSingle();

    if (!parent) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const { data: chunks, error } = await sb
        .from('org_pricelist_uploads')
        .select('id, chunk_index, chunk_total, page_start, page_end, status, parsed_product_count, parse_error, retry_count, ai_cost_cents, parse_finished_at')
        .eq('parent_upload_id', parentId)
        .order('chunk_index', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        parent,
        chunks: chunks ?? [],
    });
}
