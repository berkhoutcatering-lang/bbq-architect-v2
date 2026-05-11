import { describe, it, expect } from 'vitest';
import {
    ALLERGEN_META,
    ALL_ALLERGENS,
    highestSeverity,
    primaryAllergen,
    isAllergen,
    sanitizeAllergens,
} from './allergens';

describe('ALLERGEN_META — EU-14 compleet', () => {
    it('heeft exact 14 allergenen', () => {
        expect(ALL_ALLERGENS).toHaveLength(14);
    });
    it('alle keys hebben matchende code', () => {
        for (const [key, meta] of Object.entries(ALLERGEN_META)) {
            expect(meta.code).toBe(key);
        }
    });
    it('iedere allergeen heeft label, badge, color, icon', () => {
        for (const m of ALL_ALLERGENS) {
            expect(m.label.length).toBeGreaterThan(0);
            expect(m.badge.length).toBeGreaterThan(0);
            expect(m.badge.length).toBeLessThanOrEqual(3);
            expect(m.color.length).toBeGreaterThan(0);
            expect(m.icon.length).toBeGreaterThan(0);
            expect(['normal', 'high', 'critical']).toContain(m.severityDefault);
        }
    });
    it('anafylaxie-risico allergenen zijn critical', () => {
        expect(ALLERGEN_META.noten.severityDefault).toBe('critical');
        expect(ALLERGEN_META.pinda.severityDefault).toBe('critical');
        expect(ALLERGEN_META.schaaldieren.severityDefault).toBe('critical');
    });
});

describe('highestSeverity', () => {
    it('returnt normal voor leeg lijst', () => {
        expect(highestSeverity([])).toBe('normal');
    });
    it('returnt critical bij ≥1 critical allergeen', () => {
        expect(highestSeverity(['gluten', 'noten'])).toBe('critical');
    });
    it('returnt high bij high-only allergenen', () => {
        expect(highestSeverity(['gluten', 'lactose'])).toBe('high');
    });
    it('returnt normal bij alleen normal-severity', () => {
        expect(highestSeverity(['soja', 'mosterd'])).toBe('normal');
    });
});

describe('primaryAllergen', () => {
    it('returnt null voor leeg', () => {
        expect(primaryAllergen([])).toBeNull();
    });
    it('returnt critical boven high', () => {
        expect(primaryAllergen(['gluten', 'noten'])).toBe('noten');
    });
    it('returnt high boven normal', () => {
        expect(primaryAllergen(['mosterd', 'gluten'])).toBe('gluten');
    });
});

describe('isAllergen + sanitizeAllergens', () => {
    it('isAllergen accepteert geldige code', () => {
        expect(isAllergen('gluten')).toBe(true);
        expect(isAllergen('noten')).toBe(true);
    });
    it('isAllergen weigert onbekende string', () => {
        expect(isAllergen('vlees')).toBe(false);
        expect(isAllergen('NOTEN')).toBe(false); // case sensitive
        expect(isAllergen(123)).toBe(false);
    });
    it('sanitizeAllergens filtert + dedupes', () => {
        const r = sanitizeAllergens(['gluten', 'noten', 'noten', 'onbekend', 42, '', null]);
        expect(r).toEqual(['gluten', 'noten']);
    });
});
