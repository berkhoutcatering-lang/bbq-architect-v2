/* POST /api/recipe/kies-product — de kok kiest zelf het product voor een
 * ingrediënt: uit de catalogus (élke leverancier, ook de slager) of zelf
 * ingevuld met een prijs.
 *
 * Mathijs, 15 sep: "Ik koop mijn vlees bij de slager, daar heb ik een andere
 * procureur. Ik wil op de naam klikken en zoeken in de lijst — en zelf kunnen
 * invullen." De matcher rekent op Bidfood (voorkeur-rang 1); dit is de uitweg
 * voor alles wat je bewust ergens anders koopt.
 *
 * Body, één van twee:
 *   { source: 'supplier'|'supplier_product'|'component'|'inventory', ref_id, qty_pp, eenheid }
 *     → de catalogusregel wordt de koppeling; prijs uit die regel.
 *   { eigen: { naam, prijs_eur, per: 'kg'|'l'|'stuk', leverancier? }, qty_pp, eenheid }
 *     → een bought_in-bouwsteen in de eigen bibliotheek, met díe prijs. Daarna
 *       is het een gewoon product dat de matcher vindt.
 *
 * Geeft dezelfde MatchRegel terug als de matcher, met zekerheid 'hoog': de kok
 * heeft het zelf gezegd. Niets wordt aan een gerecht geschreven; de caller
 * bewaart de koppeling (en als alias via /api/recipe/aliases).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { kandidaatVanAlias, leveranciersOpId, maakMatchRegel } from '@/lib/ingredientMatchDb';
import type { MatchSource } from '@/lib/recipeMatch';

export const runtime = 'nodejs';

const BRONNEN = new Set<MatchSource>(['component', 'inventory', 'supplier', 'supplier_product']);
const PER = new Set(['kg', 'l', 'stuk']);

interface Body {
    source?: unknown;
    ref_id?: unknown;
    eigen?: { naam?: unknown; prijs_eur?: unknown; per?: unknown; leverancier?: unknown } | null;
    qty_pp?: unknown;
    eenheid?: unknown;
}

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId, userId }: TenantAuthCtx) => {
    let body: Body;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
    }
    const qty = Number(body.qty_pp) || 0;
    const eenheid = typeof body.eenheid === 'string' ? body.eenheid.trim().slice(0, 20) : '';
    const levById = await leveranciersOpId(supabase, orgId);

    /* Zelf ingevuld → bouwsteen in de bibliotheek. */
    if (body.eigen) {
        const naam = typeof body.eigen.naam === 'string' ? body.eigen.naam.trim().slice(0, 200) : '';
        const prijs = Number(body.eigen.prijs_eur);
        const per = typeof body.eigen.per === 'string' ? body.eigen.per : '';
        const leverancier = typeof body.eigen.leverancier === 'string' ? body.eigen.leverancier.trim().slice(0, 120) : '';
        if (!naam) return NextResponse.json({ error: 'Geen productnaam' }, { status: 400 });
        if (!Number.isFinite(prijs) || prijs <= 0) return NextResponse.json({ error: 'Vul een prijs in (euro per kg, liter of stuk)' }, { status: 400 });
        if (!PER.has(per)) return NextResponse.json({ error: 'Kies per kg, liter of stuk' }, { status: 400 });

        /* base_quantity/base_unit = "1 kg" met base_cost_cents = de prijs per kg;
           de matcher rekent daar zelf per gram mee. Geen dubbele bouwsteen met
           dezelfde naam: bestaat hij al, dan werken we de prijs bij. */
        const { data: bestaand } = await supabase
            .from('components').select('id').eq('organization_id', orgId).ilike('name', naam).limit(1).maybeSingle();
        const rij = {
            organization_id: orgId,
            name: naam,
            type: 'bought_in',
            category: 'food',
            base_quantity: 1,
            base_unit: per,
            base_cost_cents: Math.round(prijs * 100),
            ai_suggested: false,
            approved_at: new Date().toISOString(),
            approved_by: userId,
            description: leverancier ? `Ingekocht bij ${leverancier}. Prijs zelf ingevuld.` : 'Prijs zelf ingevuld.',
        };
        const { data: comp, error } = bestaand
            ? await supabase.from('components').update({ base_quantity: 1, base_unit: per, base_cost_cents: rij.base_cost_cents, description: rij.description }).eq('id', bestaand.id).eq('organization_id', orgId).select('id').single()
            : await supabase.from('components').insert(rij).select('id').single();
        if (error || !comp) return NextResponse.json({ error: error?.message ?? 'Bouwsteen aanmaken mislukte' }, { status: 500 });

        const cand = await kandidaatVanAlias(supabase, orgId, {
            alias_normalized: '', source: 'component', ref_id: comp.id as number, product_name: naam, supplier_name: leverancier || null,
        }, levById);
        if (!cand) return NextResponse.json({ error: 'Bouwsteen is aangemaakt maar niet terug te lezen' }, { status: 500 });
        const match = maakMatchRegel({ ...cand, supplier: leverancier || null }, 'hoog', qty, eenheid);
        return NextResponse.json({ success: true, data: { match, component_id: comp.id } });
    }

    /* Uit de catalogus: bron + id → dezelfde regel als de matcher zou maken. */
    const source = typeof body.source === 'string' ? body.source : '';
    const refId = Number(body.ref_id);
    if (!BRONNEN.has(source as MatchSource) || !Number.isInteger(refId)) {
        return NextResponse.json({ error: 'Onbekend product' }, { status: 400 });
    }
    const cand = await kandidaatVanAlias(supabase, orgId, {
        alias_normalized: '', source: source as MatchSource, ref_id: refId, product_name: '', supplier_name: null,
    }, levById);
    if (!cand) return NextResponse.json({ error: 'Product niet gevonden of zonder bruikbare prijs' }, { status: 404 });
    return NextResponse.json({ success: true, data: { match: maakMatchRegel(cand, 'hoog', qty, eenheid) } });
});
