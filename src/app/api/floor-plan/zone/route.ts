/* /api/floor-plan/zone — service-zone CRUD.
 *
 * POST: create OR update. body: { id?, floorPlanId, name, assignedPersoneelId, color, points }
 * DELETE: ?id=<uuid>
 *
 * Geen PII — alleen polygon + naam + team-toewijzing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';

export const runtime = 'nodejs';

interface ZoneInput {
    id?: string;
    floorPlanId: string;
    name: string;
    assignedPersoneelId: string | null;
    color: string | null;
    points: { x_pct: number; y_pct: number }[];
}

function isUuid(v: unknown): v is string {
    return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function validate(body: unknown): { ok: true; data: ZoneInput } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    if (b.id !== undefined && !isUuid(b.id)) return { ok: false, error: 'id moet UUID zijn' };
    if (!isUuid(b.floorPlanId)) return { ok: false, error: 'floorPlanId moet UUID zijn' };

    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name) return { ok: false, error: 'name verplicht' };
    if (name.length > 40) return { ok: false, error: 'name max 40 tekens' };

    if (b.assignedPersoneelId !== null && b.assignedPersoneelId !== undefined && !isUuid(b.assignedPersoneelId)) {
        return { ok: false, error: 'assignedPersoneelId moet UUID of null zijn' };
    }

    const color = typeof b.color === 'string' && /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : null;

    if (!Array.isArray(b.points)) return { ok: false, error: 'points moet een array zijn' };
    if (b.points.length < 3 || b.points.length > 20) {
        return { ok: false, error: 'points moet 3..20 lang zijn' };
    }
    const points: { x_pct: number; y_pct: number }[] = [];
    for (const p of b.points) {
        if (typeof p !== 'object' || p === null) return { ok: false, error: 'point moet object zijn' };
        const pp = p as { x_pct?: unknown; y_pct?: unknown };
        const x = Number(pp.x_pct);
        const y = Number(pp.y_pct);
        if (!Number.isFinite(x) || x < 0 || x > 100) return { ok: false, error: 'point.x_pct moet 0..100' };
        if (!Number.isFinite(y) || y < 0 || y > 100) return { ok: false, error: 'point.y_pct moet 0..100' };
        points.push({ x_pct: Math.round(x * 100) / 100, y_pct: Math.round(y * 100) / 100 });
    }

    return {
        ok: true,
        data: {
            id: typeof b.id === 'string' ? b.id : undefined,
            floorPlanId: b.floorPlanId,
            name,
            assignedPersoneelId: typeof b.assignedPersoneelId === 'string' ? b.assignedPersoneelId : null,
            color,
            points,
        },
    };
}

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const v = validate(body);
    if (!v.ok) return NextResponse.json({ error: (v as { ok: false; error: string }).error }, { status: 400 });
    const { data } = v;

    // Org-check op floor_plan
    const { data: fp } = await supabase
        .from('floor_plans')
        .select('id, organization_id')
        .eq('id', data.floorPlanId)
        .maybeSingle();
    if (!fp || fp.organization_id !== orgId) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

    // Personeel-check als assigneeId gezet is
    if (data.assignedPersoneelId) {
        const { data: p } = await supabase
            .from('personeel')
            .select('id, organization_id, actief')
            .eq('id', data.assignedPersoneelId)
            .maybeSingle();
        if (!p || p.organization_id !== orgId) {
            return NextResponse.json({ error: 'Personeel niet bij deze org' }, { status: 403 });
        }
        if (!p.actief) return NextResponse.json({ error: 'Personeel is gedeactiveerd' }, { status: 409 });
    }

    const payload = {
        floor_plan_id: data.floorPlanId,
        organization_id: orgId,
        name: data.name,
        assigned_personeel_id: data.assignedPersoneelId,
        color: data.color,
        geometry: { type: 'polygon' as const, points: data.points },
    };

    if (data.id) {
        const { data: existing } = await supabase
            .from('service_zones')
            .select('id, organization_id')
            .eq('id', data.id)
            .maybeSingle();
        if (!existing || existing.organization_id !== orgId) {
            return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
        }
        const { data: updated, error } = await supabase
            .from('service_zones')
            .update(payload)
            .eq('id', data.id)
            .select('*')
            .maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, zone: updated });
    } else {
        const { data: created, error } = await supabase
            .from('service_zones')
            .insert(payload)
            .select('*')
            .maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, zone: created });
    }
});

export const DELETE = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    const id = req.nextUrl.searchParams.get('id');
    if (!id || !isUuid(id)) return NextResponse.json({ error: 'id (UUID) verplicht' }, { status: 400 });

    const { data: existing } = await supabase
        .from('service_zones')
        .select('id, organization_id')
        .eq('id', id)
        .maybeSingle();
    if (!existing || existing.organization_id !== orgId) {
        return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
    }

    const { error } = await supabase.from('service_zones').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
});
