/**
 * GET /api/extension/auth
 *
 * Verifieer dat de extensie's API-key geldig is + return basis-info zodat de
 * extensie de huidige org/user kan tonen ("Verbonden met: Hop & Bites").
 *
 * Header: x-extension-key: ext_xxxxxxxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionKey } from '@/lib/extensionAuth';
import { createServiceSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

function corsHeaders(): HeadersInit {
    /* Extensie draait vanuit chrome-extension://<id>/, vandaar wildcard.
       Risico is laag: endpoint vereist geldige key, geen cookies in spel. */
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, x-extension-key',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    const orgRes = await sb.from('organizations').select('id, name, slug').eq('id', ctx.organizationId).maybeSingle();

    return NextResponse.json({
        ok: true,
        organization: { id: orgRes.data?.id, naam: orgRes.data?.name, slug: orgRes.data?.slug },
        user: { id: ctx.userId },
        keyId: ctx.keyId,
    }, { headers: corsHeaders() });
}
