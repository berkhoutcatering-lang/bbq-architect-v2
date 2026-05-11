/* /api/floor-plan/guest-pin — gast-pin CRUD.
 *
 * POST: create OR update (idempotent op id als meegegeven).
 * DELETE: ?id=<UUID> verwijderen.
 *
 * Hard rule: allergens NOOIT door AI gegenereerd → server filtert input
 * via isAllergen() guard (zie src/lib/prep/allergens.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { sanitizeAllergens } from '@/lib/prep/allergens';

export const runtime = 'nodejs';

interface PinInput {
    /** Bestaande id (update) of undefined (create). */
    id?: string;
    floorPlanId: string;
    label: string;
    full_name: string | null;
    allergens: string[];
    severity: 'normal' | 'high' | 'critical';
    dietary_restriction: string | null;
    note: string | null;
    x_pct: number;
    y_pct: number;
    color: string | null;
}

function isUuid(v: unknown): v is string {
    return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function asNullableString(v: unknown, max: number): string | null {
    if (v == null) return null;
    if (typeof v !== 'string') return null;
    const trimmed = v.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, max);
}

function validate(body: unknown): { ok: true; data: PinInput } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;

    if (b.id !== undefined && !isUuid(b.id)) return { ok: false, error: 'id moet UUID zijn' };
    if (!isUuid(b.floorPlanId)) return { ok: false, error: 'floorPlanId moet UUID zijn' };

    const label = typeof b.label === 'string' ? b.label.trim() : '';
    if (!label) return { ok: false, error: 'label verplicht' };
    if (label.length > 20) return { ok: false, error: 'label max 20 tekens' };

    const xPct = Number(b.x_pct);
    const yPct = Number(b.y_pct);
    if (!Number.isFinite(xPct) || xPct < 0 || xPct > 100) return { ok: false, error: 'x_pct moet 0..100 zijn' };
    if (!Number.isFinite(yPct) || yPct < 0 || yPct > 100) return { ok: false, error: 'y_pct moet 0..100 zijn' };

    const sev = b.severity;
    if (sev !== 'normal' && sev !== 'high' && sev !== 'critical') return { ok: false, error: 'severity moet normal/high/critical zijn' };

    const allergensInput = Array.isArray(b.allergens) ? b.allergens : [];
    const allergens = sanitizeAllergens(allergensInput);  // strict EU-14 filter

    const color = typeof b.color === 'string' && /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : null;

    return {
        ok: true,
        data: {
            id: typeof b.id === 'string' ? b.id : undefined,
            floorPlanId: b.floorPlanId,
            label,
            full_name: asNullableString(b.full_name, 80),
            allergens,
            severity: sev,
            dietary_restriction: asNullableString(b.dietary_restriction, 40),
            note: asNullableString(b.note, 500),
            x_pct: Math.round(xPct * 100) / 100,
            y_pct: Math.round(yPct * 100) / 100,
            color,
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
        .select('id, organization_id, event_id')
        .eq('id', data.floorPlanId)
        .maybeSingle();
    if (!fp || fp.organization_id !== orgId) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

    const payload = {
        floor_plan_id: data.floorPlanId,
        organization_id: orgId,
        event_id: fp.event_id,
        label: data.label,
        full_name: data.full_name,
        allergens: data.allergens,
        severity: data.severity,
        dietary_restriction: data.dietary_restriction,
        note: data.note,
        x_pct: data.x_pct,
        y_pct: data.y_pct,
        color: data.color,
    };

    if (data.id) {
        // Update — refetch om defense-in-depth
        const { data: existing } = await supabase
            .from('floor_plan_guests')
            .select('id, organization_id, event_allergy_id')
            .eq('id', data.id)
            .maybeSingle();
        if (!existing || existing.organization_id !== orgId) {
            return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
        }

        /* P0-2 sync: spiegel naar event_allergies. Service-mode UI leest
           daaruit dus dezelfde gast hoort daar ook met dezelfde data te staan. */
        const eventAllergyId = await syncToEventAllergies(supabase, {
            existingEventAllergyId: existing.event_allergy_id ?? null,
            organizationId: orgId,
            eventId: fp.event_id,
            label: data.label,
            fullName: data.full_name,
            allergens: data.allergens,
            severity: data.severity,
            note: data.note,
        });
        const payloadWithSync = { ...payload, event_allergy_id: eventAllergyId };

        const { data: updated, error } = await supabase
            .from('floor_plan_guests')
            .update(payloadWithSync)
            .eq('id', data.id)
            .select('*')
            .maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, guest: updated });
    } else {
        /* P0-2 sync: spiegel naar event_allergies bij INSERT.
           Sync werkt ook als full_name ontbreekt (label dient als matching-key). */
        const eventAllergyId = await syncToEventAllergies(supabase, {
            existingEventAllergyId: null,
            organizationId: orgId,
            eventId: fp.event_id,
            label: data.label,
            fullName: data.full_name,
            allergens: data.allergens,
            severity: data.severity,
            note: data.note,
        });
        const payloadWithSync = { ...payload, event_allergy_id: eventAllergyId };

        const { data: created, error } = await supabase
            .from('floor_plan_guests')
            .insert(payloadWithSync)
            .select('*')
            .maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, guest: created });
    }
});

/**
 * Spiegel floor_plan_guests naar event_allergies (service-mode bron-of-truth).
 *
 * Strategy:
 *  - Als `existingEventAllergyId` gezet is → UPDATE die rij.
 *  - Anders: zoek bestaande event_allergies WHERE event_id+name match (case-insensitive)
 *    om dubbele rijen te voorkomen als dezelfde gast via service-mode al ingevoerd is.
 *  - Anders: INSERT nieuwe rij.
 *  - Best-effort: bij DB-fout returnt null, floor-plan-pin wordt nog steeds opgeslagen.
 */
async function syncToEventAllergies(
    supabase: import('@supabase/supabase-js').SupabaseClient,
    args: {
        existingEventAllergyId: number | null;
        organizationId: string;
        eventId: number;
        label: string;
        fullName: string | null;
        allergens: string[];
        severity: 'normal' | 'high' | 'critical';
        note: string | null;
    },
): Promise<number | null> {
    const matchName = args.fullName?.trim() || args.label;

    const eaPayload = {
        event_id: args.eventId,
        organization_id: args.organizationId,
        name: matchName,
        allergens: args.allergens,
        severity: args.severity,
        note: args.note,
    };

    try {
        // 1. Update path
        if (args.existingEventAllergyId) {
            const { error } = await supabase
                .from('event_allergies')
                .update(eaPayload)
                .eq('id', args.existingEventAllergyId)
                .eq('organization_id', args.organizationId);
            if (!error) return args.existingEventAllergyId;
            // Bij fout: val terug op match-or-insert hieronder.
        }

        // 2. Match-by-name path (voorkom dubbele rijen)
        const { data: match } = await supabase
            .from('event_allergies')
            .select('id')
            .eq('event_id', args.eventId)
            .eq('organization_id', args.organizationId)
            .ilike('name', matchName)
            .limit(1)
            .maybeSingle();

        if (match) {
            const { error } = await supabase
                .from('event_allergies')
                .update(eaPayload)
                .eq('id', match.id);
            return error ? null : match.id;
        }

        // 3. Insert path
        const { data: inserted, error } = await supabase
            .from('event_allergies')
            .insert(eaPayload)
            .select('id')
            .maybeSingle();
        if (error || !inserted) return null;
        return inserted.id as number;
    } catch (e) {
        console.warn('[guest-pin/event_allergies sync] error:', e);
        return null;
    }
}

export const DELETE = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    const id = req.nextUrl.searchParams.get('id');
    if (!id || !isUuid(id)) return NextResponse.json({ error: 'id (UUID) verplicht' }, { status: 400 });

    const { data: existing } = await supabase
        .from('floor_plan_guests')
        .select('id, organization_id, label')
        .eq('id', id)
        .maybeSingle();
    if (!existing || existing.organization_id !== orgId) {
        return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
    }

    const { error } = await supabase
        .from('floor_plan_guests')
        .delete()
        .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
});
