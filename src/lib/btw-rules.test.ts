import { describe, it, expect } from 'vitest';
import {
    BTW_RULES_2026,
    getBtwRate,
    getBtwPct,
    validateBtwPct,
    categoryFromLegacyPct,
    type BtwCategory,
} from './btw-rules';

describe('BTW_RULES_2026 lookup-tabel', () => {
    it('bevat alle 10 categorieën', () => {
        expect(BTW_RULES_2026.length).toBe(10);
    });

    it('food_catering = 9%', () => {
        const rule = BTW_RULES_2026.find(r => r.category === 'food_catering');
        expect(rule?.rate).toBe(0.09);
        expect(rule?.rate_pct).toBe(9);
    });

    it('alcohol = 21%', () => {
        const rule = BTW_RULES_2026.find(r => r.category === 'alcohol');
        expect(rule?.rate).toBe(0.21);
        expect(rule?.rate_pct).toBe(21);
    });

    it('b2b_intra_eu_reverse = 0%', () => {
        const rule = BTW_RULES_2026.find(r => r.category === 'b2b_intra_eu_reverse');
        expect(rule?.rate).toBe(0);
        expect(rule?.rate_pct).toBe(0);
    });

    it('elk record heeft consistente rate + rate_pct', () => {
        for (const rule of BTW_RULES_2026) {
            expect(rule.rate_pct).toBe(Math.round(rule.rate * 100));
        }
    });

    it('elke categorie heeft label', () => {
        for (const rule of BTW_RULES_2026) {
            expect(rule.label.length).toBeGreaterThan(0);
        }
    });
});

describe('getBtwRate', () => {
    it('returnt decimaal tarief voor bekende categorie', () => {
        expect(getBtwRate('food_catering')).toBe(0.09);
        expect(getBtwRate('service_personnel')).toBe(0.21);
        expect(getBtwRate('export_non_eu')).toBe(0);
    });

    it('throwt bij onbekende categorie', () => {
        expect(() => getBtwRate('food_lasertag' as BtwCategory)).toThrow();
    });
});

describe('getBtwPct', () => {
    it('returnt geheel percentage', () => {
        expect(getBtwPct('food_catering')).toBe(9);
        expect(getBtwPct('alcohol')).toBe(21);
        expect(getBtwPct('exempt')).toBe(0);
    });

    it('throwt bij onbekende categorie', () => {
        expect(() => getBtwPct('niet_bestaand' as BtwCategory)).toThrow();
    });
});

describe('validateBtwPct', () => {
    it('snap naar 0 voor waardes <5', () => {
        expect(validateBtwPct(0)).toBe(0);
        expect(validateBtwPct(1)).toBe(0);
        expect(validateBtwPct(3)).toBe(0);
        expect(validateBtwPct(4.99)).toBe(0);
    });

    it('snap naar 9 voor waardes 5-14', () => {
        expect(validateBtwPct(5)).toBe(9);
        expect(validateBtwPct(8.5)).toBe(9);
        expect(validateBtwPct(9)).toBe(9);
        expect(validateBtwPct(14.99)).toBe(9);
    });

    it('snap naar 21 voor waardes ≥15', () => {
        expect(validateBtwPct(15)).toBe(21);
        expect(validateBtwPct(21)).toBe(21);
        expect(validateBtwPct(22)).toBe(21);
        expect(validateBtwPct(50)).toBe(21);
    });

    it('handelt negatieve / non-numerieke waardes af', () => {
        expect(validateBtwPct(-5)).toBe(0);
        expect(validateBtwPct(NaN)).toBe(0);
        expect(validateBtwPct(undefined)).toBe(0);
        expect(validateBtwPct(null)).toBe(0);
        expect(validateBtwPct('abc')).toBe(0);
    });

    it('parsed string-numbers', () => {
        expect(validateBtwPct('9')).toBe(9);
        expect(validateBtwPct('21')).toBe(21);
        expect(validateBtwPct('3')).toBe(0);
    });

    it('regression check — PR #76 had drempel <=0 (3 → 9). Nu fix.', () => {
        // Test die PR #76 in CI rood maakte:
        // expected 9 to be 0. Nu moet hij 0 zijn.
        expect(validateBtwPct(3)).toBe(0);
    });
});

describe('categoryFromLegacyPct', () => {
    it('0 → exempt', () => {
        expect(categoryFromLegacyPct(0)).toBe('exempt');
    });

    it('9 → food_catering', () => {
        expect(categoryFromLegacyPct(9)).toBe('food_catering');
        expect(categoryFromLegacyPct(9, 'food')).toBe('food_catering');
    });

    it('21 default → service_personnel', () => {
        expect(categoryFromLegacyPct(21)).toBe('service_personnel');
    });

    it('21 met hint=rental → equipment_rental', () => {
        expect(categoryFromLegacyPct(21, 'rental')).toBe('equipment_rental');
    });

    it('21 met hint=service → service_personnel', () => {
        expect(categoryFromLegacyPct(21, 'service')).toBe('service_personnel');
    });

    it('throwt bij onbekend percentage', () => {
        expect(() => categoryFromLegacyPct(13)).toThrow();
        expect(() => categoryFromLegacyPct(99)).toThrow();
    });
});
