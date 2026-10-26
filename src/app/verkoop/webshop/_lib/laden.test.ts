import { describe, expect, it } from 'vitest';
import { dagenTerug, inStukken, ontbrekend, samenvoegen } from './laden';

describe('laden — ook vroege orders voor een latere dag', () => {
    it('inStukken knipt op de grootte', () => {
        expect(inStukken([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
        expect(inStukken([], 2)).toEqual([]);
    });
    it('ontbrekend geeft alleen nieuwe id\'s, één keer', () => {
        expect(ontbrekend([3, 1, 3, 7], [{ id: 1 }, { id: 2 }])).toEqual([3, 7]);
    });
    it('samenvoegen: geen dubbele, nieuwste eerst', () => {
        const a = [{ id: 2, created_at: '2026-12-01T10:00:00Z', bron: 'recent' }];
        const b = [{ id: 2, created_at: '2026-12-01T10:00:00Z', bron: 'open' }, { id: 1, created_at: '2026-10-05T09:00:00Z', bron: 'open' }];
        expect(samenvoegen(a, b).map((o) => `${o.id}:${o.bron}`)).toEqual(['2:recent', '1:open']);
    });
    it('dagenTerug over een maandgrens', () => {
        expect(dagenTerug('2026-12-03', 7)).toBe('2026-11-26');
    });
});
