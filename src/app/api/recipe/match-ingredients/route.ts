/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { matchIngredientenTegenCatalogus, kostprijsLeverancier, leveranciersOpId, type InIngredient } from '@/lib/ingredientMatchDb';
import { zoekAlternatieven } from '@/lib/ingredientAlternatieven';
import { enforceAiCap } from '@/lib/aiCostCap';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/recipe/match-ingredients
 *
 * Input:  { ingredients: [{ naam, qty_pp, eenheid }], ai?: boolean }
 *   ai: true → voor regels zonder (zekere) treffer draait de AI-synoniemenstap
 *   meteen mee (golf 4). Alleen "hetzelfde product onder een andere naam"
 *   wordt automatisch gekozen, met zekerheid 'middel' en een ? in de UI; een
 *   ánder product komt als voorstel terug en wacht op de kok.
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

        /* Golf 4: automatisch leren. Maximaal 8 regels per aanroep langs de AI
           (1–2 ct en ~5 s per regel), vier tegelijk. */
        let aiCostCents = 0;
        let aiFouten = 0;
        if (body?.ai === true) {
            const open = results
                .map((r, i) => ({ r, i }))
                .filter(({ r }) => r.naam && (!r.match || r.match.confidence === 'laag'))
                .slice(0, 8);
            if (open.length > 0) {
                const cap = await enforceAiCap(orgId, 0.03 * open.length);
                if (!cap) {
                    const levById = await leveranciersOpId(sb, orgId);
                    const ctx = { sb, orgId, userId: user.id, lev, levById };
                    const batch = 4;
                    for (let s = 0; s < open.length; s += batch) {
                        await Promise.all(open.slice(s, s + batch).map(async ({ r, i }) => {
                            try {
                                const uit = await zoekAlternatieven(ctx, {
                                    naam: r.naam, qty: r.qty_pp, eenheid: r.eenheid, huidigeNaam: r.match?.name ?? null,
                                });
                                aiCostCents += uit.ai_cost_cents;
                                const eerste = uit.alternatieven[0];
                                if (!eerste) return;
                                if (uit.zelfde_product === true) {
                                    results[i] = { ...r, match: { ...eerste.match, via_ai: true, ai_reden: eerste.reden } };
                                } else {
                                    results[i] = { ...r, ai_voorstel: { name: eerste.match.name, reden: eerste.reden } };
                                }
                            } catch (e) {
                                /* AI-stap mag de matcher niet breken; regel blijft open. Wel tellen
                                   en loggen — stil slikken verbergt een rate-limit. */
                                aiFouten++;
                                console.warn('[match-ingredients] AI-stap mislukt voor', r.naam, e instanceof Error ? e.message : e);
                            }
                        }));
                    }
                }
            }
        }

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
                ai_cost_cents: aiCostCents,
                ai_fouten: aiFouten,
            },
        });
    } catch (e: any) {
        console.error('[recipe/match-ingredients]', e);
        return NextResponse.json({ error: e.message || 'Matching-fout' }, { status: 500 });
    }
}
