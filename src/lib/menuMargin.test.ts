import { describe, it, expect } from 'vitest';
import { computeMenuMargin, costSharePct, isCostOutlier } from './menuMargin';

describe('computeMenuMargin — marge op menu-niveau', () => {
    it('rekent (menu-prijs − som kostprijzen) / menu-prijs', () => {
        // Sam's voorbeeld: 8 gangen, totaal €13,54 kostprijs, menu €38,50.
        const r = computeMenuMargin([0.80, 0.50, 1.90, 1.20, 3.14, 2.80, 2.20, 1.00], 38.5);
        expect(r.foodcostPP).toBe(13.54);
        expect(r.margeEurPP).toBe(24.96);
        expect(r.margePct).toBe(64.8);
        expect(r.foodcostPct).toBe(35.2);
    });

    it('telt losse gerecht-kostprijzen op', () => {
        const r = computeMenuMargin([1, 2, 3], 38.5);
        expect(r.foodcostPP).toBe(6);
        expect(r.margeEurPP).toBe(32.5);
    });

    it('negeert null/undefined kostprijzen', () => {
        const r = computeMenuMargin([3.14, null, undefined, 1], 20);
        expect(r.foodcostPP).toBe(4.14);
    });

    it('geen menu-prijs → margePct null (nooit stil 0 of ∞)', () => {
        const r = computeMenuMargin([3.14, 1], 0);
        expect(r.margePct).toBeNull();
        expect(r.foodcostPct).toBeNull();
        expect(r.foodcostPP).toBe(4.14);
        expect(r.onTarget).toBe(false);
    });

    it('onTarget = margePct >= doel', () => {
        expect(computeMenuMargin([13.54], 38.5, 60).onTarget).toBe(true);  // 64.8% >= 60
        expect(computeMenuMargin([13.54], 38.5, 70).onTarget).toBe(false); // 64.8% < 70
    });
});

describe('costSharePct / isCostOutlier — per-gerecht signaal', () => {
    it('aandeel van een gerecht in de menu-prijs', () => {
        expect(costSharePct(3.14, 38.5)).toBe(8.2);
        expect(costSharePct(5, 0)).toBeNull();
    });

    it('markeert een gerecht dat onevenredig zwaar weegt (>20% default)', () => {
        expect(isCostOutlier(3.14, 38.5)).toBe(false);   // 8% → prima
        expect(isCostOutlier(9, 38.5)).toBe(true);        // 23% → uitschieter
        expect(isCostOutlier(9, 0)).toBe(false);          // geen menu-prijs → geen oordeel
    });
});
