/**
 * GET /api/haccp/trends?days=90 — 90-day aggregaat per (check_type, wat).
 *
 * SOTA gap-filler: trend review across recurring issues. Toont welke
 * gerechten/check-types vaker afwijken zodat Sam pro-actief kan ingrijpen.
 */
import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getHaccpTrends } from '@/lib/dal/haccp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

    const { data: membership } = await sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1);
    const orgId = membership?.[0]?.organization_id;
    if (!orgId) return new Response(JSON.stringify({ error: 'no active organization' }), { status: 403 });

    const daysParam = new URL(req.url).searchParams.get('days');
    const days = daysParam && /^\d+$/.test(daysParam) ? Math.min(365, Math.max(7, parseInt(daysParam, 10))) : 90;

    const trends = await getHaccpTrends(sb, orgId, days);
    return new Response(JSON.stringify({ trends, days }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
