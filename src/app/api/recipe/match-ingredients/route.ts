/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { supplierProductBaseCost } from '@/lib/supplierSync/recipeCost';
import {
    normalizeIngredientName,
    pickBestMatch,
    lineCostCents,
    toBaseUnit,
    type CostCandidate,
    type BaseUnit,
} from '@/lib/recipeMatch';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/recipe/match-ingredients
 *
 * Input:  { ingredients: [{ naam, qty_pp, eenheid }] }
 * Output: per ingrediënt de beste kostprijs-bron + regel-kostprijs.
 *
 * Dit is de kost-motor achter "recept uit foto". De AI (vision) heeft de
 * ingrediënten gelezen; DEZE route bepaalt de koppeling en LEIDT de kostprijs
 * af uit de echte catalogus-rij (Golden Pillar #3 — nooit AI-verzonnen).
 *
 * Zoekt per ingrediënt in 3 bronnen, org-scoped:
 *   1. components  (eigen bibliotheek — base_cost_cents)
 *   2. inventory   (eigen voorraad — purchase_price / last_price_eur)
 *   3. supplier_prices    (Catalogus A — de geimporteerde prijslijsten)
 *   4. supplier_products (Catalogus B — de gescande bestel-catalogus)
 *
 * Catalogus B stond hier eerst bewust NIET bij, uit de regel "nooit de twee
 * catalogi op id joinen". Die regel gaat over JOINEN, niet over zoeken: 7.7k
 * gescande producten negeren maakte de kostprijs van een recept structureel te
 * laag. Ze blijven aparte bronnen met een eigen id-ruimte.
 *
 * Ranking + prijs-rekenkunde in lib/recipeMatch.ts (puur + getest).
 */

interface InIngredient { naam: string; qty_pp?: number; eenheid?: string }

/** Langste betekenisvolle token — de ilike-zoekterm (bv. "verse tijm" → "tijm"). */
function searchTerm(naam: string): string {
    const toks = normalizeIngredientName(naam).split(' ').filter((t) => t.length >= 3);
    if (toks.length === 0) return normalizeIngredientName(naam);
    return toks.sort((a, b) => b.length - a.length)[0];
}

/** components-rij → CostCandidate (centen per base-eenheid). */
function fromComponent(r: any): CostCandidate | null {
    const conv = toBaseUnit(r.base_unit);
    const qty = Number(r.base_quantity) || 0;
    const cents = Number(r.base_cost_cents) || 0;
    if (!conv || qty <= 0 || cents <= 0) return null;
    // base_cost_cents geldt voor base_quantity van base_unit → per 1 base-eenheid
    const perBase = cents / qty / conv.factor;
    return { source: 'component', ref_id: r.id, name: r.name, centsPerBaseUnit: perBase, baseUnit: conv.base };
}

/** inventory-rij → CostCandidate. purchase_price/last_price_eur is euro per `unit`. */
function fromInventory(r: any): CostCandidate | null {
    const conv = toBaseUnit(r.unit);
    const eur = Number(r.last_price_eur ?? r.purchase_price) || 0;
    if (!conv || eur <= 0) return null;
    const perBase = (eur * 100) / conv.factor; // euro→cent, per base-eenheid
    return { source: 'inventory', ref_id: r.id, name: r.naam, centsPerBaseUnit: perBase, baseUnit: conv.base, supplier: r.supplier ?? null };
}

/** supplier_prices-rij (Catalog A) → CostCandidate. Prefereer genormaliseerde velden. */
function fromSupplierPrice(r: any): CostCandidate | null {
    const name = r.product_naam as string;
    const perKg = Number(r.prijs_per_kg) || 0;
    const perStuk = Number(r.prijs_per_stuk) || 0;
    // Alléén de genormaliseerde prijs-velden zijn betrouwbaar. De kale `prijs`
    // + vrije `eenheid` ("doos", "pak", "stuks", "500 gr") is te dubbelzinnig —
    // een pak-totaal als €/kg of €/stuk lezen geeft een catastrofaal foute
    // kostprijs. Zonder genormaliseerde prijs → geen kandidaat → eerlijk "geschat".
    // (66% van de catalogus heeft prijs_per_kg/prijs_per_stuk; ruim genoeg.)
    const base: { base: BaseUnit; perBase: number } | null =
        perKg > 0 ? { base: 'g', perBase: (perKg * 100) / 1000 }
        : perStuk > 0 ? { base: 'stuk', perBase: perStuk * 100 }
        : null;
    if (!base) return null;
    return {
        source: 'supplier', ref_id: r.id, name,
        centsPerBaseUnit: base.perBase, baseUnit: base.base,
        supplier: r.leverancier ?? null, masterProductId: r.master_product_id ?? null,
    };
}

/** supplier_products-rij (Catalog B, gescande bestel-catalogus) → CostCandidate.
 *
 * Deze bron ontbrak, en dat kostte geld: master_products bevat 0 producten met
 * "salsa", supplier_products twee mét prijs. Zo'n regel kwam er als "geschat"
 * uit terwijl de echte prijs (EUR 7,50/kg) gewoon in huis was — de kostprijs van
 * het recept viel te laag uit en de marge zag er te mooi uit.
 *
 * De kostprijs komt uit supplierProductBaseCost, dezelfde deterministische
 * helper die de catalogus-zoek en de component-drawer gebruiken. We joinen
 * NOOIT op id met Catalogus A; dit is een eigen bron met een eigen id-ruimte. */
function fromSupplierProduct(r: any, levNaam: string | null): CostCandidate | null {
    const base = supplierProductBaseCost({
        price_cents: r.price_cents, unit: r.unit,
        package_size: r.package_size, package_unit: r.package_unit,
        total_base_quantity: r.total_base_quantity, base_unit: r.base_unit,
    });
    if (!base || base.base_cost_cents <= 0) return null;
    const conv = toBaseUnit(base.base_unit);
    if (!conv || base.base_quantity <= 0) return null;
    const perBase = base.base_cost_cents / base.base_quantity / conv.factor;
    return {
        source: 'supplier_product', ref_id: r.id, name: r.name,
        centsPerBaseUnit: perBase, baseUnit: conv.base,
        supplier: levNaam, supplierProductId: r.id,
    };
}

export async function POST(req: NextRequest) {
    try {
        const sb = await createServerSupabase();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

        const { data: member } = await sb
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
        const orgId = member?.organization_id as string | undefined;
        if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

        const body = await req.json();
        const ingredients: InIngredient[] = Array.isArray(body?.ingredients) ? body.ingredients.slice(0, 40) : [];
        if (ingredients.length === 0) {
            return NextResponse.json({ error: 'Geen ingrediënten' }, { status: 400 });
        }

        /* Leveranciersnamen één keer ophalen i.p.v. per ingrediënt: supplier_products
           heeft alleen een supplier_id, en zonder naam staat er straks "onbekende
           leverancier" bij een product waarvan we de leverancier prima kennen. */
        const { data: levs } = await sb
            .from('leveranciers').select('id, naam').eq('organization_id', orgId);
        const levById = new Map<number, string>();
        for (const l of levs ?? []) levById.set(l.id as number, (l.naam as string) ?? '');

        const results = await Promise.all(ingredients.map(async (ing) => {
            const naam = String(ing.naam || '').slice(0, 120);
            const qty = Number(ing.qty_pp) || 0;
            const eenheid = String(ing.eenheid || 'stuks');
            const term = searchTerm(naam);
            if (!term) return { naam, qty_pp: qty, eenheid, match: null as any };

            // 4 bronnen parallel doorzoeken, org-scoped (RLS + expliciete filter).
            const [comp, inv, sup, sprod] = await Promise.all([
                sb.from('components').select('id,name,base_quantity,base_unit,base_cost_cents')
                    .eq('organization_id', orgId).ilike('name', `%${term}%`).limit(15),
                sb.from('inventory').select('id,naam,unit,purchase_price,last_price_eur,supplier')
                    .eq('organization_id', orgId).ilike('naam', `%${term}%`).limit(15),
                sb.from('supplier_prices').select('id,product_naam,prijs,prijs_per_kg,prijs_per_stuk,eenheid,leverancier,master_product_id')
                    .eq('organization_id', orgId).eq('actief', true).ilike('product_naam', `%${term}%`).limit(25),
                sb.from('supplier_products').select('id,name,supplier_id,price_cents,unit,package_size,package_unit,total_base_quantity,base_unit')
                    .eq('organization_id', orgId).eq('active', true).ilike('name', `%${term}%`).limit(25),
            ]);

            const candidates: CostCandidate[] = [
                ...(comp.data || []).map(fromComponent),
                ...(inv.data || []).map(fromInventory),
                ...(sup.data || []).map(fromSupplierPrice),
                ...(sprod.data || []).map((r: any) => fromSupplierProduct(r, levById.get(r.supplier_id) ?? null)),
            ].filter((c): c is CostCandidate => c !== null);

            const best = pickBestMatch(naam, candidates);
            if (!best) return { naam, qty_pp: qty, eenheid, match: null };

            const line = lineCostCents(qty, eenheid, best.candidate);
            return {
                naam, qty_pp: qty, eenheid,
                match: {
                    source: best.candidate.source,
                    ref_id: best.candidate.ref_id,
                    name: best.candidate.name,
                    supplier: best.candidate.supplier ?? null,
                    master_product_id: best.candidate.masterProductId ?? null,
                    confidence: best.confidence,
                    // null = eenheden onvergelijkbaar → toon "geschat", geen valse zekerheid
                    line_cost_cents: line,
                    unit_incompatible: line === null,
                    // voor "maak component van dit product": per-base-eenheid prijs
                    cents_per_base_unit: best.candidate.centsPerBaseUnit,
                    base_unit: best.candidate.baseUnit,
                },
            };
        }));

        const matched = results.filter((r) => r.match && r.match.line_cost_cents != null).length;
        const totalCents = results.reduce((s, r) => s + (r.match?.line_cost_cents ?? 0), 0);

        return NextResponse.json({
            success: true,
            data: {
                ingredients: results,
                matched_count: matched,
                total_count: results.length,
                kostprijs_pp_cents: totalCents,
            },
        });
    } catch (e: any) {
        console.error('[recipe/match-ingredients]', e);
        return NextResponse.json({ error: e.message || 'Matching-fout' }, { status: 500 });
    }
}
