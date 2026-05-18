/**
 * POST /api/haccp/log-check — log één HACCP-meting (mens-bevestigd).
 *
 * Pillar #3: confirmed_by_user_id verplicht, auto_logged=false enforced in DAL.
 * Body: { planItemId, eventId, gerechtId, dishLabel, checkType, temp, notitie? }
 * Response: { recordId, anomaly: {isAnomaly, zScore, ...} | null }
 */
import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { logHaccpCheck } from '@/lib/dal/haccp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['ontvangst', 'bewaring', 'kern', 'uitgifte', 'regenereren', 'bereiding', 'koeling', 'opslag'];

export async function POST(req: NextRequest) {
    const sb = await createServerSupabase();
    const {
        data: { user },
    } = await sb.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

    const { data: membership } = await sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1);
    const orgId = membership?.[0]?.organization_id;
    if (!orgId) return new Response(JSON.stringify({ error: 'no active organization' }), { status: 403 });

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 });
    }

    // Validation
    const planItemId = typeof body.planItemId === 'string' ? body.planItemId : null;
    const eventId =
        typeof body.eventId === 'number'
            ? body.eventId
            : typeof body.eventId === 'string' && /^\d+$/.test(body.eventId)
              ? parseInt(body.eventId, 10)
              : null;
    const gerechtId = typeof body.gerechtId === 'string' ? body.gerechtId : null;
    const dishLabel = typeof body.dishLabel === 'string' ? body.dishLabel.slice(0, 200) : '';
    const checkType = typeof body.checkType === 'string' ? body.checkType.toLowerCase() : '';
    const temp = typeof body.temp === 'number' ? body.temp : NaN;
    const notitie = typeof body.notitie === 'string' ? body.notitie.slice(0, 500) : null;
    const chef = typeof body.chef === 'string' ? body.chef.slice(0, 100) : (user.email ?? 'Onbekend');
    const photoUrl = typeof body.photoUrl === 'string' ? body.photoUrl.slice(0, 500) : null; // v3: storage path

    if (!dishLabel) return new Response(JSON.stringify({ error: 'dishLabel required' }), { status: 400 });
    if (!ALLOWED_TYPES.includes(checkType)) {
        return new Response(JSON.stringify({ error: `checkType must be one of ${ALLOWED_TYPES.join(',')}` }), { status: 400 });
    }
    if (!Number.isFinite(temp) || temp < -30 || temp > 200) {
        return new Response(JSON.stringify({ error: 'temp must be number between -30 and 200' }), { status: 400 });
    }

    const result = await logHaccpCheck(sb, orgId, user.id, {
        planItemId,
        eventId,
        gerechtId,
        dishLabel,
        checkType,
        temp,
        notitie,
        chef,
        photoUrl,
    });
    if (!result) {
        return new Response(JSON.stringify({ error: 'insert failed' }), { status: 500 });
    }

    return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
