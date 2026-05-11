/* /api/gerechten/[id]/components — PR6 Inspiratie Bibliotheek
   GET:  lijst components in dit gerecht (met joined component-details)
   POST: voeg een component toe aan dit gerecht (quantity_used + unit)
         → trigger berekent cost_at_use_cents + recomputed gerechten.total_cost_cents */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

async function getOrgContext(supabase: Awaited<ReturnType<typeof createServerSupabase>>) {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: 'Niet ingelogd', status: 401 as const };

    const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!membership) return { error: 'Geen organisatie', status: 403 as const };
    return { orgId: membership.organization_id as string, userId: user.id };
}

function validGerechtId(id: string): boolean {
    return /^[0-9a-f-]{36}$/i.test(id);
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    if (!validGerechtId(id)) return NextResponse.json({ error: 'Ongeldig gerecht-id' }, { status: 400 });

    const supabase = await createServerSupabase();
    const ctxRes = await getOrgContext(supabase);
    if ('error' in ctxRes) return NextResponse.json({ error: ctxRes.error }, { status: ctxRes.status });

    // RLS doet org-filter — geen extra WHERE
    const { data, error } = await supabase
        .from('gerecht_components')
        .select('gerecht_id, component_id, quantity_used, unit, cost_at_use_cents, components(id, name, type, base_quantity, base_unit, base_cost_cents)')
        .eq('gerecht_id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    if (!validGerechtId(id)) return NextResponse.json({ error: 'Ongeldig gerecht-id' }, { status: 400 });

    const supabase = await createServerSupabase();
    const ctxRes = await getOrgContext(supabase);
    if ('error' in ctxRes) return NextResponse.json({ error: ctxRes.error }, { status: ctxRes.status });

    const body = await req.json().catch(() => null);
    if (typeof body !== 'object' || body === null) return NextResponse.json({ error: 'Body verplicht' }, { status: 400 });
    const b = body as Record<string, unknown>;

    const componentId = typeof b.component_id === 'number' ? b.component_id : Number(b.component_id);
    const quantityUsed = typeof b.quantity_used === 'number' ? b.quantity_used : Number(b.quantity_used);
    const unit = typeof b.unit === 'string' ? b.unit.trim() : '';

    if (!Number.isInteger(componentId) || componentId <= 0) {
        return NextResponse.json({ error: 'component_id verplicht (integer)' }, { status: 400 });
    }
    if (!Number.isFinite(quantityUsed) || quantityUsed <= 0) {
        return NextResponse.json({ error: 'quantity_used > 0 verplicht' }, { status: 400 });
    }
    if (!unit) return NextResponse.json({ error: 'unit verplicht' }, { status: 400 });

    // Verify gerecht exists in own org (RLS-defense-in-depth)
    const { data: gerecht } = await supabase
        .from('gerechten').select('id').eq('id', id).eq('organization_id', ctxRes.orgId).maybeSingle();
    if (!gerecht) return NextResponse.json({ error: 'Gerecht niet gevonden' }, { status: 404 });

    // Verify component exists in own org
    const { data: comp } = await supabase
        .from('components').select('id').eq('id', componentId).eq('organization_id', ctxRes.orgId).maybeSingle();
    if (!comp) return NextResponse.json({ error: 'Component niet gevonden' }, { status: 404 });

    const { data, error } = await supabase
        .from('gerecht_components')
        .insert({
            gerecht_id: id,
            component_id: componentId,
            quantity_used: quantityUsed,
            unit,
            organization_id: ctxRes.orgId,
            // cost_at_use_cents wordt automatisch berekend door BEFORE-trigger
        })
        .select()
        .single();

    if (error) {
        if (error.code === '23505') {
            return NextResponse.json({ error: 'Deze component zit al in dit gerecht. Verwijder eerst of update quantity.' }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data }, { status: 201 });
}
