/* /api/components/[id] — Inspiratie Bibliotheek
   GET:    component + allergens + haccp_points joined (voor edit-drawer in PR3b)
   PATCH:  update een component, optioneel met replace van allergens/haccp_points
   DELETE: verwijder een component (RESTRICT als in gerecht_components) */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { costAtUseCents } from '@/lib/unitPrice';
import { isMissingYieldColumn, YIELD_MIGRATIE_MELDING } from '../route';
import { syncComponentIngredients } from '@/lib/dal/componentIngredients';
import { supplierProductBaseCost } from '@/lib/supplierSync/recipeCost';

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

    /* Gekoppeld aan een leverancier? Geef de ACTUELE rij mee (genormaliseerd)
       zodat de editor de badge toont én de kostprijs kan meebewegen. Twee bronnen:
       Catalog A (supplier_prices) of Catalog B (supplier_products). */
    const compRow = compRes.data as Record<string, unknown>;
    let linkedPrice: Record<string, unknown> | null = null;
    const spId = compRow.supplier_price_id as number | null | undefined;
    const sprodId = compRow.supplier_product_id as number | null | undefined;
    if (spId) {
        const { data: sp } = await supabase
            .from('supplier_prices')
            .select('leverancier, product_naam, prijs_per_kg, prijs_per_stuk, actief')
            .eq('id', spId).eq('organization_id', auth.orgId!).maybeSingle();
        if (sp) linkedPrice = {
            source: 'price_list', leverancier: sp.leverancier, naam: sp.product_naam,
            actief: sp.actief, prijs_per_kg: sp.prijs_per_kg, prijs_per_stuk: sp.prijs_per_stuk,
        };
    } else if (sprodId) {
        const { data: sprod } = await supabase
            .from('supplier_products')
            .select('name, supplier_id, price_cents, unit, package_size, package_unit, total_base_quantity, base_unit, active')
            .eq('id', sprodId).eq('organization_id', auth.orgId!).maybeSingle();
        if (sprod) {
            const base = supplierProductBaseCost({
                price_cents: sprod.price_cents as number, unit: sprod.unit as string | null,
                package_size: sprod.package_size as number | null, package_unit: sprod.package_unit as string | null,
                total_base_quantity: sprod.total_base_quantity as number | null, base_unit: sprod.base_unit as string | null,
            });
            let levNaam: string | null = null;
            if (sprod.supplier_id != null) {
                const { data: l } = await supabase.from('leveranciers').select('naam').eq('id', sprod.supplier_id).maybeSingle();
                levNaam = (l?.naam as string) ?? null;
            }
            linkedPrice = {
                source: 'supplier_product', leverancier: levNaam, naam: sprod.name, actief: sprod.active,
                base_cost_cents: base?.base_cost_cents ?? null, base_quantity: base?.base_quantity ?? null, base_unit: base?.base_unit ?? null,
            };
        }
    }

    return NextResponse.json({
        component: compRes.data,
        allergens: allRes.data ?? [],
        haccp_points: haccpRes.data ?? [],
        linked_price: linkedPrice,
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
    /* food/non-food scheiding (2026-06-12) — whitelist. */
    if (b.category === 'food' || b.category === 'non_food') updateData.category = b.category;
    /* Pak-prijs administratie (2026-06-12): per veld updatebaar, null = wissen.
       De UI stuurt het trio altijd samen; base_* blijft de reken-canon. */
    if (b.pack_price_cents === null || (typeof b.pack_price_cents === 'number' && Number.isInteger(b.pack_price_cents) && b.pack_price_cents >= 0)) {
        updateData.pack_price_cents = b.pack_price_cents;
    }
    if (b.pack_quantity === null || (typeof b.pack_quantity === 'number' && b.pack_quantity > 0)) {
        updateData.pack_quantity = b.pack_quantity;
    }
    if (b.pack_unit === null || (typeof b.pack_unit === 'string' && ['g', 'kg', 'ml', 'liter', 'stuk', 'portie'].includes(b.pack_unit))) {
        updateData.pack_unit = b.pack_unit;
    }
    /* Snijverlies (0<y<=1). Buiten bereik => negeren i.p.v. stil klemmen, zodat
       een typfout (7 i.p.v. 70) niet ongemerkt de kostprijs 14× opblaast. */
    /* Volledige geldige range (gelijk aan de DB-CHECK 0<y<=1). Met een guard op
       <1 kon je snijverlies nooit meer terugzetten naar 100%: de waarde 1 viel
       uit de update en de DB hield de oude 0,75 vast — een eenrichtingsdeur op
       de kostprijs van élk gerecht met dat component. */
    if (typeof b.yield_factor === 'number' && Number.isFinite(b.yield_factor) && b.yield_factor > 0 && b.yield_factor <= 1) {
        updateData.yield_factor = b.yield_factor;
    }
    if (b.ingredients !== undefined) updateData.ingredients = b.ingredients;
    if (b.preparation_steps !== undefined) updateData.preparation_steps = b.preparation_steps;
    /* GP-5 (2026-05-25): drag-drop verplaatsing tussen folders.
       Accepteert string (folder UUID) of null (= "zonder folder"). */
    if (b.folder_id === null || typeof b.folder_id === 'string') {
        updateData.folder_id = b.folder_id;
    }
    /* Blijvende koppeling aan een leverancier-prijs (Catalog A). null = ontkoppelen. */
    if (b.master_product_id === null || (typeof b.master_product_id === 'number' && Number.isInteger(b.master_product_id))) {
        updateData.master_product_id = b.master_product_id;
    }
    if (b.supplier_price_id === null || (typeof b.supplier_price_id === 'number' && Number.isInteger(b.supplier_price_id))) {
        updateData.supplier_price_id = b.supplier_price_id;
    }
    if (b.supplier_product_id === null || (typeof b.supplier_product_id === 'number' && Number.isInteger(b.supplier_product_id))) {
        updateData.supplier_product_id = b.supplier_product_id;
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
    let oldYieldFactor: number | null = null;
    /* Ook bij een SNIJVERLIES-wijziging moet er herrekend worden: die verandert
       de kostprijs net zo hard als de inkoopprijs zelf. */
    if (typeof updateData.base_cost_cents === 'number' || typeof updateData.yield_factor === 'number') {
        const { data: pre } = await supabase
            .from('components')
            .select('base_cost_cents, base_quantity, yield_factor')
            .eq('id', componentId)
            .eq('organization_id', auth.orgId!)
            .maybeSingle();
        oldBaseCostCents = pre?.base_cost_cents ?? null;
        oldBaseQuantity = pre?.base_quantity ?? null;
        oldYieldFactor = (pre as { yield_factor?: number } | null)?.yield_factor ?? null;
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
        if (error) {
            if (isMissingYieldColumn(error)) {
                return NextResponse.json({ error: YIELD_MIGRATIE_MELDING }, { status: 409 });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
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

    // Genormaliseerde ingrediënt-koppeling bijwerken zodra de ingredients-JSONB
    // is meegestuurd. Best-effort — nooit fataal voor de component-update.
    if (b.ingredients !== undefined) {
        const sync = await syncComponentIngredients(supabase, auth.orgId!, componentId, b.ingredients);
        if (sync.error) warnings.push(`ingrediënt-koppeling: ${sync.error}`);
    }

    /* GP-4 cascading recompute — uitvoeren ná component-update zodat we
       de NIEUWE base_cost_cents kennen. We re-fetchen het component en
       updaten elke gerecht_components-rij + sommeren gerechten.total_cost_cents. */
    let recomputedGerechten = 0;
    if ((typeof updateData.base_cost_cents === 'number' || typeof updateData.yield_factor === 'number') && componentRow) {
        const newBaseCost = componentRow.base_cost_cents as number;
        const newBaseQty = (componentRow.base_quantity as number) ?? oldBaseQuantity ?? 1;
        const newYield = (componentRow as { yield_factor?: number }).yield_factor ?? 1;

        if ((newBaseCost !== oldBaseCostCents || newYield !== oldYieldFactor) && newBaseQty > 0) {
            /* Stap 1: fetch alle gerecht_components-rijen met dit component_id.
               De tabel heeft géén `id` — de sleutel is (gerecht_id, component_id),
               zie migratie 20260510130000. Vragen om `id` liet de hele query
               falen, waardoor kostprijzen nooit doorgerekend werden. */
            const { data: gcRows, error: gcErr } = await supabase
                .from('gerecht_components')
                .select('gerecht_id, quantity_used, unit')
                .eq('component_id', componentId)
                .eq('organization_id', auth.orgId!);

            if (gcErr) {
                warnings.push(`cost-recompute fetch: ${gcErr.message}`);
            } else if (gcRows && gcRows.length > 0) {
                /* Stap 2: per rij nieuwe cost_at_use_cents berekenen + updaten.
                   Sequential ipv batch om RLS-policy-checks niet te verzwakken. */
                const updatePromises = gcRows.map(row => {
                    /* Zelfde formule als de DB-trigger (migratie 20260729120000)
                       via de gedeelde canon, zodat app en DB niet uit elkaar lopen. */
                    const newCost = costAtUseCents({
                        quantityUsed: Number(row.quantity_used),
                        usedUnit: (row as { unit?: string }).unit,
                        baseQuantity: newBaseQty,
                        baseUnit: (componentRow as { base_unit?: string }).base_unit,
                        baseCostCents: newBaseCost,
                        yieldFactor: newYield,
                    });
                    /* Rij aanwijzen op de échte primaire sleutel; org-filter erbij
                       zodat een update nooit buiten de eigen organisatie kan vallen. */
                    return supabase
                        .from('gerecht_components')
                        .update({ cost_at_use_cents: newCost })
                        .eq('gerecht_id', row.gerecht_id)
                        .eq('component_id', componentId)
                        .eq('organization_id', auth.orgId!);
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
