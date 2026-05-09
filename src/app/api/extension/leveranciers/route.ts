/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/extension/leveranciers
 *
 * Extension-aware variant van /api/leveranciers — auth via x-extension-key
 * header i.p.v. Supabase session-cookie. Retourneert dezelfde shape als de
 * web-route zodat de extensie-popup z'n leverancier-dropdown kan vullen.
 *
 * Header: x-extension-key
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionKey } from '@/lib/extensionAuth';
import { createServiceSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

function corsHeaders(): HeadersInit {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, x-extension-key',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
    const ctx = await verifyExtensionKey(req.headers.get('x-extension-key'));
    if (!ctx) {
        return NextResponse.json({ error: 'invalid key' }, { status: 401, headers: corsHeaders() });
    }

    const sb = createServiceSupabase();
    const { data, error } = await sb
        .from('leveranciers')
        .select('id, naam, type, contact, email, tel, import_method, portal_url, portal_hint, last_sync_at, last_sync_status, products_count, notes, scope_filter, scope_keywords, archived_at, created_at')
        .eq('organization_id', ctx.organizationId)
        .is('archived_at', null)
        .order('naam');

    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
    return NextResponse.json({ data: data || [] }, { headers: corsHeaders() });
}
