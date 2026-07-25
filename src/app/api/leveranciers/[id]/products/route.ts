/**
 * GET /api/leveranciers/[id]/products
 *
 * Lijst van gesynchroniseerde/geïmporteerde leveranciersproducten (Catalogus B:
 * supplier_products) voor deze leverancier, met de huidige goedgekeurde prijs
 * (supplier_product_prices) en de deterministische prijs per kg/liter/stuk.
 *
 * Sessie + RLS + expliciete organizationfilter. Alleen lezen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { supplierProductBaseCost } from '@/lib/supplierSync/recipeCost';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    const supplierId = Number(id);
    if (!Number.isInteger(supplierId)) {
        return NextResponse.json({ error: 'ongeldige leverancier-id' }, { status: 400 });
    }
    // Zoekterm (server-side, zodat álle producten doorzocht worden i.p.v. alleen
    // de eerste 1000). Strip tekens die het PostgREST or()-filter zouden breken.
    const q = (req.nextUrl.searchParams.get('q') || '').trim().replace(/[,%_()]/g, ' ').trim();

    const sb = await createServerSupabase();
    const { data: auth } = await sb.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: 'niet ingelogd' }, { status: 401 });

    const { data: mem } = await sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', auth.user.id)
        .eq('status', 'active')
        .maybeSingle();
    const orgId = mem?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'geen organisatie' }, { status: 403 });

    /* Leverancier binnen deze org. */
    const { data: lev } = await sb
        .from('leveranciers')
        .select('id, naam')
        .eq('id', supplierId)
        .eq('organization_id', orgId)
        .maybeSingle();
    if (!lev) return NextResponse.json({ error: 'leverancier niet gevonden' }, { status: 404 });

    /* Producten (Catalogus B) — expliciete org + supplier filter naast RLS.
       Bij een zoekterm filtert de DB op naam/artikelnr/EAN (alle producten). */
    const cols = 'id, name, supplier_sku, ean, unit, package_size, package_unit, base_unit, total_base_quantity, price_cents, variable_weight, current_price_id, last_seen_at, last_updated_at, source, source_adapter_key';
    let query = sb.from('supplier_products').select(cols)
        .eq('organization_id', orgId).eq('supplier_id', supplierId).eq('active', true);
    let countQuery = sb.from('supplier_products').select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId).eq('supplier_id', supplierId).eq('active', true);
    if (q) {
        const orExpr = `name.ilike.%${q}%,supplier_sku.ilike.%${q}%,ean.ilike.%${q}%`;
        query = query.or(orExpr);
        countQuery = countQuery.or(orExpr);
    }
    const { data: products, error } = await query.order('name', { ascending: true }).limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { count: totalCount } = await countQuery;

    const rows = products ?? [];

    /* Huidige goedgekeurde prijzen ophalen (per kg/liter/stuk, 6 decimalen). */
    const priceIds = rows.map((p) => p.current_price_id).filter((x): x is number => typeof x === 'number');
    const priceById = new Map<number, { per_kg: number | null; per_liter: number | null; per_piece: number | null; effective: number | null; captured_at: string | null }>();
    if (priceIds.length > 0) {
        const { data: prices } = await sb
            .from('supplier_product_prices')
            .select('id, price_per_kg_ex_vat, price_per_liter_ex_vat, price_per_piece_ex_vat, effective_price_ex_vat, captured_at')
            .in('id', priceIds);
        for (const pr of prices ?? []) {
            priceById.set(pr.id, {
                per_kg: numOrNull(pr.price_per_kg_ex_vat),
                per_liter: numOrNull(pr.price_per_liter_ex_vat),
                per_piece: numOrNull(pr.price_per_piece_ex_vat),
                effective: numOrNull(pr.effective_price_ex_vat),
                captured_at: pr.captured_at ?? null,
            });
        }
    }

    const out = rows.map((p) => {
        const cur = p.current_price_id ? priceById.get(p.current_price_id) : null;
        // Fallback voor rijen zonder prijshistorie (handmatige import): reken de
        // per-eenheidprijs deterministisch uit price_cents + verpakking.
        let per_kg = cur?.per_kg ?? null;
        let per_liter = cur?.per_liter ?? null;
        let per_piece = cur?.per_piece ?? null;
        if (per_kg === null && per_liter === null && per_piece === null) {
            const base = supplierProductBaseCost({
                price_cents: p.price_cents, unit: p.unit, package_size: p.package_size,
                package_unit: p.package_unit, total_base_quantity: p.total_base_quantity, base_unit: p.base_unit,
            });
            if (base) {
                const euroPer100 = base.base_cost_cents / 100;
                if (base.base_unit === 'g') per_kg = round6(euroPer100 * 10);
                else if (base.base_unit === 'ml') per_liter = round6(euroPer100 * 10);
                else if (base.base_unit === 'stuk') per_piece = round6(euroPer100);
            }
        }
        return {
            id: p.id,
            name: p.name,
            supplier_sku: p.supplier_sku,
            ean: p.ean,
            unit: p.unit,
            package_size: p.package_size,
            package_unit: p.package_unit,
            price_cents: p.price_cents,
            effective_price_ex_vat: cur?.effective ?? (p.price_cents != null ? p.price_cents / 100 : null),
            per_kg, per_liter, per_piece,
            variable_weight: p.variable_weight,
            source: p.source_adapter_key || p.source,
            last_seen_at: p.last_seen_at || p.last_updated_at || null,
        };
    });

    // count = totaal dat aan de (zoek)filter voldoet; shown = wat we nu teruggeven
    // (max 1000). Zo weet de UI of er nog meer is dan getoond.
    return NextResponse.json({ leverancier: lev, products: out, count: totalCount ?? out.length, shown: out.length });
}

function numOrNull(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function round6(n: number): number {
    return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}
