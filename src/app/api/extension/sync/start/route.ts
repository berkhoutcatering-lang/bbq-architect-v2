/**
 * POST /api/extension/sync/start
 *
 * Body: { leverancierId: number, mode?: 'full'|'incremental'|'single-page', portalUrl?: string }
 * Header: x-extension-key
 *
 * Start een nieuwe sync-run en marketeert leverancier als 'running'.
 * Returnt syncRunId die de extensie meegeeft bij elke product-batch.
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

export async function POST(req: NextRequest) {
    const ctx = await verifyExtensionKey(req.headers.get('x-extension-key'));
    if (!ctx) return NextResponse.json({ error: 'invalid key' }, { status: 401, headers: corsHeaders() });

    const body = await req.json().catch(() => null);
    const leverancierId = Number(body?.leverancierId);
    const mode = (body?.mode === 'incremental' || body?.mode === 'single-page') ? body.mode : 'full';
    const portalUrl: string | undefined = typeof body?.portalUrl === 'string' ? body.portalUrl : undefined;

    if (!Number.isInteger(leverancierId) || leverancierId <= 0) {
        return NextResponse.json({ error: 'leverancierId verplicht' }, { status: 400, headers: corsHeaders() });
    }

    const sb = createServiceSupabase();

    /* Check leverancier scope: must belong to this org */
    const { data: lev } = await sb
        .from('leveranciers')
        .select('id, naam, organization_id, portal_hint, scope_filter, scope_keywords')
        .eq('id', leverancierId)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
    if (!lev) return NextResponse.json({ error: 'leverancier niet gevonden' }, { status: 404, headers: corsHeaders() });

    /* Cancel existing running runs voor deze leverancier (max 1 actief tegelijk) */
    await sb
        .from('leverancier_sync_runs')
        .update({ status: 'cancelled', finished_at: new Date().toISOString(), error_text: 'superseded by new run' })
        .eq('leverancier_id', leverancierId)
        .eq('status', 'running');

    const { data: run, error } = await sb
        .from('leverancier_sync_runs')
        .insert({
            organization_id: ctx.organizationId,
            leverancier_id: leverancierId,
            started_by_user_id: ctx.userId,
            extension_key_id: ctx.keyId,
            status: 'running',
            mode,
            metadata: portalUrl ? { portal_url: portalUrl } : {},
        })
        .select('id')
        .single();

    if (error || !run) {
        return NextResponse.json({ error: error?.message || 'kon sync niet starten' }, { status: 500, headers: corsHeaders() });
    }

    /* Mark leverancier as syncing */
    await sb.from('leveranciers').update({
        last_sync_status: 'running',
        ...(portalUrl ? { portal_url: portalUrl } : {}),
    }).eq('id', leverancierId);

    return NextResponse.json({
        ok: true,
        syncRunId: run.id,
        leverancier: {
            id: lev.id,
            naam: lev.naam,
            portal_hint: lev.portal_hint,
            scope_filter: lev.scope_filter || 'alles',
            scope_keywords: lev.scope_keywords || [],
        },
    }, { headers: corsHeaders() });
}
