/* /api/components/[id] — Inspiratie Bibliotheek PR3
   PATCH: update een component (RLS + re-auth)
   DELETE: verwijder een component (RLS check; RESTRICT als component in gerecht_components zit) */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

async function authorize(supabase: Awaited<ReturnType<typeof createServerSupabase>>) {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: 'Niet ingelogd', status: 401 as const, user: null, orgId: null as string | null };

    const { data: membership, error: memberErr } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (memberErr || !membership) {
        return { error: 'Geen actieve organisatie-membership', status: 403 as const, user, orgId: null };
    }
    return { user, orgId: membership.organization_id as string, error: null, status: 200 as const };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    const componentId = Number(id);
    if (!Number.isInteger(componentId) || componentId <= 0) {
        return NextResponse.json({ error: 'Ongeldig component-id' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const auth = await authorize(supabase);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => null);
    if (typeof body !== 'object' || body === null) {
        return NextResponse.json({ error: 'Body moet een object zijn' }, { status: 400 });
    }

    // Whitelist van editable velden
    const updateData: Record<string, unknown> = {};
    const b = body as Record<string, unknown>;
    if (typeof b.name === 'string' && b.name.trim().length > 0) updateData.name = b.name.trim();
    if (typeof b.description === 'string' || b.description === null) updateData.description = b.description;
    if (typeof b.base_quantity === 'number' && b.base_quantity > 0) updateData.base_quantity = b.base_quantity;
    if (typeof b.base_unit === 'string' && b.base_unit.trim().length > 0) updateData.base_unit = b.base_unit.trim();
    if (typeof b.base_cost_cents === 'number' && b.base_cost_cents >= 0 && Number.isInteger(b.base_cost_cents)) {
        updateData.base_cost_cents = b.base_cost_cents;
    }
    if (Array.isArray(b.flavor_tags)) {
        updateData.flavor_tags = b.flavor_tags.filter((t): t is string => typeof t === 'string');
    }
    if (b.ingredients !== undefined) updateData.ingredients = b.ingredients;
    if (b.preparation_steps !== undefined) updateData.preparation_steps = b.preparation_steps;

    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'Geen wijzigingen' }, { status: 400 });
    }

    // RLS filter: alleen update als component in eigen org zit
    const { data, error } = await supabase
        .from('components')
        .update(updateData)
        .eq('id', componentId)
        .eq('organization_id', auth.orgId!)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
        return NextResponse.json({ error: 'Component niet gevonden of geen toegang' }, { status: 404 });
    }
    return NextResponse.json({ component: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    const componentId = Number(id);
    if (!Number.isInteger(componentId) || componentId <= 0) {
        return NextResponse.json({ error: 'Ongeldig component-id' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const auth = await authorize(supabase);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { error } = await supabase
        .from('components')
        .delete()
        .eq('id', componentId)
        .eq('organization_id', auth.orgId!);

    if (error) {
        // FK RESTRICT op gerecht_components → 23503; user-friendly message
        if (error.code === '23503') {
            return NextResponse.json({
                error: 'Component zit nog in één of meer gerechten. Verwijder eerst die referenties.',
            }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
