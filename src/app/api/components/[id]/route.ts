/* /api/components/[id] — Inspiratie Bibliotheek
   GET:    component + allergens + haccp_points joined (voor edit-drawer in PR3b)
   PATCH:  update een component, optioneel met replace van allergens/haccp_points
   DELETE: verwijder een component (RESTRICT als in gerecht_components) */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

const ALLOWED_HACCP_TYPES = new Set([
    'kerntemp', 'koeltemp', 'tijd_uit_koeling',
    'handhygiene', 'kruisbesmetting', 'oppervlakte_reiniging', 'overig',
]);

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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    const componentId = Number(id);
    if (!Number.isInteger(componentId) || componentId <= 0) {
        return NextResponse.json({ error: 'Ongeldig component-id' }, { status: 400 });
    }
    const supabase = await createServerSupabase();
    const auth = await authorize(supabase);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [compRes, allRes, haccpRes] = await Promise.all([
        supabase.from('components').select('*').eq('id', componentId).eq('organization_id', auth.orgId!).maybeSingle(),
        supabase.from('component_allergens').select('*').eq('component_id', componentId),
        supabase.from('component_haccp_points').select('*').eq('component_id', componentId).order('id'),
    ]);
    if (compRes.error) return NextResponse.json({ error: compRes.error.message }, { status: 500 });
    if (!compRes.data) return NextResponse.json({ error: 'Component niet gevonden' }, { status: 404 });

    return NextResponse.json({
        component: compRes.data,
        allergens: allRes.data ?? [],
        haccp_points: haccpRes.data ?? [],
    });
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
    /* GP-5 (2026-05-25): drag-drop verplaatsing tussen folders.
       Accepteert string (folder UUID) of null (= "zonder folder"). */
    if (b.folder_id === null || typeof b.folder_id === 'string') {
        updateData.folder_id = b.folder_id;
    }

    // Optionele nested replace-arrays
    const replaceAllergens = Array.isArray(b.allergens) ? b.allergens : null;
    const replaceHaccp = Array.isArray(b.haccp_points) ? b.haccp_points : null;

    /* Bucket-C GP-4 (2026-05-25): bij base_cost_cents-wijziging moet de
       cost_at_use_cents van alle gerecht_components-rijen herrekend worden
       en de gerechten.total_cost_cents auto-rollup. Anders blijft de
       kostprijs in gerechten stale en klopt /q/[id] niet meer.
       We detecteren de oude base_cost_cents vóór de update. */
    let oldBaseCostCents: number | null = null;
    let oldBaseQuantity: number | null = null;
    if (typeof updateData.base_cost_cents === 'number') {
        const { data: pre } = await supabase
            .from('components')
            .select('base_cost_cents, base_quantity')
            .eq('id', componentId)
            .eq('organization_id', auth.orgId!)
            .maybeSingle();
        oldBaseCostCents = pre?.base_cost_cents ?? null;
        oldBaseQuantity = pre?.base_quantity ?? null;
    }

    // Update component zelf (alleen als er velden zijn) — anders skip + ga door naar joins
    let componentRow: Record<string, unknown> | null = null;
    if (Object.keys(updateData).length > 0) {
        const { data, error } = await supabase
            .from('components')
            .update(updateData)
            .eq('id', componentId)
            .eq('organization_id', auth.orgId!)
            .select()
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!data) return NextResponse.json({ error: 'Component niet gevonden of geen toegang' }, { status: 404 });
        componentRow = data;
    } else if (replaceAllergens === null && replaceHaccp === null) {
        return NextResponse.json({ error: 'Geen wijzigingen' }, { status: 400 });
    } else {
        // Verify ownership voor de joins (read-only check)
        const { data: own } = await supabase
            .from('components').select('id').eq('id', componentId).eq('organization_id', auth.orgId!).maybeSingle();
        if (!own) return NextResponse.json({ error: 'Component niet gevonden of geen toegang' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const warnings: string[] = [];

    // Replace-strategy: delete-all + insert-new (transactioneel via best-effort)
    if (replaceAllergens !== null) {
        const { error: delErr } = await supabase
            .from('component_allergens').delete().eq('component_id', componentId).eq('organization_id', auth.orgId!);
        if (delErr) warnings.push(`allergens delete: ${delErr.message}`);

        const rows = replaceAllergens
            .filter((a): a is { allergen_code: string } => typeof a === 'object' && a !== null && typeof (a as any).allergen_code === 'string')
            .map(a => {
                const code = (a as any).allergen_code.trim().toUpperCase();
                return {
                    component_id: componentId,
                    allergen_code: code,
                    ai_suggested: Boolean((a as any).ai_suggested),
                    confirmed_at: now,
                    confirmed_by: auth.user!.id,
                    organization_id: auth.orgId!,
                };
            })
            .filter(r => r.allergen_code.length > 0 && r.allergen_code.length <= 5);
        if (rows.length > 0) {
            const { error: insErr } = await supabase.from('component_allergens').insert(rows);
            if (insErr) warnings.push(`allergens insert: ${insErr.message}`);
        }
    }

    if (replaceHaccp !== null) {
        const { error: delErr } = await supabase
            .from('component_haccp_points').delete().eq('component_id', componentId).eq('organization_id', auth.orgId!);
        if (delErr) warnings.push(`haccp delete: ${delErr.message}`);

        const rows = replaceHaccp
            .filter((h: unknown): h is Record<string, unknown> => typeof h === 'object' && h !== null)
            .filter(h => typeof h.type === 'string' && ALLOWED_HACCP_TYPES.has(h.type as string))
            .map(h => ({
                component_id: componentId,
                type: h.type as string,
                threshold_value: typeof h.threshold_value === 'number' ? h.threshold_value : null,
                threshold_unit: typeof h.threshold_unit === 'string' ? h.threshold_unit : null,
                note: typeof h.note === 'string' ? h.note : null,
                ai_suggested: Boolean(h.ai_suggested),
                confirmed_at: now,
                confirmed_by: auth.user!.id,
                organization_id: auth.orgId!,
            }));
        if (rows.length > 0) {
            const { error: insErr } = await supabase.from('component_haccp_points').insert(rows);
            if (insErr) warnings.push(`haccp insert: ${insErr.message}`);
        }
    }

    /* GP-4 cascading recompute — uitvoeren ná component-update zodat we
       de NIEUWE base_cost_cents kennen. We re-fetchen het component en
       updaten elke gerecht_components-rij + sommeren gerechten.total_cost_cents. */
    let recomputedGerechten = 0;
    if (typeof updateData.base_cost_cents === 'number' && componentRow) {
        const newBaseCost = componentRow.base_cost_cents as number;
        const newBaseQty = (componentRow.base_quantity as number) ?? oldBaseQuantity ?? 1;

        if (newBaseCost !== oldBaseCostCents && newBaseQty > 0) {
            /* Stap 1: fetch alle gerecht_components-rijen met dit component_id */
            const { data: gcRows, error: gcErr } = await supabase
                .from('gerecht_components')
                .select('id, gerecht_id, quantity_used')
                .eq('component_id', componentId)
                .eq('organization_id', auth.orgId!);

            if (gcErr) {
                warnings.push(`cost-recompute fetch: ${gcErr.message}`);
            } else if (gcRows && gcRows.length > 0) {
                /* Stap 2: per rij nieuwe cost_at_use_cents berekenen + updaten.
                   Sequential ipv batch om RLS-policy-checks niet te verzwakken. */
                const updatePromises = gcRows.map(row => {
                    const newCost = Math.round((Number(row.quantity_used) / newBaseQty) * newBaseCost);
                    return supabase
                        .from('gerecht_components')
                        .update({ cost_at_use_cents: newCost })
                        .eq('id', row.id);
                });
                const results = await Promise.all(updatePromises);
                const failures = results.filter(r => r.error).length;
                if (failures > 0) warnings.push(`${failures} gerecht_components-rows failed to recompute`);

                /* Stap 3: gerechten.total_cost_cents per geraakt gerecht aggregeren.
                   Unique gerecht_id's verzamelen, dan per gerecht SUM(cost_at_use_cents). */
                const affectedGerechten = Array.from(new Set(gcRows.map(r => r.gerecht_id)));
                for (const gid of affectedGerechten) {
                    const { data: sumRow } = await supabase
                        .from('gerecht_components')
                        .select('cost_at_use_cents')
                        .eq('gerecht_id', gid)
                        .eq('organization_id', auth.orgId!);
                    if (sumRow) {
                        const totalCost = sumRow.reduce((s, r) => s + Number(r.cost_at_use_cents ?? 0), 0);
                        await supabase
                            .from('gerechten')
                            .update({ total_cost_cents: totalCost })
                            .eq('id', gid)
                            .eq('organization_id', auth.orgId!);
                    }
                }
                recomputedGerechten = affectedGerechten.length;
            }
        }
    }

    // Re-fetch full state na replace (kleine extra call, geeft UI clean basis)
    let finalComponent = componentRow;
    if (!finalComponent) {
        const { data } = await supabase.from('components').select('*').eq('id', componentId).maybeSingle();
        finalComponent = data;
    }

    return NextResponse.json({
        component: finalComponent,
        ...(warnings.length > 0 ? { warnings } : {}),
        ...(recomputedGerechten > 0 ? { recomputed_gerechten: recomputedGerechten } : {}),
    });
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
