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

/* ============================================================
   PER PORTIE of VOOR `porties` PORTIES — de vraag die twee keer
   een factor 10 heeft gekost (2026-07-31)
   ------------------------------------------------------------
   Een gerecht draagt twee soorten hoeveelheden, en die schalen NIET hetzelfde:

   ① gerecht_components.quantity_used — PER PORTIE, per gast.
      Je zet "150 g bavette" en dat is wat er op één bord ligt. De DB-trigger
      telt cost_at_use_cents simpelweg op tot gerechten.total_cost_cents; er
      wordt nergens door `porties` gedeeld. Het bewerk-scherm noemt dat veld dan
      ook "Kostprijs p.p.".

   ② gerechten.ingredienten / bereidingswijze — de vrije RECEPTTEKST, geschreven
      voor `gerechten.porties` porties ("recept voor 10 personen"). Alleen díe
      tekst schaal je met gasten ÷ porties (zie api/ai-execute).

   `gerechten.porties` hoort dus NOOIT op component-data losgelaten te worden.
   Waar dat toch gebeurde:
     - LiveCostHeader deelde total_cost_cents door porties → een gerecht van
       €11,97 stond op het detailscherm als "€1,20 per portie", terwijl het
       overzicht ernaast €11,97 zei.
     - de MEP-planning rekende met gasten ÷ porties → 750 g inkopen voor 50 man
       waar 7,5 kg nodig was.

   Gebruik onderstaande helper in plaats van zelf te vermenigvuldigen, zodat een
   volgend scherm deze vraag niet opnieuw hoeft te beantwoorden.
   ============================================================ */

/** Hoeveel van een component je nodig hebt voor `gasten` gasten.
 *  quantity_used is per portie, dus dit is een simpele vermenigvuldiging —
 *  `gerechten.porties` speelt hier bewust geen enkele rol. */
export function componentHoeveelheidVoorGasten(quantityUsed: number, gasten: number): number {
    const q = Number(quantityUsed) || 0;
    const g = Number(gasten) || 0;
    if (q <= 0 || g <= 0) return 0;
    return q * g;
}
