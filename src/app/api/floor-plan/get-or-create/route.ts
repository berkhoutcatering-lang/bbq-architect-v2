/* POST /api/floor-plan/get-or-create — laad bestaande floor-plan voor event,
 * of maak een lege als 't event er nog geen heeft.
 *
 * Body: { eventId: number }
 * Returns: { floorPlan, guests, zones }
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';

export const runtime = 'nodejs';

function validate(body: unknown): { ok: true; eventId: number } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    if (typeof b.eventId !== 'number' || !Number.isInteger(b.eventId) || b.eventId <= 0) {
        return { ok: false, error: 'eventId moet positief integer zijn' };
    }
    return { ok: true, eventId: b.eventId };
}

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId, userId }: TenantAuthCtx) => {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const v = validate(body);
    if (!v.ok) return NextResponse.json({ error: (v as { ok: false; error: string }).error }, { status: 400 });

    // 1. Event-check (org-membership)
    const { data: event, error: evErr } = await supabase
        .from('events')
        .select('id, organization_id, name')
        .eq('id', v.eventId)
        .maybeSingle();
    if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 });
    if (!event) return NextResponse.json({ error: 'Event niet gevonden' }, { status: 404 });
    if (event.organization_id !== orgId) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

    // 2. Find or create floor_plan
    const { data: existing } = await supabase
        .from('floor_plans')
        .select('*')
        .eq('event_id', v.eventId)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    let floorPlan = existing;
    if (!floorPlan) {
        const { data: created, error: insErr } = await supabase
            .from('floor_plans')
            .insert({
                event_id: v.eventId,
                organization_id: orgId,
                name: 'Hoofd-plattegrond',
                canvas_json: { shapes: [] },
                last_edited_by_user_id: userId,
            })
            .select('*')
            .maybeSingle();
        if (insErr) {
            // 23505 = unique-violation; betekent een parallel-call heeft 'm zojuist gemaakt.
            // Refetch ipv falen.
            if (insErr.code === '23505') {
                const { data: refetched } = await supabase
                    .from('floor_plans')
                    .select('*')
                    .eq('event_id', v.eventId)
                    .eq('organization_id', orgId)
                    .order('created_at', { ascending: true })
                    .limit(1)
                    .maybeSingle();
                if (refetched) floorPlan = refetched;
                else return NextResponse.json({ error: 'Refetch na unique-conflict mislukt' }, { status: 500 });
            } else {
                return NextResponse.json({ error: insErr.message }, { status: 500 });
            }
        } else if (!created) {
            return NextResponse.json({ error: 'Aanmaken floor-plan mislukt' }, { status: 500 });
        } else {
            floorPlan = created;
        }
    }

    // 3. Load guests + zones in parallel
    const [{ data: guests }, { data: zones }] = await Promise.all([
        supabase
            .from('floor_plan_guests')
            .select('*')
            .eq('floor_plan_id', floorPlan.id)
            .order('created_at', { ascending: true }),
        supabase
            .from('service_zones')
            .select('*')
            .eq('floor_plan_id', floorPlan.id)
            .order('created_at', { ascending: true }),
    ]);

    return NextResponse.json({
        floorPlan,
        guests: guests ?? [],
        zones: zones ?? [],
    });
});
