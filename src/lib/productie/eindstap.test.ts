import { describe, expect, it } from 'vitest';
import { bepaalEindstap, isEindstap, type EindstapStap, type EindstapTaak } from './eindstap';

const STAPPEN: EindstapStap[] = [
    { id: 's-pekel', hangtAfVanStapId: null },
    { id: 's-rub', hangtAfVanStapId: 's-pekel' },
    { id: 's-smoke', hangtAfVanStapId: 's-rub' },
    { id: 's-pull', hangtAfVanStapId: 's-smoke' },
];
const TAKEN: EindstapTaak[] = [
    { id: 1, componentId: 7, eventId: 100, recipeStepId: 's-pekel', volgorde: 1 },
    { id: 2, componentId: 7, eventId: 100, recipeStepId: 's-rub', volgorde: 2 },
    { id: 3, componentId: 7, eventId: 100, recipeStepId: 's-smoke', volgorde: 3 },
    { id: 4, componentId: 7, eventId: 100, recipeStepId: 's-pull', volgorde: 4 },
    { id: 5, componentId: 8, eventId: 100, recipeStepId: null, volgorde: 1 },
    { id: 6, componentId: null, eventId: 100, recipeStepId: null, volgorde: 1 },
];

describe('eindstap', () => {
    it('pulled pork: alleen "pullen" is de eindstap', () => {
        expect(bepaalEindstap(TAKEN, STAPPEN).map((t) => t.id)).toEqual([4, 5]);
        expect(isEindstap(TAKEN[0], TAKEN, STAPPEN)).toBe(false);
        expect(isEindstap(TAKEN[2], TAKEN, STAPPEN)).toBe(false);
    });
    it('een taak zonder component is nooit productie', () => {
        expect(isEindstap(TAKEN[5], TAKEN, STAPPEN)).toBe(false);
    });
    it('zonder stappen wint de laatst ingeplande taak van het component', () => {
        const los: EindstapTaak[] = [
            { id: 10, componentId: 9, eventId: 1, recipeStepId: null, volgorde: '2026-09-16T08:00' },
            { id: 11, componentId: 9, eventId: 1, recipeStepId: null, volgorde: '2026-09-16T11:00' },
        ];
        expect(bepaalEindstap(los, []).map((t) => t.id)).toEqual([11]);
    });
    it('zelfde component in een ander event heeft zijn eigen eindstap', () => {
        const meer = [...TAKEN, { id: 20, componentId: 7, eventId: 200, recipeStepId: 's-pull', volgorde: 4 }];
        expect(bepaalEindstap(meer, STAPPEN).map((t) => t.id)).toEqual([4, 5, 20]);
    });
});

import { eindstapIds } from './eindstap';

describe('eindstapIds (op taak-afhankelijkheden)', () => {
    it('keten pekel → rub → smoke → pull: alleen pull', () => {
        const ids = eindstapIds([
            { id: 1, componentId: 7, eventId: 1, hangtAfVan: [] },
            { id: 2, componentId: 7, eventId: 1, hangtAfVan: [1] },
            { id: 3, componentId: 7, eventId: 1, hangtAfVan: [2] },
            { id: 4, componentId: 7, eventId: 1, hangtAfVan: [3] },
            { id: 5, componentId: 8, eventId: 1, hangtAfVan: [] },
            { id: 6, componentId: null, eventId: 1, hangtAfVan: [] },
        ]);
        expect([...ids].sort()).toEqual([4, 5]);
    });
    it('geen afhankelijkheden: de laatst geplande', () => {
        const ids = eindstapIds([
            { id: 1, componentId: 7, eventId: 1, hangtAfVan: [], geplandOp: '2026-09-16T08:00' },
            { id: 2, componentId: 7, eventId: 1, hangtAfVan: [], geplandOp: '2026-09-16T12:00' },
        ]);
        expect([...ids]).toEqual([2]);
    });
});
