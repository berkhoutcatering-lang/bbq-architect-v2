/**
 * POST /api/haccp/corrective  — create new corrective action
 * GET  /api/haccp/corrective  — list unresolved corrective actions for org
 * PATCH /api/haccp/corrective?id=N — record step OR resolve
 *
 * Industry-standard guided flow per afwijking. SOTA gap-filler vs SafetyCulture.
 */
import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import {
    createCorrectiveAction,
    recordCorrectiveStep,
    resolveCorrectiveAction,
    getUnresolvedCorrectiveActions,
    CORRECTIVE_ACTION_TEMPLATES,
} from '@/lib/dal/haccp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = Object.keys(CORRECTIVE_ACTION_TEMPLATES);

async function authAndOrg(sb: Awaited<ReturnType<typeof createServerSupabase>>): Promise<
    { user: { id: string }; orgId: string } | { error: Response }
> {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { error: new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }) };
    const { data: membership } = await sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1);
    const orgId = membership?.[0]?.organization_id;
    if (!orgId) return { error: new Response(JSON.stringify({ error: 'no active organization' }), { status: 403 }) };
    return { user, orgId };
}

export async function GET(req: NextRequest) {
    const sb = await createServerSupabase();
    const auth = await authAndOrg(sb);
    if ('error' in auth) return auth.error;
    void req;
    const actions = await getUnresolvedCorrectiveActions(sb, auth.orgId);
    return new Response(JSON.stringify({ actions, templates: CORRECTIVE_ACTION_TEMPLATES }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

export async function POST(req: NextRequest) {
    const sb = await createServerSupabase();
    const auth = await authAndOrg(sb);
    if ('error' in auth) return auth.error;

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 });
    }

    const haccpRecordId = typeof body.haccpRecordId === 'number' ? body.haccpRecordId : null;
    const anomalyFindingId = typeof body.anomalyFindingId === 'number' ? body.anomalyFindingId : null;
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';
    const description = typeof body.description === 'string' ? body.description.slice(0, 500) : '';
    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 1000) : undefined;

    if (!ALLOWED_TYPES.includes(actionType)) {
        return new Response(JSON.stringify({ error: `actionType must be ${ALLOWED_TYPES.join(',')}` }), { status: 400 });
    }
    if (!description) {
        return new Response(JSON.stringify({ error: 'description required' }), { status: 400 });
    }
    if (haccpRecordId === null && anomalyFindingId === null) {
        return new Response(JSON.stringify({ error: 'haccpRecordId or anomalyFindingId required' }), { status: 400 });
    }

    const action = await createCorrectiveAction(sb, auth.orgId, {
        haccpRecordId,
        anomalyFindingId,
        actionType: actionType as keyof typeof CORRECTIVE_ACTION_TEMPLATES,
        description,
        notes,
    });
    if (!action) return new Response(JSON.stringify({ error: 'create failed' }), { status: 500 });

    return new Response(JSON.stringify({ action }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

export async function PATCH(req: NextRequest) {
    const sb = await createServerSupabase();
    const auth = await authAndOrg(sb);
    if ('error' in auth) return auth.error;

    const idParam = new URL(req.url).searchParams.get('id');
    const actionId = idParam && /^\d+$/.test(idParam) ? parseInt(idParam, 10) : null;
    if (actionId === null) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 });
    }

    // Branch: 'step' adds a step, 'resolve' closes the action
    if (typeof body.step === 'string' && body.step.length > 0) {
        const updated = await recordCorrectiveStep(sb, auth.orgId, actionId, body.step.slice(0, 300), auth.user.id);
        if (!updated) return new Response(JSON.stringify({ error: 'step recording failed' }), { status: 500 });
        return new Response(JSON.stringify({ action: updated }), { status: 200 });
    }

    if (typeof body.outcome === 'string' && body.outcome.length > 0) {
        const notes = typeof body.notes === 'string' ? body.notes.slice(0, 1000) : undefined;
        const resolved = await resolveCorrectiveAction(sb, auth.orgId, actionId, auth.user.id, body.outcome.slice(0, 100), notes);
        if (!resolved) return new Response(JSON.stringify({ error: 'resolve failed' }), { status: 500 });
        return new Response(JSON.stringify({ action: resolved }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: 'body must have step or outcome' }), { status: 400 });
}
