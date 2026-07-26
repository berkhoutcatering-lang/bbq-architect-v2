import { describe, it, expect } from 'vitest';
import {
    normalizeIngredientName,
    nameScore,
    pickBestMatch,
    confidenceFromScore,
    isTailOnlyMatch,
    toBaseUnit,
    lineCostCents,
    type CostCandidate,
} from './recipeMatch';

describe('normalizeIngredientName', () => {
    it('haalt accenten, hoofdletters en leestekens weg', () => {
        expect(normalizeIngredientName('Crème Fraîche (biologisch)')).toBe('creme fraiche biologisch');
    });
    it('collapse dubbele spaties', () => {
        expect(normalizeIngredientName('  roomboter   ongezouten ')).toBe('roomboter ongezouten');
    });
});

describe('nameScore', () => {
    it('exacte match = 1', () => {
        expect(nameScore('roomboter', 'roomboter')).toBe(1);
    });
    it('ingrediënt volledig gedekt door langere kandidaat scoort hoog', () => {
        // "roomboter" zit in "Bidfood Roomboter ongezouten 250 g"
        expect(nameScore('roomboter', 'Bidfood Roomboter ongezouten 250 g')).toBeGreaterThan(0.7);
    });
    it('stopwoorden tellen niet mee (verse tijm ↔ tijm)', () => {
        expect(nameScore('verse tijm', 'tijm')).toBe(1);
    });
    it('geen overlap = 0', () => {
        expect(nameScore('zalmfilet', 'chocolade')).toBe(0);
    });
    it('substring-redding bij nul token-overlap', () => {
        // tokens verschillen maar hele string zit erin
        expect(nameScore('pastrami', 'huisgemaakte pastrami plakjes')).toBeGreaterThanOrEqual(0.6);
    });
});

describe('confidenceFromScore', () => {
    it('drempels kloppen', () => {
        expect(confidenceFromScore(0.9)).toBe('hoog');
        expect(confidenceFromScore(0.6)).toBe('middel');
        expect(confidenceFromScore(0.3)).toBe('laag');
    });
});

describe('isTailOnlyMatch — smaak-toevoeging vs het product zelf', () => {
    it('zeezout achteraan in een knäckebröd = staart-match', () => {
        // Echt voorval (2026-07-26): "zeezout fijn" matchte hierop met "hoog".
        expect(isTailOnlyMatch('zeezout fijn', 'Knäckebröd meergranen zeezout')).toBe(true);
    });
    it('hoofdwoord achter een merknaam is géén staart-match', () => {
        expect(isTailOnlyMatch('roomboter', 'Bidfood Roomboter ongezouten 250 g')).toBe(false);
    });
    it('hoofdwoord vooraan is géén staart-match', () => {
        expect(isTailOnlyMatch('pastrami', 'Pastrami plakjes huisgemaakt')).toBe(false);
    });
    it('korte namen worden niet beoordeeld', () => {
        expect(isTailOnlyMatch('tijm', 'verse tijm')).toBe(false);
    });
    it('geen enkele overlap → geen staart-match (score vangt dat al af)', () => {
        expect(isTailOnlyMatch('zalm', 'Knäckebröd meergranen zeezout')).toBe(false);
    });
});

describe('pickBestMatch', () => {
    const cands: CostCandidate[] = [
        { source: 'supplier', ref_id: 1, name: 'Bidfood Roomboter ongezouten 250 g', centsPerBaseUnit: 1, baseUnit: 'g' },
        { source: 'component', ref_id: 2, name: 'Roomboter', centsPerBaseUnit: 1, baseUnit: 'g' },
        { source: 'inventory', ref_id: 3, name: 'Roomboter ongezouten', centsPerBaseUnit: 1, baseUnit: 'g' },
    ];
    it('bij gelijke score wint de bron-prioriteit (component > inventory > supplier)', () => {
        const r = pickBestMatch('roomboter', cands);
        expect(r?.candidate.source).toBe('component');
    });
    it('onder de floor → null (liever geen match dan een gok)', () => {
        const r = pickBestMatch('sojasaus', cands);
        expect(r).toBeNull();
    });
});

describe('toBaseUnit', () => {
    it('kg → g met factor 1000', () => {
        expect(toBaseUnit('kg')).toEqual({ base: 'g', factor: 1000 });
    });
    it('liter → ml met factor 1000', () => {
        expect(toBaseUnit('liter')).toEqual({ base: 'ml', factor: 1000 });
    });
    it('onbekende eenheid → null', () => {
        expect(toBaseUnit('snufje')).toBeNull();
    });
});

describe('lineCostCents', () => {
    const perGram: Pick<CostCandidate, 'centsPerBaseUnit' | 'baseUnit'> = { centsPerBaseUnit: 1.25, baseUnit: 'g' };
    it('200 g × 1,25 ct/g = 250 ct', () => {
        expect(lineCostCents(200, 'g', perGram)).toBe(250);
    });
    it('0,2 kg × 1,25 ct/g = 250 ct (kg→g conversie)', () => {
        expect(lineCostCents(0.2, 'kg', perGram)).toBe(250);
    });
    it('onvergelijkbare eenheden (g-ingrediënt, per-stuk-prijs) → null', () => {
        expect(lineCostCents(200, 'g', { centsPerBaseUnit: 50, baseUnit: 'stuk' })).toBeNull();
    });
    it('per stuk × aantal', () => {
        expect(lineCostCents(3, 'stuks', { centsPerBaseUnit: 40, baseUnit: 'stuk' })).toBe(120);
    });
    it('qty 0 → 0 cent', () => {
        expect(lineCostCents(0, 'g', perGram)).toBe(0);
    });
});
