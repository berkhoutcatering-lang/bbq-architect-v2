/**
 * Menu-marge — de KANON voor marge op menu-niveau.
 *
 * Bij een vast menu (bv. €38,50 p.p. voor 8 gangen) verkoop je geen losse
 * gerechten; je verdeelt één prijs over de gangen. De echte marge zit dus op het
 * HELE menu:
 *
 *     menu-marge% = (menu-prijs p.p. − som van de gerecht-kostprijzen p.p.) / menu-prijs
 *
 * Kostprijs per gerecht = een SIGNAAL (spot een uitschieter), het menu is het
 * OORDEEL. Een dure amuse mag, zolang de streep onder het hele menu klopt.
 *
 * Dit is de enige plek waar deze rekensom hoort te leven — alle analyse-schermen
 * (menukaart, /marges, gerechten-analyse, productanalyse) gebruiken dit.
 */

export interface MenuMarginResult {
    menuPricePP: number;         // vaste menu-prijs per gast (basis_prijs_pp)
    foodcostPP: number;          // som van de gerecht-kostprijzen per gast
    margeEurPP: number;          // menu-prijs − foodcost (in €)
    margePct: number | null;     // (marge / menu-prijs) × 100; null als er geen menu-prijs is
    foodcostPct: number | null;  // (foodcost / menu-prijs) × 100
    onTarget: boolean;           // margePct >= targetPct
    targetPct: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;

/** Menu-marge uit de losse gerecht-kostprijzen p.p. en de vaste menu-prijs p.p. */
export function computeMenuMargin(
    dishCostsPP: Array<number | null | undefined>,
    menuPricePP: number,
    targetPct = 65,
): MenuMarginResult {
    const foodcostPP = r2(dishCostsPP.reduce<number>((s, c) => s + (Number(c) || 0), 0));
    const price = Number(menuPricePP) > 0 ? Number(menuPricePP) : 0;
    const margeEurPP = r2(price - foodcostPP);
    const margePct = price > 0 ? r1((margeEurPP / price) * 100) : null;
    const foodcostPct = price > 0 ? r1((foodcostPP / price) * 100) : null;
    return {
        menuPricePP: price,
        foodcostPP,
        margeEurPP,
        margePct,
        foodcostPct,
        onTarget: margePct != null && margePct >= targetPct,
        targetPct,
    };
}

/** Aandeel van één gerecht-kostprijs in de menu-prijs (%). null zonder menu-prijs. */
export function costSharePct(dishCostPP: number, menuPricePP: number): number | null {
    return menuPricePP > 0 ? r1(((Number(dishCostPP) || 0) / menuPricePP) * 100) : null;
}

/** Uitschieter-signaal: weegt dit gerecht onevenredig zwaar op de menu-prijs?
 *  (default: kostprijs > 20% van de menu-prijs). Puur informatief — een menu
 *  wordt op het TOTAAL beoordeeld, niet per gerecht. */
export function isCostOutlier(dishCostPP: number, menuPricePP: number, thresholdPct = 20): boolean {
    const share = costSharePct(dishCostPP, menuPricePP);
    return share != null && share > thresholdPct;
}
