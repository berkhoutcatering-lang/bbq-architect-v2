import { describe, it, expect } from 'vitest';
import { normalizeForFuzzy, trigrams, trigramSimilarity, tokenSetSimilarity, fuzzyShingles } from './fuzzy';

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

describe('tokenSetSimilarity', () => {
    const FUZZY_MIN = 0.35; // moet gelijk lopen met de route-drempel

    it('korte tikfout matcht het juiste woord in een lange naam', () => {
        // "copa" vs "Coppa Stagionata, stuk 650 gram" — hele-zin-Jaccard zou hier
        // zakken; woord-bewust pakt het woord "coppa".
        const s = tokenSetSimilarity('copa', 'Coppa Stagionata, stuk 650 gram');
        expect(s).toBeGreaterThan(FUZZY_MIN);
    });
    it('komkomer vindt Komkommer, ook in een lange Bidfood-naam', () => {
        expect(tokenSetSimilarity('komkomer', 'Komkommer julienne 3 mm, bak 1 kg')).toBeGreaterThan(FUZZY_MIN);
    });
    it('meerdere getypte woorden: allemaal moeten ergens op lijken', () => {
        expect(tokenSetSimilarity('brasfar coppa', 'Brasvar varkens coppa BE')).toBeGreaterThan(FUZZY_MIN);
    });
    it('een niet-passend woord trekt de score omlaag (zwakste schakel)', () => {
        // "bidfoud" (leverancier, niet in de productnaam) → onder de drempel.
        expect(tokenSetSimilarity('bidfoud coppa', 'Coppa Stagionata, stuk 650 gram')).toBeLessThan(FUZZY_MIN);
    });
    it('exacte woord-match → 1', () => {
        expect(tokenSetSimilarity('coppa', 'Coppa Stagionata')).toBe(1);
    });
    it('totaal anders → laag', () => {
        expect(tokenSetSimilarity('ribeye', 'Komkommer julienne')).toBeLessThan(FUZZY_MIN);
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

/* Nederlandse samenstellingen. Sam schrijft zoals een kok praat: "salsa" voor
   "Tomatensalsa", "gehakt" voor "Rundergehakt". Met alleen Jaccard viel dat onder
   de drempel (het lengteverschil straft te hard), waardoor producten die er
   letterlijk staan onvindbaar waren. Containment vangt dat op. */
describe('samenstellingen (containment)', () => {
    const FUZZY_MIN = 0.35; // moet gelijk lopen met de route-drempel
    it('deel van een samenstelling haalt de drempel', () => {
        expect(trigramSimilarity('salsa', 'tomatensalsa')).toBeGreaterThanOrEqual(FUZZY_MIN);
        expect(trigramSimilarity('gehakt', 'rundergehakt')).toBeGreaterThanOrEqual(FUZZY_MIN);
        expect(trigramSimilarity('worst', 'braadworst')).toBeGreaterThanOrEqual(FUZZY_MIN);
    });
    it('tokenSetSimilarity vindt het losse woord in de samenstelling', () => {
        expect(tokenSetSimilarity('salsa', 'Tomatensalsa, bak 1 kg')).toBeGreaterThanOrEqual(FUZZY_MIN);
    });
    it('maakt niet ineens alles gelijk — losse fragmenten blijven laag', () => {
        expect(trigramSimilarity('ribeye', 'Komkommer julienne')).toBeLessThan(FUZZY_MIN);
        expect(trigramSimilarity('zalm', 'Runderbrisket')).toBeLessThan(FUZZY_MIN);
    });
    it('blijft symmetrisch', () => {
        expect(trigramSimilarity('salsa', 'tomatensalsa'))
            .toBeCloseTo(trigramSimilarity('tomatensalsa', 'salsa'), 10);
    });
});
