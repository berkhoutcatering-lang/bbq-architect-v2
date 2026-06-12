/* ============================================================
   Eén kostprijs-waarheid per gerecht (Operatie Overzicht, 2026-06-13)
   ------------------------------------------------------------
   Een gerecht kan kosten-data uit drie bronnen hebben:
     ① componenten-rollup  — gerechten.total_cost_cents, live bijgehouden
        door DB-triggers zodra component-prijzen wijzigen (hardste data)
     ② voorraad-foodcost   — berekend uit ingredient_costs/ingrediënten
        (calcDishFoodcost op de analyse-pagina's)
     ③ handmatig           — gerechten.kostprijs_pp (vrij invulveld)

   Elke lijst/analyse las vóór deze helper zijn eigen bron, waardoor
   hetzelfde gerecht op drie schermen drie kostprijzen kon tonen
   (gemeten: kippendij €14,98 aan componentkosten, overal "€0,00").
   Rangorde hier: ① > ② > ③. Lees kosten ALTIJD via deze helper.
   ============================================================ */

export interface GerechtKostenVelden {
    total_cost_cents?: number | null;
    kostprijs_pp?: number | string | null;
}

/** Effectieve kostprijs per portie in euro's. `voorraadFoodcost` is de al
    elders berekende ②-waarde (calcDishFoodcost) — geef 0 door als onbekend. */
export function effectieveKostprijsPP(g: GerechtKostenVelden, voorraadFoodcost = 0): number {
    const rollup = Number(g.total_cost_cents || 0);
    if (rollup > 0) return rollup / 100;
    if (voorraadFoodcost > 0) return voorraadFoodcost;
    return Number(g.kostprijs_pp || 0) || 0;
}

/** Waar komt het getal vandaan — voor UI-hints ("rolt op uit componenten"). */
export function kostprijsBron(g: GerechtKostenVelden, voorraadFoodcost = 0): 'componenten' | 'voorraad' | 'handmatig' | 'geen' {
    if (Number(g.total_cost_cents || 0) > 0) return 'componenten';
    if (voorraadFoodcost > 0) return 'voorraad';
    if ((Number(g.kostprijs_pp || 0) || 0) > 0) return 'handmatig';
    return 'geen';
}
