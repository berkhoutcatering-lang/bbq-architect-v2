/* POST /api/supplier-products/bulk — PR5 Inspiratie Bibliotheek
   Bulk-insert van AI-geparsed leverancier-producten in supplier_products.
   Optioneel: ook bought_in components aanmaken per product (linked via supplier_product_id). */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

interface BulkProduct {
    name: string;
    supplier_sku: string | null;
    price_cents: number;
    unit: string;
    package_size: number | null;
    package_unit: string | null;
}

interface BulkInput {
    supplier_id?: number | null;
    products: BulkProduct[];
    /** Maak ook bought_in components per geïmporteerd product? */
    create_components?: boolean;
}

function validate(body: unknown): { ok: true; data: BulkInput } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    if (!Array.isArray(b.products) || b.products.length === 0) {
        return { ok: false, error: 'products[] verplicht' };
    }
    if (b.products.length > 500) return { ok: false, error: 'Max 500 producten per call' };

    const clean: BulkProduct[] = [];
    for (const raw of b.products) {
        if (typeof raw !== 'object' || raw === null) continue;
        const p = raw as Record<string, unknown>;
        if (typeof p.name !== 'string' || !p.name.trim()) continue;
        if (typeof p.price_cents !== 'number' || !Number.isInteger(p.price_cents) || p.price_cents < 0) continue;
        if (typeof p.unit !== 'string' || !['stuk', 'kg', 'liter', 'ml', 'g'].includes(p.unit)) continue;
        clean.push({
            name: p.name.trim().slice(0, 80),
            supplier_sku: typeof p.supplier_sku === 'string' && p.supplier_sku.trim().length > 0 ? p.supplier_sku.trim() : null,
            price_cents: p.price_cents,
            unit: p.unit,
            package_size: typeof p.package_size === 'number' && p.package_size > 0 ? p.package_size : null,
            package_unit: typeof p.package_unit === 'string' && ['stuk', 'kg', 'liter', 'ml', 'g'].includes(p.package_unit) ? p.package_unit : null,
        });
    }
    if (clean.length === 0) return { ok: false, error: 'Geen geldige producten in input' };

    return {
        ok: true,
        data: {
            supplier_id: typeof b.supplier_id === 'number' && Number.isInteger(b.supplier_id) ? b.supplier_id : null,
            products: clean,
            create_components: b.create_components === true,
        },
    };
}

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: membership } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });
    const orgId = membership.organization_id as string;

    const body = await req.json().catch(() => null);
    const v = validate(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    // If supplier_id provided, verify het in onze org zit
    if (v.data.supplier_id !== null && v.data.supplier_id !== undefined) {
        const { data: sup } = await supabase
            .from('leveranciers').select('id').eq('id', v.data.supplier_id).eq('organization_id', orgId).maybeSingle();
        if (!sup) return NextResponse.json({ error: 'Leverancier niet gevonden in eigen org' }, { status: 404 });
    }

    const rows = v.data.products.map(p => ({
        ...p,
        supplier_id: v.data.supplier_id ?? null,
        organization_id: orgId,
        source: 'manual_upload' as const,
    }));

    const { data: inserted, error: insErr } = await supabase
        .from('supplier_products')
        .insert(rows)
        .select('id, name, price_cents, unit');

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    // Optioneel: auto-create bought_in components per supplier_product
    let createdComponents = 0;
    if (v.data.create_components && inserted && inserted.length > 0) {
        const compRows = inserted.map(sp => ({
            organization_id: orgId,
            name: sp.name,
            type: 'bought_in' as const,
            base_quantity: 1,
            base_unit: sp.unit,
            base_cost_cents: sp.price_cents,
            supplier_product_id: sp.id,
            ai_suggested: false,
            approved_at: new Date().toISOString(),
            approved_by: user.id,
        }));
        const { error: compErr, count } = await supabase
            .from('components')
            .insert(compRows, { count: 'exact' });
        if (compErr) {
            return NextResponse.json({
                supplier_products_inserted: inserted.length,
                components_inserted: 0,
                warning: `Producten OK; components-create faalde: ${compErr.message}`,
            });
        }
        createdComponents = count ?? compRows.length;
    }

    return NextResponse.json({
        supplier_products_inserted: inserted?.length ?? 0,
        components_inserted: createdComponents,
    }, { status: 201 });
}
