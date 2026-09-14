/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { matchIngredientenTegenCatalogus, kostprijsLeverancier, type InIngredient } from '@/lib/ingredientMatchDb';

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
 * Ranking + prijs-rekenkunde in lib/recipeMatch.ts (puur + getest); het zoeken
 * in de vier bronnen staat in lib/ingredientMatchDb.ts, gedeeld met de route die
 * bouwstenen aan een prijs helpt.
 */

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

        /* Leveranciersvoorkeur (golf 1): rekenen op de rang-1-leverancier.
           De naam gaat mee terug zodat de UI "niet bij Bidfood" kan zeggen
           i.p.v. een vaag "geen match". */
        const lev = await kostprijsLeverancier(sb, orgId);
        const results = await matchIngredientenTegenCatalogus(sb, orgId, ingredients, lev);

        const matched = results.filter((r) => r.match && r.match.line_cost_cents != null).length;
        const totalCents = results.reduce((s, r) => s + (r.match?.line_cost_cents ?? 0), 0);

        return NextResponse.json({
            success: true,
            data: {
                ingredients: results,
                matched_count: matched,
                total_count: results.length,
                kostprijs_pp_cents: totalCents,
                kostprijs_leverancier: lev?.naam ?? null,
            },
        });
    } catch (e: any) {
        console.error('[recipe/match-ingredients]', e);
        return NextResponse.json({ error: e.message || 'Matching-fout' }, { status: 500 });
    }
}
