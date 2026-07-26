/**
 * GET /api/catalog/search?q=sparerib
 *
 * Zoekt de prijslijst-catalogus (master_products + supplier_prices — "Catalog A",
 * gevuld door de leverancier-prijslijst-import) op productnaam en geeft ÉÉN rij
 * terug per (product × leverancier met een actieve prijs). Zo kan de cateraar in
 * de component-editor bv. "sparerib" tikken en de juiste leverancier-versie
 * aanvinken (Beef Club 29 / Bitfood / Hanos), elk met eigen prijs.
 *
 * Belangrijk: we koppelen bewust NIET via components.supplier_product_id — dat is
 * een FK naar de andere catalogus (supplier_products) en levert een verkeerde
 * join op (bekende id-mismatch). De koppeling landt op ingrediënt-niveau in de
 * component-JSONB, met master_product_id + supplier_price_id als harde sleutels.
 *
 * Prijs = code-rekenwerk, nooit AI. We geven de opgeslagen leverancier-prijs
 * (prijs_per_kg / prijs_per_stuk) door; de kostprijs-som gebeurt client-side
 * deterministisch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { supplierProductBaseCost } from '@/lib/supplierSync/recipeCost';

export const runtime = 'nodejs';

export interface CatalogSearchHit {
    /* 'price_list' = Catalog A (master_products+supplier_prices, prijslijst-import).
       'supplier_product' = Catalog B (supplier_products, gescande bestel-catalogus,
       bv. Bidfood). Default undefined = price_list (back-compat). */
    source?: 'price_list' | 'supplier_product';
    master_product_id: number;
    supplier_price_id: number;
    /* Alleen bij source==='supplier_product'. */
    supplier_product_id?: number | null;
    naam: string;
    categorie: string | null;
    leverancier: string | null;
    prijs: number;
    eenheid: string | null;
    prijs_per_kg: number | null;
    prijs_per_stuk: number | null;
    datum: string | null;
    /* Voor-berekende base-kostprijs (alleen supplier_product) — client hoeft niet te rekenen. */
    base_cost_cents?: number | null;
    base_quantity?: number | null;
    base_unit?: string | null;
}

export async function GET(req: NextRequest) {
    /* Sanitize: houd letters/cijfers/spatie/koppelteken over. Weg met de tekens
       die een PostgREST-filterwaarde kunnen breken (%, _, komma, haakjes, *). */
    const raw = (req.nextUrl.searchParams.get('q') || '').trim();
    const q = raw.replace(/[%_,()*]/g, ' ').replace(/\s+/g, ' ').trim();
    if (q.length < 2) return NextResponse.json({ results: [] });

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    const orgId = member?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

    /* 1) Matchende producten. RLS scoped + expliciete org-filter (defensief). */
    const { data: masters, error: mErr } = await supabase
        .from('master_products')
        .select('id, naam, categorie, standaard_eenheid')
        .eq('organization_id', orgId)
        .eq('uit_assortiment', false)
        .ilike('naam', `%${q}%`)
        .limit(60);
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

    const wantSupplierProducts = req.nextUrl.searchParams.get('supplierProducts') === '1';
    const results: CatalogSearchHit[] = [];

    /* ── Catalog A: prijslijst (master_products + supplier_prices) ── */
    const masterById = new Map<number, { naam: string; categorie: string | null; standaard_eenheid: string | null }>();
    for (const m of (masters || [])) {
        masterById.set(m.id as number, {
            naam: (m.naam as string) ?? '',
            categorie: (m.categorie as string | null) ?? null,
            standaard_eenheid: (m.standaard_eenheid as string | null) ?? null,
        });
    }
    if (masterById.size > 0) {
        const { data: prices, error: pErr } = await supabase
            .from('supplier_prices')
            .select('id, master_product_id, leverancier, prijs, eenheid, prijs_per_kg, prijs_per_stuk, datum')
            .eq('organization_id', orgId)
            .in('master_product_id', Array.from(masterById.keys()))
            .eq('actief', true)
            .order('datum', { ascending: false, nullsFirst: false })
            .order('id', { ascending: false });
        if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

        const seen = new Set<string>();
        for (const p of prices || []) {
            const masterId = p.master_product_id as number;
            const m = masterById.get(masterId);
            if (!m) continue;
            const key = `${masterId}|${(p.leverancier as string | null || '').toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({
                source: 'price_list',
                master_product_id: masterId,
                supplier_price_id: p.id as number,
                naam: m.naam,
                categorie: m.categorie,
                leverancier: (p.leverancier as string | null) ?? null,
                prijs: Number(p.prijs) || 0,
                eenheid: (p.eenheid as string | null) ?? m.standaard_eenheid ?? null,
                prijs_per_kg: p.prijs_per_kg != null ? Number(p.prijs_per_kg) : null,
                prijs_per_stuk: p.prijs_per_stuk != null ? Number(p.prijs_per_stuk) : null,
                datum: (p.datum as string | null) ?? null,
            });
        }
    }

    /* ── Catalog B: gescande bestel-catalogus (supplier_products) — opt-in via
       ?supplierProducts=1. Zo kan bv. een Bidfood-coppa (die alleen gescand is,
       niet in de prijslijst) tóch aan een component gekoppeld worden. Kostprijs
       via supplierProductBaseCost (deterministisch). NOOIT id-join met Catalog A. */
    if (wantSupplierProducts) {
        const { data: sps } = await supabase
            .from('supplier_products')
            .select('id, name, supplier_id, price_cents, unit, package_size, package_unit, total_base_quantity, base_unit')
            .eq('organization_id', orgId)
            .eq('active', true)
            .ilike('name', `%${q}%`)
            .limit(30);
        if (sps && sps.length > 0) {
            const supIds = Array.from(new Set(sps.map((s) => s.supplier_id).filter(Boolean)));
            const levMap = new Map<number, string>();
            if (supIds.length > 0) {
                const { data: levs } = await supabase
                    .from('leveranciers').select('id, naam')
                    .eq('organization_id', orgId).in('id', supIds as number[]);
                for (const l of (levs || [])) levMap.set(l.id as number, (l.naam as string) ?? '');
            }
            for (const s of sps) {
                const base = supplierProductBaseCost({
                    price_cents: s.price_cents as number,
                    unit: s.unit as string | null,
                    package_size: s.package_size as number | null,
                    package_unit: s.package_unit as string | null,
                    total_base_quantity: s.total_base_quantity as number | null,
                    base_unit: s.base_unit as string | null,
                });
                results.push({
                    source: 'supplier_product',
                    master_product_id: 0,
                    supplier_price_id: 0,
                    supplier_product_id: s.id as number,
                    naam: s.name as string,
                    categorie: null,
                    leverancier: (s.supplier_id != null ? levMap.get(s.supplier_id as number) : null) ?? null,
                    prijs: (Number(s.price_cents) || 0) / 100,
                    eenheid: (s.unit as string | null) ?? null,
                    prijs_per_kg: null,
                    prijs_per_stuk: null,
                    datum: null,
                    base_cost_cents: base?.base_cost_cents ?? null,
                    base_quantity: base?.base_quantity ?? null,
                    base_unit: base?.base_unit ?? null,
                });
            }
        }
    }

    results.sort((a, b) =>
        a.naam.localeCompare(b.naam, 'nl') ||
        (a.leverancier || '').localeCompare(b.leverancier || '', 'nl'),
    );

    return NextResponse.json({ results: results.slice(0, 50) });
}
