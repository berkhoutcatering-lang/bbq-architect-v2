/**
 * Pure BCG-analyse helpers voor de menu-engineering-kwadrant (Pillar 5
 * Menu & Recepten-hub). Geëxtraheerd uit /marges/page.tsx zodat we hetzelfde
 * pad kunnen gebruiken vanaf /gerechten/menu-analyse zonder duplicatie.
 *
 * BCG = Boston Consulting Group matrix toegepast op restaurant-gerechten
 * (Pavesic 1985):
 *   - x-as: populariteit (sales count laatste 90d)
 *   - y-as: marge%
 *   - quadrants: star, puzzle, plowhorse, dog (median splits)
 *
 * Geen AI-componenten, alle waardes komen uit DB. Hard rule 1+2+3 niet
 * van toepassing — dit is pure analytics.
 */

import { calcDishFoodcost, countDishPopularity, median, type DishAnalysis, type Quadrant } from '@/components/menu-analyse/BCGMatrix';

export { type DishAnalysis, type Quadrant };

export interface BcgAnalysisResult {
  dishes: DishAnalysis[];
  medianPop: number;
  medianMargin: number;
  /** Aggregaat-statistieken per quadrant. */
  stats: {
    stars: number;
    puzzles: number;
    plowhorses: number;
    dogs: number;
    avgMargin: number;
    totalRevenue: number;
  };
}

/**
 * Bouw de BCG-analyse vanuit ruwe DB-resultaten.
 *
 * @param fullGerechten Gerechten met `kostprijs_pp` of opgeloste `ingredient_costs`
 * @param eventsData Events met `aantal_gasten` voor popularity-count
 * @param offertesData Offertes met `basis_prijs_pp` voor avg selling price + popularity
 * @param inventoryData Inventory voor foodcost-derivation als fallback
 */
export function buildBcgAnalysis(
  fullGerechten: any[],
  eventsData: any[],
  offertesData: any[],
  inventoryData: any[],
): BcgAnalysisResult {
  if (fullGerechten.length === 0) {
    return { dishes: [], medianPop: 0, medianMargin: 0, stats: { stars: 0, puzzles: 0, plowhorses: 0, dogs: 0, avgMargin: 0, totalRevenue: 0 } };
  }

  const prices = offertesData
    .filter((o: any) => o.basis_prijs_pp && o.basis_prijs_pp > 0)
    .map((o: any) => o.basis_prijs_pp);
  const avgSellingPrice = prices.length > 0
    ? prices.reduce((s: number, p: number) => s + p, 0) / prices.length
    : 45;

  const dishes: DishAnalysis[] = [];
  fullGerechten.forEach((g: any) => {
    const foodcost = calcDishFoodcost(g, inventoryData);
    const effectiveCost = foodcost > 0 ? foodcost : (g.kostprijs_pp || 0);
    if (effectiveCost <= 0) return; // skip dishes zonder kosten-data

    const pop = countDishPopularity(g.naam, g.id, eventsData, offertesData);
    const marge = avgSellingPrice > 0 ? ((avgSellingPrice - effectiveCost) / avgSellingPrice) * 100 : 0;
    const revenue = pop * avgSellingPrice;

    dishes.push({
      id: g.id,
      naam: g.naam,
      gang_slug: g.gang_slug || 'anders',
      popularity: pop,
      foodcostPP: effectiveCost,
      margePct: Math.max(0, marge),
      revenue,
      quadrant: 'dog',
    });
  });

  if (dishes.length === 0) {
    return { dishes: [], medianPop: 0, medianMargin: 0, stats: { stars: 0, puzzles: 0, plowhorses: 0, dogs: 0, avgMargin: 0, totalRevenue: 0 } };
  }

  const medPop = median(dishes.map((d) => d.popularity));
  const medMargin = median(dishes.map((d) => d.margePct));

  dishes.forEach((d) => {
    const highPop = d.popularity >= medPop;
    const highMargin = d.margePct >= medMargin;
    if (highPop && highMargin) d.quadrant = 'star';
    else if (!highPop && highMargin) d.quadrant = 'puzzle';
    else if (highPop && !highMargin) d.quadrant = 'plowhorse';
    else d.quadrant = 'dog';
  });

  const stars = dishes.filter((x) => x.quadrant === 'star').length;
  const puzzles = dishes.filter((x) => x.quadrant === 'puzzle').length;
  const plowhorses = dishes.filter((x) => x.quadrant === 'plowhorse').length;
  const dogs = dishes.filter((x) => x.quadrant === 'dog').length;
  const avgMargin = dishes.reduce((s, x) => s + x.margePct, 0) / dishes.length;
  const totalRevenue = dishes.reduce((s, x) => s + x.revenue, 0);

  return {
    dishes,
    medianPop: medPop,
    medianMargin: medMargin,
    stats: { stars, puzzles, plowhorses, dogs, avgMargin, totalRevenue },
  };
}
