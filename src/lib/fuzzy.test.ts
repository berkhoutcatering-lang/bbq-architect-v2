import { describe, it, expect } from 'vitest';
import { normalizeForFuzzy, trigrams, trigramSimilarity, fuzzyShingles } from './fuzzy';

describe('normalizeForFuzzy', () => {
    it('lowercuts en strippt accenten', () => {
        expect(normalizeForFuzzy('Crème Brûlée')).toBe('creme brulee');
    });
    it('houdt alleen a-z0-9 + enkele spaties over', () => {
        expect(normalizeForFuzzy('  Coppa-Ham, 100gr! ')).toBe('coppa ham 100gr');
    });
});

describe('trigrams', () => {
    it('padt per woord en maakt 3-grams', () => {
        const t = trigrams('kip');
        // "  kip " → "  k", " ki", "kip", "ip "
        expect(t.has('kip')).toBe(true);
        expect(t.has('  k')).toBe(true);
        expect(t.has('ip ')).toBe(true);
    });
    it('lege input → lege set', () => {
        expect(trigrams('   ').size).toBe(0);
    });
});

describe('trigramSimilarity', () => {
    it('identieke strings → 1', () => {
        expect(trigramSimilarity('komkommer', 'komkommer')).toBe(1);
    });
    it('typfout (ontbrekende letter) blijft ruim boven de drempel', () => {
        const s = trigramSimilarity('komkomer', 'komkommer');
        expect(s).toBeGreaterThan(0.5);
    });
    it('bidfoud → bidfood herkenbaar', () => {
        expect(trigramSimilarity('bidfoud', 'bidfood')).toBeGreaterThan(0.4);
    });
    it('accent-ongevoelig', () => {
        expect(trigramSimilarity('creme', 'crème')).toBe(1);
    });
    it('totaal andere woorden → laag', () => {
        expect(trigramSimilarity('komkommer', 'ribeye')).toBeLessThan(0.2);
    });
    it('lege string → 0', () => {
        expect(trigramSimilarity('', 'kip')).toBe(0);
    });
});

describe('fuzzyShingles', () => {
    it('maakt gededupliceerde 3-teken-shingles zonder spaties', () => {
        const sh = fuzzyShingles('komkomer');
        expect(sh).toContain('kom');
        expect(sh).toContain('omk');
        expect(sh.every(s => s.length === 3)).toBe(true);
        expect(new Set(sh).size).toBe(sh.length); // uniek
    });
    it('respecteert het maximum', () => {
        expect(fuzzyShingles('supercalifragilistic', 5).length).toBe(5);
    });
    it('korte term (2 tekens) → hele term als fallback', () => {
        expect(fuzzyShingles('ei')).toEqual(['ei']);
    });
    it('meerdere woorden: spaties tellen niet mee in shingles', () => {
        const sh = fuzzyShingles('brasvar coppa');
        expect(sh.some(s => s.includes(' '))).toBe(false);
    });
});
