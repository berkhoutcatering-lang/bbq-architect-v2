import { describe, expect, it } from 'vitest';
import { controleerEtiket, leesAllergenen, leesIngredienten, prijsUitGewicht } from './opGewicht';

describe('prijsUitGewicht (zelfde regel als de Toonbank: hele centen, halve cent omhoog)', () => {
    it('het voorbeeld uit het contract: 412 g × € 24,95 = € 10,28', () => {
        expect(prijsUitGewicht(412, 2495)).toBe(1028);
    });
    it('precies een halve cent gaat omhoog', () => {
        // 100 g × 5 ct/kg = 0,5 ct
        expect(prijsUitGewicht(100, 5)).toBe(1);
        // 300 g × 1995 ct/kg = 598,5 ct
        expect(prijsUitGewicht(300, 1995)).toBe(599);
    });
    it('net onder de helft gaat omlaag', () => {
        // 412 g × 1001 ct/kg = 412,412 ct
        expect(prijsUitGewicht(412, 1001)).toBe(412);
        // 299 g × 5 ct/kg = 1,495 ct
        expect(prijsUitGewicht(299, 5)).toBe(1);
        // 401 g × 1 ct/kg = 0,401 ct
        expect(prijsUitGewicht(401, 1)).toBe(0);
    });
    it('geen zwevende-kommafout bij grote getallen', () => {
        expect(prijsUitGewicht(15000, 99999)).toBe(1499985);
    });
    it('weigert onzin in plaats van te gokken', () => {
        expect(() => prijsUitGewicht(0, 2495)).toThrow();
        expect(() => prijsUitGewicht(412.5, 2495)).toThrow();
        expect(() => prijsUitGewicht(412, -1)).toThrow();
    });
});

describe('leesIngredienten', () => {
    it('splitst op komma, maar niet binnen haakjes', () => {
        expect(leesIngredienten('*Melk*, zout, kaascultuur (*melk*, zuursel), stremsel'))
            .toEqual(['*Melk*', 'zout', 'kaascultuur (*melk*, zuursel)', 'stremsel']);
    });
    it('leeg is een lege lijst', () => {
        expect(leesIngredienten('  ')).toEqual([]);
    });
});

describe('leesAllergenen', () => {
    it('kleine letters, zonder dubbele', () => {
        expect(leesAllergenen('Melk, melk,  Ei\nnoten')).toEqual(['melk', 'ei', 'noten']);
    });
});

describe('controleerEtiket', () => {
    it('een kaas zonder allergenen kan niet', () => {
        expect(controleerEtiket({ type: 'kaas', ingredienten: [], allergenen: [] })).toMatch(/allergenen/);
    });
    it('een kaas met alleen allergenen mag (de sticker zegt dan "Bevat:")', () => {
        expect(controleerEtiket({ type: 'kaas', ingredienten: [], allergenen: ['melk'] })).toBeNull();
    });
    it('vlees zonder allergenen mag', () => {
        expect(controleerEtiket({ type: 'vleeswaar', ingredienten: [], allergenen: [] })).toBeNull();
    });
    it('elk allergeen staat tussen sterretjes in de ingrediënten', () => {
        expect(controleerEtiket({ type: 'kaas', ingredienten: ['melk', 'zout'], allergenen: ['melk'] })).toMatch(/\*melk\*/);
        expect(controleerEtiket({ type: 'kaas', ingredienten: ['*Koemelk*', 'zout'], allergenen: ['melk'] })).toBeNull();
    });
    it('iets tussen sterretjes moet ook bij de allergenen staan', () => {
        expect(controleerEtiket({ type: 'kaas', ingredienten: ['*melk*', '*mosterd*'], allergenen: ['melk'] })).toMatch(/mosterd/);
    });
    it('een sterretje zonder partner kan niet', () => {
        expect(controleerEtiket({ type: 'kaas', ingredienten: ['*melk', 'zout'], allergenen: ['melk'] })).toMatch(/sterretje/);
    });
    it('te lang voor de sticker kan niet', () => {
        expect(controleerEtiket({ type: 'kaas', ingredienten: ['*melk*', 'x'.repeat(400)], allergenen: ['melk'] })).toMatch(/te lang/);
    });
});
