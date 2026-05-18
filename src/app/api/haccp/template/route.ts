/**
 * POST /api/haccp/template — save gerecht-haccp-template (eenmalig AI, daarna 0-call).
 * GET  /api/haccp/template?gerechtId=... — fetch existing template.
 *
 * Pillar #1: tweede keer = 0 AI-call.
 */
import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getGerechtHaccpTemplate, saveGerechtHaccpTemplate } from '@/lib/dal/haccp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authAndOrg(sb: Awaited<ReturnType<typeof createServerSupabase>>): Promise<
    { user: { id: string }; orgId: string } | { error: Response }
> {
    const {
        data: { user },
    } = await sb.auth.getUser();
    if (!user) return { error: new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }) };
    const { data: membership } = await sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1);
    const orgId = membership?.[0]?.organization_id;
    if (!orgId) {
        return { error: new Response(JSON.stringify({ error: 'no active organization' }), { status: 403 }) };
    }
    return { user, orgId };
}

export async function GET(req: NextRequest) {
    const sb = await createServerSupabase();
    const auth = await authAndOrg(sb);
    if ('error' in auth) return auth.error;

    const gerechtId = new URL(req.url).searchParams.get('gerechtId');
    if (!gerechtId) return new Response(JSON.stringify({ error: 'gerechtId required' }), { status: 400 });

    const template = await getGerechtHaccpTemplate(sb, auth.orgId, gerechtId);
    return new Response(JSON.stringify({ template }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

export async function POST(req: NextRequest) {
    const sb = await createServerSupabase();
    const auth = await authAndOrg(sb);
    if ('error' in auth) return auth.error;

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 });
    }

    const gerechtId = typeof body.gerechtId === 'string' ? body.gerechtId : null;
    const checkItems = Array.isArray(body.checkItems) ? body.checkItems : null;
    const citationsJson = body.citationsJson ?? null;
    const aiUsageId =
        typeof body.aiUsageId === 'number'
            ? body.aiUsageId
            : null;

    if (!gerechtId) return new Response(JSON.stringify({ error: 'gerechtId required' }), { status: 400 });
    if (!checkItems || checkItems.length === 0 || checkItems.length > 50) {
        return new Response(JSON.stringify({ error: 'checkItems must be 1-50 items' }), { status: 400 });
    }

    const saved = await saveGerechtHaccpTemplate(sb, auth.orgId, auth.user.id, {
        gerechtId,
        checkItems: checkItems as never,
        citationsJson,
        aiUsageId,
    });
    if (!saved) return new Response(JSON.stringify({ error: 'save failed' }), { status: 500 });

    return new Response(JSON.stringify({ template: saved }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
