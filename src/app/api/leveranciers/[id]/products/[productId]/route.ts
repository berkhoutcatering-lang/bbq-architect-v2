/**
 * GET /api/leveranciers/[id]/products/[productId]
 *
 * Detail van één leveranciersproduct (Catalogus B) + append-only prijshistorie.
 * Sessie + RLS + expliciete organizationfilter. Alleen lezen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

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
