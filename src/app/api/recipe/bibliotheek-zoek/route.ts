/* GET /api/recipe/bibliotheek-zoek?q=paprika — eigen bouwstenen met een prijs.
 *
 * De catalogus-zoek (/api/catalog/search) kent alleen de prijslijsten. Wat de
 * kok zelf heeft ingevuld ("Paprikapoeder — Van Beekum", "Procureur — Echt
 * Held") staat als bought_in-bouwsteen in de bibliotheek en moet in dezelfde
 * zoekbalk verschijnen, mét de leverancier erbij. Anders vul je het elke keer
 * opnieuw in.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { toBaseUnit } from '@/lib/recipeMatch';

export const runtime = 'nodejs';

export const GET = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    const q = (req.nextUrl.searchParams.get('q') || '').trim().replace(/[%,()*]/g, ' ').trim();
    if (q.length < 2) return NextResponse.json({ results: [] });

    const { data, error } = await supabase
        .from('components')
        .select('id, name, type, base_quantity, base_unit, base_cost_cents, leverancier_naam')
        .eq('organization_id', orgId)
        .gt('base_cost_cents', 0)
        .ilike('name', `%${q}%`)
        .order('name', { ascending: true })
        .limit(12);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const results = (data ?? []).flatMap((c) => {
        const conv = toBaseUnit(c.base_unit);
        const qty = Number(c.base_quantity) || 0;
        if (!conv || qty <= 0) return [];
        /* Prijs per kg / liter / stuk, zoals de catalogus hem ook toont. */
        const perBasis = (Number(c.base_cost_cents) / qty / conv.factor) / 100; // euro per g/ml/stuk
        const prijs = conv.base === 'stuk' ? perBasis : perBasis * 1000;
        const per = conv.base === 'g' ? 'kg' : conv.base === 'ml' ? 'liter' : 'stuk';
        return [{
            component_id: c.id,
            naam: c.name,
            type: c.type,
            leverancier: c.leverancier_naam ?? null,
            prijs: Math.round(prijs * 100) / 100,
            per,
        }];
    });
    return NextResponse.json({ results });
});
