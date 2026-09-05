/**
 * Pure BCG-rekenhulpen: kostprijs per gerecht, populariteit en de mediaan.
 *
 * Stonden in src/app/marges/BCGMatrix.tsx, en dat bestand begint met
 * 'use client'. Zodra de serverkant van /gerechten/analyse countDishPopularity
 * wilde aanroepen, brak de pagina met "Attempted to call
 * countDishPopularity() from the server but countDishPopularity is on the
 * client". De build zag dat niet; het bleek pas bij het openen van de pagina.
 *
 * Hier staat geen React in, dus zowel de server als de browser mag erbij.
 */

import { safeJsonParse } from '@/lib/utils';

export type Quadrant = 'star' | 'puzzle' | 'plowhorse' | 'dog';

export interface DishAnalysis {
  id: number;
  naam: string;
  gang_slug: string;
  popularity: number;
  foodcostPP: number;
  margePct: number;
  revenue: number;
  quadrant: Quadrant;
}


export function calcDishFoodcost(gerecht: any, inventoryData: any[]): number {
  const costs = gerecht.ingredient_costs;
  if (!costs || !Array.isArray(costs) || costs.length === 0) return 0;
  return costs.reduce(function (sum: number, it: any) {
    const inv = inventoryData.find(function (i: any) { return i.naam && it.naam && i.naam.toLowerCase() === it.naam.toLowerCase(); });
    const p = inv ? (inv.purchase_price || 0) : 0;
    const y = it.yield || (inv ? inv.yield_factor : 1.0) || 1.0;
    let f = 1;
    if (it.unit === 'g' && inv && inv.unit === 'kg') f = 0.001;
    if (it.unit === 'ml' && inv && inv.unit === 'L') f = 0.001;
    return sum + ((it.qty_pp || 0) * f / y) * p;
  }, 0);
}

export function countDishPopularity(dishName: string, dishId: number, eventsData: any[], offertesData: any[]): number {
  let count = 0;
  eventsData.forEach(function (ev: any) {
    const menu = typeof ev.menu === 'string' ? safeJsonParse(ev.menu, []) : (ev.menu || []);
    if (Array.isArray(menu)) {
      if (menu.includes(dishId) || menu.includes(String(dishId))) count++;
    }
  });
  offertesData.forEach(function (off: any) {
    const parsed = typeof off.menu_selectie === 'string' ? safeJsonParse(off.menu_selectie, {}) : (off.menu_selectie || {});
    let items: any[] = [];
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed && typeof parsed === 'object') {
      Object.values(parsed).forEach(function (arr: any) {
        if (Array.isArray(arr)) {
          arr.forEach(function (item: any) {
            items.push(typeof item === 'string' ? { naam: item } : item);
          });
        }
      });
    }
    const found = items.some(function (it: any) {
      const name = it.gerecht_naam || it.naam || '';
      return name === dishName;
    });
    if (found) count++;
  });
  return count;
}

export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort(function (a, b) { return a - b; });
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
