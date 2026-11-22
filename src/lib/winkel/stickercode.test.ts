import { describe, expect, it } from 'vitest';
import { stickerCodeGeldig, stickerControlecijfer } from './stickercode';

describe('stickerCodeGeldig', () => {
    it('echte stickers van de Toonbank kloppen', () => {
        for (const c of ['2900002003040156226121001089', '2900008001880166426112901074', '2900008002300166426112901045']) {
            expect(stickerCodeGeldig(c)).toBe(true);
        }
    });

    it('een ander laatste cijfer, een prijscode of een te korte code niet', () => {
        expect(stickerCodeGeldig('2900002003040156226121001088')).toBe(false);
        expect(stickerCodeGeldig('2101015028237')).toBe(false);
        expect(stickerCodeGeldig('290000200304015622612100108')).toBe(false);
    });

    it('het controlecijfer van de eerste 27 cijfers', () => {
        expect(stickerControlecijfer('290000200304015622612100108')).toBe(9);
    });
});
