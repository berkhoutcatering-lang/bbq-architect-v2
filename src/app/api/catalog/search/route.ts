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

export const runtime = 'nodejs';

export interface CatalogSearchHit {
    master_product_id: number;
    supplier_price_id: number;
    naam: string;
    categorie: string | null;
    leverancier: string | null;
    prijs: number;
    eenheid: string | null;
    prijs_per_kg: number | null;
    prijs_per_stuk: number | null;
    datum: string | null;
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
    if (!masters || masters.length === 0) return NextResponse.json({ results: [] });

    const masterById = new Map<number, { naam: string; categorie: string | null; standaard_eenheid: string | null }>();
    for (const m of masters) {
        masterById.set(m.id as number, {
            naam: (m.naam as string) ?? '',
            categorie: (m.categorie as string | null) ?? null,
            standaard_eenheid: (m.standaard_eenheid as string | null) ?? null,
        });
    }

    /* 2) Actieve leverancier-prijzen voor die producten, nieuwste eerst. */
    const { data: prices, error: pErr } = await supabase
        .from('supplier_prices')
        .select('id, master_product_id, leverancier, prijs, eenheid, prijs_per_kg, prijs_per_stuk, datum')
        .eq('organization_id', orgId)
        .in('master_product_id', Array.from(masterById.keys()))
        .eq('actief', true)
        .order('datum', { ascending: false });
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    /* Flatten naar één optie per (product × leverancier); nieuwste actieve prijs wint. */
    const seen = new Set<string>();
    const results: CatalogSearchHit[] = [];
    for (const p of prices || []) {
        const masterId = p.master_product_id as number;
        const m = masterById.get(masterId);
        if (!m) continue;
        const key = `${masterId}|${(p.leverancier as string | null || '').toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
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

    results.sort((a, b) =>
        a.naam.localeCompare(b.naam, 'nl') ||
        (a.leverancier || '').localeCompare(b.leverancier || '', 'nl'),
    );

    return NextResponse.json({ results: results.slice(0, 50) });
}
