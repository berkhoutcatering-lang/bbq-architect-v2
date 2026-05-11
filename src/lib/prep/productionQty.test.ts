import { describe, it, expect } from 'vitest';
import {
    calculateProductionPlan,
    aggregateProductionLines,
    type ProductionPlanInput,
} from './productionQty';

const sample: ProductionPlanInput = {
    guests: 75,
    dishes: [
        {
            gerecht_id: 'dish-1',
            gerecht_naam: 'Pulled Pork',
            ingredients: [
                { naam: 'Procureur', qty_pp: 0.18, unit: 'kg', yield: 0.7 },
                { naam: 'Brioche-bol', qty_pp: 2, unit: 'st' },
            ],
        },
        {
            gerecht_id: 'dish-2',
            gerecht_naam: 'Brisket',
            ingredients: [
                { naam: 'Brisket', qty_pp: 0.22, unit: 'kg', yield: 0.65 },
            ],
        },
    ],
};

describe('calculateProductionPlan', () => {
    it('rekent ingredient × headcount / yield correct', () => {
        const lines = calculateProductionPlan(sample);
        const pp = lines.find((l) => l.ingredient_naam === 'Procureur');
        /* 75 × 0.18 / 0.7 = 19.286 */
        expect(pp?.target_qty).toBeCloseTo(19.286, 2);
        expect(pp?.target_unit).toBe('kg');
        expect(pp?.qty_source).toBe('server_recipe');
    });

    it('default yield = 1 (geen verlies) als yield ontbreekt', () => {
        const lines = calculateProductionPlan(sample);
        const bol = lines.find((l) => l.ingredient_naam === 'Brioche-bol');
        /* 75 × 2 = 150 */
        expect(bol?.target_qty).toBe(150);
        expect(bol?.target_unit).toBe('st');
    });

    it('bouwt formule-string voor audit', () => {
        const lines = calculateProductionPlan(sample);
        const brisket = lines.find((l) => l.ingredient_naam === 'Brisket');
        expect(brisket?.formula).toMatch(/75 gasten/);
        expect(brisket?.formula).toMatch(/0\.22 kg\/p/);
        expect(brisket?.formula).toMatch(/0\.65 yield/);
    });

    it('returnt lege array bij 0 gasten', () => {
        expect(calculateProductionPlan({ ...sample, guests: 0 })).toEqual([]);
    });

    it('returnt lege array bij geen gerechten', () => {
        expect(calculateProductionPlan({ guests: 50, dishes: [] })).toEqual([]);
    });

    it('werpt bij negatieve gasten', () => {
        expect(() =>
            calculateProductionPlan({ ...sample, guests: -1 }),
        ).toThrow(/invalid guests/);
    });

    it('werpt bij yield > 1 (zou voorraad uit het niets toveren)', () => {
        expect(() =>
            calculateProductionPlan({
                guests: 10,
                dishes: [
                    {
                        gerecht_id: 'dish-99',
                        ingredients: [
                            { naam: 'X', qty_pp: 1, unit: 'kg', yield: 1.5 },
                        ],
                    },
                ],
            }),
        ).toThrow(/invalid yield/);
    });

    it('skipt ingredients zonder naam of zonder qty_pp', () => {
        const lines = calculateProductionPlan({
            guests: 50,
            dishes: [
                {
                    gerecht_id: 'dish-1',
                    ingredients: [
                        { naam: '', qty_pp: 1, unit: 'kg' },
                        { naam: 'Zout', qty_pp: 0, unit: 'g' },
                        { naam: 'Peper', qty_pp: 2, unit: 'g' },
                    ],
                },
            ],
        });
        expect(lines).toHaveLength(1);
        expect(lines[0].ingredient_naam).toBe('Peper');
    });

    it('rondt af op 3 decimalen', () => {
        const lines = calculateProductionPlan({
            guests: 13,
            dishes: [
                {
                    gerecht_id: 'dish-1',
                    ingredients: [{ naam: 'X', qty_pp: 0.123, unit: 'kg' }],
                },
            ],
        });
        /* 13 × 0.123 = 1.599 */
        expect(lines[0].target_qty).toBe(1.599);
    });

    it('schaalt naar 100 gasten voor mid-event headcount-update', () => {
        const lines = calculateProductionPlan({ ...sample, guests: 100 });
        const pp = lines.find((l) => l.ingredient_naam === 'Procureur');
        /* 100 × 0.18 / 0.7 = 25.714 */
        expect(pp?.target_qty).toBeCloseTo(25.714, 2);
    });

    it('qty_source is altijd "server_recipe" (hard rule)', () => {
        const lines = calculateProductionPlan(sample);
        for (const line of lines) {
            expect(line.qty_source).toBe('server_recipe');
        }
    });
});

describe('aggregateProductionLines', () => {
    it('telt zelfde ingredient over gerechten op (case-insensitive)', () => {
        const lines = calculateProductionPlan({
            guests: 50,
            dishes: [
                {
                    gerecht_id: 'dish-1',
                    ingredients: [{ naam: 'Brioche', qty_pp: 1, unit: 'st' }],
                },
                {
                    gerecht_id: 'dish-2',
                    ingredients: [{ naam: 'brioche', qty_pp: 1, unit: 'st' }],
                },
            ],
        });
        const agg = aggregateProductionLines(lines);
        const brioche = agg.get('brioche');
        expect(brioche?.target_qty).toBe(100);
        expect(brioche?.sources).toBe(2);
    });

    it('werpt bij unit-mismatch', () => {
        expect(() =>
            aggregateProductionLines([
                {
                    gerecht_id: 'dish-1',
                    ingredient_naam: 'Zout',
                    target_qty: 1,
                    target_unit: 'kg',
                    qty_source: 'server_recipe',
                    formula: 'x',
                },
                {
                    gerecht_id: 'dish-2',
                    ingredient_naam: 'Zout',
                    target_qty: 100,
                    target_unit: 'g',
                    qty_source: 'server_recipe',
                    formula: 'x',
                },
            ]),
        ).toThrow(/unit mismatch/);
    });

    it('returnt lege Map bij lege input', () => {
        expect(aggregateProductionLines([]).size).toBe(0);
    });
});
