/* Marge per menukaart.
 *
 * De regressie die deze tests vastleggen: een bouwsteen zonder prijs telt in de
 * optelling gewoon als €0 mee. Zodra ÉÉN bouwsteen van een gerecht een prijs
 * had, was de kostprijs van dat gerecht groter dan nul en heette de menukaart
 * "dekking compleet" — groen, met een foodcost die te mooi was. Sam prijst zijn
 * menu dan te laag en ziet het pas op de jaarrekening.
 */

import { describe, it, expect } from 'vitest';
import { getMenuTemplateMargins } from './menuTemplates';

type Row = Record<string, unknown>;

function fakeSupabase(opts: {
    basisPrijsPP: number;
    items: Row[];               // menu_template_items met embedded gerecht
    componenten: Row[];         // gerecht_components: { gerecht_id, cost_at_use_cents }
}) {
    function bouwer(naam: string) {
        const api: Record<string, unknown> = {};
        const zelf = () => api;
        api.select = zelf;
        api.eq = zelf;
        api.in = zelf;
        api.order = zelf;
        api.maybeSingle = () => Promise.resolve({ data: { basis_prijs_pp: opts.basisPrijsPP }, error: null });
        api.then = (resolve: (v: { data: Row[]; error: null }) => unknown) => {
            const data = naam === 'menu_template_items' ? opts.items
                : naam === 'gerecht_components' ? opts.componenten
                    : [];
            return resolve({ data, error: null });
        };
        return api;
    }
    return { from: (naam: string) => bouwer(naam) } as never;
}

const GERECHT = {
    id: 'g-1', naam: 'Pulled pork bord', gang_slug: 'hoofd',
    verkoopprijs: null, kostprijs_pp: null, total_cost_cents: 900,
};

describe('getMenuTemplateMargins — bouwstenen zonder prijs', () => {
    it('noemt de dekking NIET compleet als een bouwsteen nog geen prijs heeft', async () => {
        const sb = fakeSupabase({
            basisPrijsPP: 38.5,
            items: [{ gerecht_id: 'g-1', gang_slug: 'hoofd', volgorde: 0, gerecht: GERECHT }],
            componenten: [
                { gerecht_id: 'g-1', cost_at_use_cents: 700 },
                { gerecht_id: 'g-1', cost_at_use_cents: 200 },
                { gerecht_id: 'g-1', cost_at_use_cents: 0 },   // nog geen prijs ingevuld
            ],
        });

        const res = await getMenuTemplateMargins(sb, 1, 70);

        expect(res.dekkingCompleet).toBe(false);
        expect(res.componentenZonderPrijs).toBe(1);
        expect(res.dishesMetGatInKostprijs).toBe(1);
        expect(res.dishesMetKostprijs).toBe(0);
        expect(res.dishes[0].componentenTotaal).toBe(3);
        expect(res.dishes[0].kostprijsCompleet).toBe(false);
        /* De kostprijs blijft wél gewoon meetellen — hij is te laag, niet weg. */
        expect(res.foodcostPP).toBeCloseTo(9);
    });

    it('is compleet zodra elke bouwsteen een prijs heeft', async () => {
        const sb = fakeSupabase({
            basisPrijsPP: 38.5,
            items: [{ gerecht_id: 'g-1', gang_slug: 'hoofd', volgorde: 0, gerecht: GERECHT }],
            componenten: [
                { gerecht_id: 'g-1', cost_at_use_cents: 700 },
                { gerecht_id: 'g-1', cost_at_use_cents: 200 },
            ],
        });

        const res = await getMenuTemplateMargins(sb, 1, 70);

        expect(res.dekkingCompleet).toBe(true);
        expect(res.componentenZonderPrijs).toBe(0);
        expect(res.dishesMetKostprijs).toBe(1);
    });

    it('rekent een handmatig ingevulde kostprijs zonder bouwstenen gewoon als compleet', async () => {
        const sb = fakeSupabase({
            basisPrijsPP: 38.5,
            items: [{
                gerecht_id: 'g-2', gang_slug: 'voor', volgorde: 0,
                gerecht: { id: 'g-2', naam: 'Brood met smeersels', gang_slug: 'voor', verkoopprijs: null, kostprijs_pp: 2.5, total_cost_cents: 0 },
            }],
            componenten: [],
        });

        const res = await getMenuTemplateMargins(sb, 1, 70);

        expect(res.dekkingCompleet).toBe(true);
        expect(res.dishes[0].kostprijsCompleet).toBe(true);
    });
});
