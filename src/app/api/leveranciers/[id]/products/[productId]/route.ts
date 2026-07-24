/**
 * GET /api/leveranciers/[id]/products/[productId]
 *
 * Detail van één leveranciersproduct (Catalogus B) + append-only prijshistorie.
 * Sessie + RLS + expliciete organizationfilter. Alleen lezen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { supplierProductBaseCost, type SupplierProductCostRow } from '@/lib/supplierSync/recipeCost';

export const runtime = 'nodejs';

/** Resolve ingelogde user → org (gedeeld door GET/POST). */
async function resolveOrg(sb: Awaited<ReturnType<typeof createServerSupabase>>) {
    const { data: auth } = await sb.auth.getUser();
    if (!auth?.user) return { error: 'niet ingelogd', status: 401 as const };
    const { data: mem } = await sb
        .from('organization_members').select('organization_id')
        .eq('user_id', auth.user.id).eq('status', 'active').maybeSingle();
    if (!mem?.organization_id) return { error: 'geen organisatie', status: 403 as const };
    return { orgId: mem.organization_id as string, userId: auth.user.id as string };
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string; productId: string }> }) {
    const { id, productId } = await context.params;
    const supplierId = Number(id);
    const spId = Number(productId);
    if (!Number.isInteger(supplierId) || !Number.isInteger(spId)) {
        return NextResponse.json({ error: 'ongeldige id' }, { status: 400 });
    }

    const sb = await createServerSupabase();
    const { data: auth } = await sb.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: 'niet ingelogd' }, { status: 401 });

    const { data: mem } = await sb
        .from('organization_members').select('organization_id')
        .eq('user_id', auth.user.id).eq('status', 'active').maybeSingle();
    const orgId = mem?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'geen organisatie' }, { status: 403 });

    const { data: product } = await sb
        .from('supplier_products')
        .select('id, name, description, supplier_sku, ean, unit, package_size, package_unit, base_unit, total_base_quantity, price_cents, variable_weight, product_url, category, source, source_adapter_key, source_adapter_version, supplier_account_key, last_seen_at, last_updated_at, created_at, current_price_id')
        .eq('id', spId)
        .eq('supplier_id', supplierId)
        .eq('organization_id', orgId)
        .maybeSingle();
    if (!product) return NextResponse.json({ error: 'product niet gevonden' }, { status: 404 });

    const { data: history } = await sb
        .from('supplier_product_prices')
        .select('id, effective_price_ex_vat, regular_price_ex_vat, promo_price_ex_vat, price_per_kg_ex_vat, price_per_liter_ex_vat, price_per_piece_ex_vat, tax_mode, vat_pct, price_basis, is_current, captured_at, approved_at, created_at')
        .eq('organization_id', orgId)
        .eq('supplier_product_id', spId)
        .order('created_at', { ascending: false })
        .limit(30);

    return NextResponse.json({ product, history: history ?? [] });
}

/**
 * POST { action: 'make_component' }
 * Maakt van dit leveranciersproduct een bought-in component (gekoppeld via
 * supplier_product_id) zodat het in gerechten gebruikt kan worden. De kostprijs
 * volgt daarna automatisch de gesynchroniseerde prijs (refreshBoughtInPrices).
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string; productId: string }> }) {
    const { id, productId } = await context.params;
    const supplierId = Number(id);
    const spId = Number(productId);
    if (!Number.isInteger(supplierId) || !Number.isInteger(spId)) {
        return NextResponse.json({ error: 'ongeldige id' }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    if (body?.action !== 'make_component') {
        return NextResponse.json({ error: 'onbekende actie' }, { status: 400 });
    }

    const sb = await createServerSupabase();
    const org = await resolveOrg(sb);
    if ('error' in org) return NextResponse.json({ error: org.error }, { status: org.status });

    const { data: sp } = await sb
        .from('supplier_products')
        .select('id, name, price_cents, unit, package_size, package_unit, total_base_quantity, base_unit, variable_weight')
        .eq('id', spId).eq('supplier_id', supplierId).eq('organization_id', org.orgId).maybeSingle();
    if (!sp) return NextResponse.json({ error: 'product niet gevonden' }, { status: 404 });

    const base = supplierProductBaseCost(sp as SupplierProductCostRow);
    if (!base) {
        return NextResponse.json({ error: 'Verpakking onduidelijk — zet die eerst goed voordat je er een ingrediënt van maakt.' }, { status: 422 });
    }

    /* Al gekoppeld? Geen duplicaat maken. */
    const { data: existing } = await sb
        .from('components')
        .select('id')
        .eq('organization_id', org.orgId)
        .eq('supplier_product_id', spId)
        .eq('type', 'bought_in')
        .maybeSingle();
    if (existing) return NextResponse.json({ componentId: existing.id, existed: true });

    const { data: comp, error } = await sb
        .from('components')
        .insert({
            organization_id: org.orgId,
            name: sp.name,
            type: 'bought_in',
            category: 'food',
            base_quantity: base.base_quantity,
            base_unit: base.base_unit,
            base_cost_cents: base.base_cost_cents,
            supplier_product_id: spId,
        })
        .select('id')
        .single();
    if (error || !comp) return NextResponse.json({ error: error?.message || 'kon ingrediënt niet maken' }, { status: 500 });

    return NextResponse.json({ componentId: comp.id, base });
}
