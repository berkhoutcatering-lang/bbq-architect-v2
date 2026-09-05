import { describe, it, expect } from 'vitest';
import { getMargin } from '@/components/menu/helpers';
import { effectieveKostprijsPP } from '@/lib/gerecht-kosten';

/* De gezondheidsweergave rekende gerechten zonder kostprijs mee als 0% marge.
   Die belandden in de rode bak, en dan leest het scherm "13 gerechten onder de
   50%" terwijl de waarheid is dat we van 13 gerechten niets weten. Deze tests
   leggen de scheiding vast die HealthView nu maakt. */

type G = Parameters<typeof getMargin>[0];
const gerecht = (p: Partial<G>): G => ({ kostprijs_pp: null, verkoopprijs: null, prijs: null, ...p } as G);

function splits(lijst: G[]) {
    const meetbaar = lijst.filter((g) => effectieveKostprijsPP(g) > 0);
    const margins = meetbaar.map((g) => getMargin(g));
    return {
        zonderKostprijs: lijst.length - meetbaar.length,
        meetbaar: meetbaar.length,
        gemiddelde: margins.length > 0 ? Math.round(margins.reduce((s, m) => s + m, 0) / margins.length) : null,
    };
}

describe('gezondheidsweergave: onbekend is geen nul', () => {
    it('telt een gerecht zonder kostprijs niet mee in het gemiddelde', () => {
        const uit = splits([
            gerecht({ kostprijs_pp: 5, verkoopprijs: 20 }),   // 75%
            gerecht({ verkoopprijs: 20 }),                     // onbekend
        ]);
        expect(uit.zonderKostprijs).toBe(1);
        expect(uit.meetbaar).toBe(1);
        /* Zou het onbekende gerecht als 0% meetellen, dan stond hier 38. */
        expect(uit.gemiddelde).toBe(75);
    });

    it('geeft geen gemiddelde als er niets te meten valt', () => {
        const uit = splits([gerecht({ verkoopprijs: 20 }), gerecht({ verkoopprijs: 30 })]);
        expect(uit.gemiddelde).toBeNull();
        expect(uit.zonderKostprijs).toBe(2);
    });

    it('kan met een lege lijst om', () => {
        expect(splits([])).toEqual({ zonderKostprijs: 0, meetbaar: 0, gemiddelde: null });
    });

    it('rekent de componenten-rollup als bekende kostprijs', () => {
        const uit = splits([gerecht({ total_cost_cents: 500, verkoopprijs: 20 } as Partial<G>)]);
        expect(uit.zonderKostprijs).toBe(0);
        expect(uit.gemiddelde).toBe(75);
    });
});
