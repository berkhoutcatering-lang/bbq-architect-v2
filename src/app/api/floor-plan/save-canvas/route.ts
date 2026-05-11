/* POST /api/floor-plan/save-canvas — autosave-debounce target.
 *
 * Body: { floorPlanId: UUID, canvasJson: object, expectedVersion: number }
 * Returns: 200 { floorPlan } op success, 409 op version-conflict.
 *
 * Pillar #6 (Offline-by-default): version-check zorgt dat 2 chefs niet over
 * elkaar heen schrijven. Bij conflict: client herlaadt + waarschuwt.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';

export const runtime = 'nodejs';

interface SaveCanvasInput {
    floorPlanId: string;
    canvasJson: Record<string, unknown>;
    expectedVersion: number;
}

function isUuid(v: unknown): v is string {
    return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function validate(body: unknown): { ok: true; data: SaveCanvasInput } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    if (!isUuid(b.floorPlanId)) return { ok: false, error: 'floorPlanId moet UUID zijn' };
    if (typeof b.canvasJson !== 'object' || b.canvasJson === null) return { ok: false, error: 'canvasJson moet een object zijn' };
    if (typeof b.expectedVersion !== 'number' || !Number.isInteger(b.expectedVersion) || b.expectedVersion < 0) {
        return { ok: false, error: 'expectedVersion moet non-negative integer zijn' };
    }
    // Lengte-check: voorkom dat client een 5MB blob inschiet
    const size = JSON.stringify(b.canvasJson).length;
    if (size > 500_000) return { ok: false, error: 'canvas_json te groot (max 500KB)' };
    return { ok: true, data: { floorPlanId: b.floorPlanId, canvasJson: b.canvasJson as Record<string, unknown>, expectedVersion: b.expectedVersion } };
}

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId, userId }: TenantAuthCtx) => {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const v = validate(body);
    if (!v.ok) return NextResponse.json({ error: (v as { ok: false; error: string }).error }, { status: 400 });

    // Refetch + org-check + version-check
    const { data: existing, error: fetchErr } = await supabase
        .from('floor_plans')
        .select('id, organization_id, canvas_version')
        .eq('id', v.data.floorPlanId)
        .maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: 'Floor-plan niet gevonden' }, { status: 404 });
    if (existing.organization_id !== orgId) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
    if (existing.canvas_version !== v.data.expectedVersion) {
        return NextResponse.json({
            error: 'Version conflict — iemand anders heeft net opgeslagen',
            currentVersion: existing.canvas_version,
        }, { status: 409 });
    }

    // Update — race-safe via conditional eq op canvas_version
    const { data: updated, error: updErr } = await supabase
        .from('floor_plans')
        .update({
            canvas_json: v.data.canvasJson,
            canvas_version: existing.canvas_version + 1,
            last_edited_by_user_id: userId,
        })
        .eq('id', v.data.floorPlanId)
        .eq('canvas_version', v.data.expectedVersion)
        .select('id, canvas_version, updated_at')
        .maybeSingle();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    if (!updated) {
        return NextResponse.json({ error: 'Race lost — vernieuw en probeer opnieuw' }, { status: 409 });
    }

    return NextResponse.json({ ok: true, floorPlan: updated });
});
