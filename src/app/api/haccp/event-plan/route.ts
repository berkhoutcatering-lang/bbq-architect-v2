/**
 * POST /api/haccp/event-plan — save event-bundeled checklist.
 * GET  /api/haccp/event-plan?eventId=N — fetch existing plan.
 *
 * Pillar #1: bundled per-event. Mens bevestigt voor opslag.
 */
import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getEventHaccpPlan, saveEventHaccpPlan } from '@/lib/dal/haccp';

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

    const raw = new URL(req.url).searchParams.get('eventId');
    const eventId = raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : null;
    if (eventId === null) return new Response(JSON.stringify({ error: 'eventId required' }), { status: 400 });

    const plan = await getEventHaccpPlan(sb, auth.orgId, eventId);
    return new Response(JSON.stringify({ plan }), {
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

    const eventId =
        typeof body.eventId === 'number'
            ? body.eventId
            : typeof body.eventId === 'string' && /^\d+$/.test(body.eventId)
              ? parseInt(body.eventId, 10)
              : null;
    const planItems = Array.isArray(body.planItems) ? body.planItems : null;
    const servingHour = typeof body.servingHour === 'number' ? body.servingHour : null;
    const aiUsageId = typeof body.aiUsageId === 'number' ? body.aiUsageId : null;

    if (eventId === null) return new Response(JSON.stringify({ error: 'eventId required' }), { status: 400 });
    if (!planItems || planItems.length === 0 || planItems.length > 50) {
        return new Response(JSON.stringify({ error: 'planItems must be 1-50' }), { status: 400 });
    }

    const saved = await saveEventHaccpPlan(sb, auth.orgId, auth.user.id, {
        eventId,
        planItems: planItems as never,
        servingHour,
        aiUsageId,
    });
    if (!saved) return new Response(JSON.stringify({ error: 'save failed' }), { status: 500 });

    return new Response(JSON.stringify({ plan: saved }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
