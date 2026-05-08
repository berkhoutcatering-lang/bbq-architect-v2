/**
 * POST /api/extension/sync/[id]/finish
 *
 * Body: { status: 'completed'|'partial'|'failed'|'cancelled', errorText?: string }
 * Header: x-extension-key
 *
 * Sluit een sync-run af, update leveranciers.last_sync_at + products_count.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionKey } from '@/lib/extensionAuth';
import { createServiceSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

function corsHeaders(): HeadersInit {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, x-extension-key',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id: syncRunId } = await context.params;

    const ctx = await verifyExtensionKey(req.headers.get('x-extension-key'));
    if (!ctx) return NextResponse.json({ error: 'invalid key' }, { status: 401, headers: corsHeaders() });

    const body = await req.json().catch(() => null);
    const allowedStatus = ['completed', 'partial', 'failed', 'cancelled'];
    const status: string = allowedStatus.includes(body?.status) ? body.status : 'completed';
    const errorText: string | null = typeof body?.errorText === 'string' ? body.errorText.slice(0, 1000) : null;

    const sb = createServiceSupabase();

    const { data: run } = await sb
        .from('leverancier_sync_runs')
        .select('id, leverancier_id, organization_id, products_seen')
        .eq('id', syncRunId)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
    if (!run) return NextResponse.json({ error: 'sync run niet gevonden' }, { status: 404, headers: corsHeaders() });

    await sb
        .from('leverancier_sync_runs')
        .update({
            status,
            finished_at: new Date().toISOString(),
            error_text: errorText,
        })
        .eq('id', syncRunId);

    /* Resolve leverancier naam voor scoped count */
    const { data: lev } = await sb
        .from('leveranciers')
        .select('naam')
        .eq('id', run.leverancier_id)
        .maybeSingle();

    /* Refresh leverancier-aggregates: count distinct supplier_prices PER LEVERANCIER */
    const { count } = await sb
        .from('supplier_prices')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.organizationId)
        .eq('actief', true)
        .eq('leverancier', lev?.naam || '__never__')
        .not('master_product_id', 'is', null);

    await sb.from('leveranciers').update({
        last_sync_status: status === 'completed' || status === 'partial' ? status : 'failed',
        last_sync_at: new Date().toISOString(),
        products_count: count || 0,
    }).eq('id', run.leverancier_id);

    return NextResponse.json({ ok: true, status, productsSeen: run.products_seen }, { headers: corsHeaders() });
}
