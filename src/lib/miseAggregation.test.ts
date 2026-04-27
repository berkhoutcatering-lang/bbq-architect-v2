import { describe, it, expect } from 'vitest';
import { formatMiseQty, aggregateMiseFromDishes, type MiseSourceDish } from './miseAggregation';

describe('formatMiseQty', () => {
    it('kg < 1 → gram', () => {
        expect(formatMiseQty(0.25, 'kg')).toBe('250 g');
        expect(formatMiseQty(0.001, 'kg')).toBe('1 g');
    });

    it('kg >= 1 → kg met komma', () => {
        expect(formatMiseQty(1.5, 'kg')).toBe('1,5 kg');
        expect(formatMiseQty(12.345, 'kg')).toBe('12,35 kg');
    });

    it('g >= 1000 → kg', () => {
        expect(formatMiseQty(1500, 'g')).toBe('1,5 kg');
    });

    it('g < 1000 → afgerond', () => {
        expect(formatMiseQty(212.4, 'g')).toBe('212 g');
        expect(formatMiseQty(0.5, 'g')).toBe('1 g'); /* round(0.5) = 1 */
    });

    it('L < 1 → ml', () => {
        expect(formatMiseQty(0.3, 'L')).toBe('300 ml');
    });

    it('L >= 1 → L', () => {
        expect(formatMiseQty(1.2, 'L')).toBe('1,2 L');
    });

    it('ml >= 1000 → L', () => {
        expect(formatMiseQty(2500, 'ml')).toBe('2,5 L');
    });

    it('stuks / overige units doorgegeven met afronding omhoog', () => {
        expect(formatMiseQty(4, 'stuks')).toBe('4 stuks');
        expect(formatMiseQty(3.2, 'stuks')).toBe('4 stuks'); /* ceil */
        expect(formatMiseQty(2, 'pak')).toBe('2 pak');
    });

    it('amount <= 0 → lege string', () => {
        expect(formatMiseQty(0, 'kg')).toBe('');
        expect(formatMiseQty(-5, 'kg')).toBe('');
    });

    it('case-insensitief unit', () => {
        expect(formatMiseQty(1.5, 'KG')).toBe('1,5 kg');
        expect(formatMiseQty(0.3, 'L')).toBe('300 ml');
    });
});

describe('aggregateMiseFromDishes', () => {
    const gerechten: MiseSourceDish[] = [
        {
            naam: 'Bavette',
            ingredient_costs: [
                { naam: 'Bavette', qty_pp: 0.18, unit: 'kg', yield: 0.85 },
                { naam: 'Chimichurri', qty_pp: 30, unit: 'g', yield: 1 },
            ],
        },
        {
            naam: 'Pulled Pork',
            ingredient_costs: [
                { naam: 'Pulled pork', qty_pp: 0.15, unit: 'kg', yield: 0.7 },
                { naam: 'Coleslaw', qty_pp: 80, unit: 'g', yield: 1 },
            ],
        },
        {
            naam: 'Vega bowl',
            ingredient_costs: [], /* lege array */
        },
        {
            naam: 'Bites combo',
            /* JSON-string variant — moet ook geparsed worden */
            ingredient_costs: '[{"naam":"Pani puri schelpjes","qty_pp":4,"unit":"stuks","yield":1}]',
        },
    ];

    it('aggregeert ingredient_costs over één dish', () => {
        const r = aggregateMiseFromDishes(['Bavette'], gerechten, 100);
        expect(r).toHaveLength(2);
        /* Bavette: 0.18 / 0.85 × 100 = 21.18 kg → "21,18 kg"
           Chimichurri: 30 / 1 × 100 = 3000g → "3 kg" */
        const bavette = r.find(x => x.item === 'Bavette');
        const chimi = r.find(x => x.item === 'Chimichurri');
        expect(bavette?.qty).toMatch(/21,1[78] kg/);
        expect(chimi?.qty).toBe('3 kg');
    });

    it('telt zelfde ingredient over meerdere dishes op', () => {
        const dishes = ['Bavette', 'Bavette']; /* dubbel zelfde dish */
        const r = aggregateMiseFromDishes(dishes, gerechten, 50);
        const bavette = r.find(x => x.item === 'Bavette');
        /* 2 × 0.18 / 0.85 × 50 = ~21.18 kg */
        expect(bavette?.qty).toMatch(/21,1[78] kg/);
    });

    it('parsed JSON-string ingredient_costs (legacy data)', () => {
        const r = aggregateMiseFromDishes(['Bites combo'], gerechten, 25);
        expect(r).toHaveLength(1);
        expect(r[0].item).toBe('Pani puri schelpjes');
        /* 4 stuks × 25 = 100 stuks */
        expect(r[0].qty).toBe('100 stuks');
    });

    it('retourneert lege lijst bij guests=0', () => {
        expect(aggregateMiseFromDishes(['Bavette'], gerechten, 0)).toEqual([]);
    });

    it('retourneert lege lijst bij dishes=[]', () => {
        expect(aggregateMiseFromDishes([], gerechten, 50)).toEqual([]);
    });

    it('skip onbekende dish-namen silent', () => {
        const r = aggregateMiseFromDishes(['Onbekend Gerecht'], gerechten, 50);
        expect(r).toEqual([]);
    });

    it('skip dish met lege ingredient_costs', () => {
        expect(aggregateMiseFromDishes(['Vega bowl'], gerechten, 50)).toEqual([]);
    });

    it('case-insensitief dish-name lookup', () => {
        const r = aggregateMiseFromDishes(['  bavette  '], gerechten, 1);
        expect(r.length).toBeGreaterThan(0);
    });

    it('mengeenheden voor zelfde ingredient blijven gescheiden', () => {
        const dual: MiseSourceDish[] = [
            { naam: 'A', ingredient_costs: [{ naam: 'Tomaat', qty_pp: 0.1, unit: 'kg' }] },
            { naam: 'B', ingredient_costs: [{ naam: 'Tomaat', qty_pp: 50, unit: 'g' }] },
        ];
        const r = aggregateMiseFromDishes(['A', 'B'], dual, 10);
        /* 2 entries omdat units verschillen — niet te mixen zonder conversie. */
        expect(r).toHaveLength(2);
    });

    it('output gesorteerd op naam', () => {
        const r = aggregateMiseFromDishes(['Bavette'], gerechten, 100);
        const items = r.map(x => x.item);
        expect(items).toEqual([...items].sort((a, b) => a.localeCompare(b)));
    });

    it('default yield = 1 als niet opgegeven', () => {
        const noYield: MiseSourceDish[] = [
            { naam: 'X', ingredient_costs: [{ naam: 'Brood', qty_pp: 0.5, unit: 'kg' }] },
        ];
        const r = aggregateMiseFromDishes(['X'], noYield, 10);
        /* 0.5 / 1 × 10 = 5 kg */
        expect(r[0].qty).toBe('5 kg');
    });
});
