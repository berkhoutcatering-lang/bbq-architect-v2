import { describe, it, expect } from 'vitest';
import { getInvPrice, calcDishCostPP, calcOfferteMarge } from './costCalculations';

const inv = [
    { naam: 'Brisket', purchase_price: 28.50, unit: 'kg', yield_factor: 0.65 },
    { naam: 'Pulled Pork', purchase_price: 12.00, unit: 'kg', yield_factor: 0.7 },
    { naam: 'Coleslaw', purchase_price: 4.20, unit: 'kg', yield_factor: 1.0 },
    { naam: 'BBQ-saus', purchase_price: 8.00, unit: 'L', yield_factor: 1.0 },
    /* Zonder yield_factor → moet defaulten op 1.0 */
    { naam: 'Brood', purchase_price: 1.50, unit: 'stuks' },
];

describe('getInvPrice', () => {
    it('returnt price/unit/yield voor exacte naam (stale fallback)', () => {
        const r = getInvPrice(inv, 'Brisket');
        expect(r).toEqual({ price: 28.50, unit: 'kg', yield_factor: 0.65, price_source: 'stale', matched_by: 'name' });
    });

    it('matcht case-insensitive met trim', () => {
        const r = getInvPrice(inv, '  brisket  ');
        expect(r?.price).toBe(28.50);
    });

    it('returnt null bij onbekend ingredient', () => {
        expect(getInvPrice(inv, 'Tofu')).toBeNull();
    });

    it('returnt null bij lege naam', () => {
        expect(getInvPrice(inv, '')).toBeNull();
    });

    it('default yield_factor 1.0 als ontbreekt', () => {
        expect(getInvPrice(inv, 'Brood')?.yield_factor).toBe(1.0);
    });

    it('prefereert last_price_eur boven purchase_price (Pillar #4)', () => {
        const invFresh = [
            { naam: 'Brisket', purchase_price: 14.00, last_price_eur: 19.50, unit: 'kg', yield_factor: 0.65 },
        ];
        const r = getInvPrice(invFresh, 'Brisket');
        expect(r?.price).toBe(19.50);
        expect(r?.price_source).toBe('fresh');
    });

    it('valt terug op purchase_price als last_price_eur null is', () => {
        const invMixed = [
            { naam: 'Brisket', purchase_price: 14.00, last_price_eur: null, unit: 'kg' },
        ];
        const r = getInvPrice(invMixed, 'Brisket');
        expect(r?.price).toBe(14.00);
        expect(r?.price_source).toBe('stale');
    });
});

describe('calcDishCostPP', () => {
    const gerechten = [
        {
            naam: 'BBQ Plate',
            ingredient_costs: [
                { naam: 'Brisket', qty_pp: 0.18, unit: 'kg' },
                { naam: 'Pulled Pork', qty_pp: 0.15, unit: 'kg' },
                { naam: 'Coleslaw', qty_pp: 0.10, unit: 'kg' },
            ],
        },
        {
            naam: 'Vegan Plate',
            ingredient_costs: [], /* lege array — moet 0 returnen */
        },
        {
            naam: 'Mini Burger',
            ingredient_costs: [
                /* qty in g, inventory in kg → unit-conversie 0.001 */
                { naam: 'Brisket', qty_pp: 50, unit: 'g' },
            ],
        },
        {
            naam: 'Saus-bowl',
            ingredient_costs: [
                /* qty in ml, inventory in L → unit-conversie 0.001 */
                { naam: 'BBQ-saus', qty_pp: 30, unit: 'ml' },
            ],
        },
        {
            naam: 'Yield-test',
            ingredient_costs: [
                /* Eigen yield op het ingredient overrulet inventory yield_factor.
                   Brisket inventory yield = 0.65, hier 0.50 → hogere effective cost. */
                { naam: 'Brisket', qty_pp: 0.18, unit: 'kg', yield: 0.50 },
            ],
        },
    ];

    it('rekent foodcost correct met yield-factor van inventory', () => {
        /* Brisket: 0.18 kg / 0.65 yield × €28.50 = ~€7.89
           Pulled Pork: 0.15 kg / 0.7 × €12.00 = ~€2.57
           Coleslaw: 0.10 kg / 1.0 × €4.20 = €0.42
           Totaal ~ 10.88 */
        const cost = calcDishCostPP(gerechten as any, inv as any, 'BBQ Plate');
        expect(cost).toBeCloseTo(10.88, 1);
    });

    it('returnt 0 voor onbekende gerecht-naam', () => {
        expect(calcDishCostPP(gerechten as any, inv as any, 'Onbekend')).toBe(0);
    });

    it('returnt 0 voor lege ingredient_costs', () => {
        expect(calcDishCostPP(gerechten as any, inv as any, 'Vegan Plate')).toBe(0);
    });

    it('returnt 0 voor lege gerecht-naam', () => {
        expect(calcDishCostPP(gerechten as any, inv as any, '')).toBe(0);
    });

    it('past unit-conversie g→kg toe', () => {
        /* 50g Brisket / 0.65 × €28.50 = (0.05 / 0.65) × 28.50 = ~€2.19 */
        const cost = calcDishCostPP(gerechten as any, inv as any, 'Mini Burger');
        expect(cost).toBeCloseTo(2.19, 2);
    });

    it('past unit-conversie ml→L toe', () => {
        /* 30ml BBQ-saus × €8.00/L = €0.24 */
        const cost = calcDishCostPP(gerechten as any, inv as any, 'Saus-bowl');
        expect(cost).toBeCloseTo(0.24, 2);
    });

    it('eigen yield op ingredient overrulet inventory yield_factor', () => {
        /* yield 0.5 i.p.v. inventory 0.65 → 0.18/0.5 × 28.50 = €10.26 */
        const cost = calcDishCostPP(gerechten as any, inv as any, 'Yield-test');
        expect(cost).toBeCloseTo(10.26, 1);
    });

    /* Rangorde-canon (lib/gerecht-kosten): ① componenten-rollup > ② voorraad-
       foodcost > ③ handmatige kostprijs_pp. */
    it('Path 0: componenten-rollup wint van ingredient_costs én kostprijs_pp', () => {
        const g = [{
            naam: 'Rollup-gerecht',
            total_cost_cents: 36,
            ingredient_costs: [{ naam: 'Brisket', qty_pp: 0.18, unit: 'kg' }],
            kostprijs_pp: 9.99,
        }];
        expect(calcDishCostPP(g as any, inv as any, 'Rollup-gerecht')).toBeCloseTo(0.36, 2);
    });

    it('Path 0 wordt overgeslagen bij rollup 0 — valt terug op de ingredient-regels', () => {
        const g = [{
            naam: 'Geen-rollup',
            total_cost_cents: 0,
            ingredient_costs: [{ naam: 'Coleslaw', qty_pp: 0.10, unit: 'kg' }],
        }];
        expect(calcDishCostPP(g as any, inv as any, 'Geen-rollup')).toBeCloseTo(0.42, 2);
    });

    it('ingredient-regels die €0 opleveren blokkeren het kostprijs_pp-vangnet niet', () => {
        const g = [{
            naam: 'Onbekende-producten',
            ingredient_costs: [{ naam: 'Tofu', qty_pp: 0.2, unit: 'kg' }], // niet in voorraad → €0
            kostprijs_pp: 4.25,
        }];
        expect(calcDishCostPP(g as any, inv as any, 'Onbekende-producten')).toBeCloseTo(4.25, 2);
    });
});

describe('calcOfferteMarge', () => {
    const gerechten = [
        {
            naam: 'Hoofdgerecht',
            ingredient_costs: [
                { naam: 'Brisket', qty_pp: 0.18, unit: 'kg' },
            ],
        },
    ];

    it('berekent volledige offerte-marge met gasten + menu + vaste kosten', () => {
        const offerte = {
            aantal_gasten: 50,
            basis_prijs_pp: 40,
            menu_selectie: [{ gerecht_naam: 'Hoofdgerecht' }],
            vaste_kosten: [{ naam: 'Reiskosten', bedrag: 75 }, { naam: 'Materiaal', bedrag: 125 }],
        };
        const m = calcOfferteMarge(offerte, gerechten as any, inv as any);
        expect(m.gasten).toBe(50);
        expect(m.prijsPP).toBe(40);
        expect(m.omzet).toBe(2000);
        expect(m.foodcostPP).toBeCloseTo(7.89, 1); /* Brisket only */
        expect(m.foodcostTotaal).toBeCloseTo(394.6, 0);
        expect(m.vasteKosten).toBe(200);
        expect(m.nettoWinst).toBeCloseTo(2000 - 394.6 - 200, 0);
        expect(m.margePct).toBeCloseTo((m.nettoWinst / m.omzet) * 100, 1);
    });

    it('gebruikt items[0].qty als fallback voor aantal_gasten', () => {
        const offerte = {
            items: [{ qty: 25 }],
            basis_prijs_pp: 50,
            menu_selectie: [],
            vaste_kosten: [],
        };
        const m = calcOfferteMarge(offerte, [], []);
        expect(m.gasten).toBe(25);
        expect(m.omzet).toBe(1250);
    });

    it('default basis_prijs_pp = 38.50 als niet gezet', () => {
        const m = calcOfferteMarge({ aantal_gasten: 10 }, [], []);
        expect(m.prijsPP).toBe(38.50);
    });

    it('hanteert menu_selectie als sel.naam OF sel.gerecht_naam', () => {
        const offerte = {
            aantal_gasten: 1,
            basis_prijs_pp: 100,
            menu_selectie: [
                { naam: 'Hoofdgerecht' },           /* alleen .naam */
                { gerecht_naam: 'Hoofdgerecht' },   /* alleen .gerecht_naam */
            ],
            vaste_kosten: [],
        };
        const m = calcOfferteMarge(offerte, gerechten as any, inv as any);
        /* 2 hoofdgerechten geteld → ~7.89 × 2 = 15.78 */
        expect(m.foodcostPP).toBeCloseTo(15.78, 1);
    });

    it('margePct = 0 bij omzet 0', () => {
        const m = calcOfferteMarge({ aantal_gasten: 0, basis_prijs_pp: 0 }, [], []);
        expect(m.margePct).toBe(0);
    });
});
