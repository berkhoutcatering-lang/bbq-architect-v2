import { describe, expect, it } from 'vitest';
import { bruikbareBreedtes, check, uitsnede } from './fotoverwerking';

describe('fotoverwerking', () => {
    it('een studiofoto van 1024 × 1536 is goed', () => {
        expect(check(1024, 1536).waarschuwing).toBeNull();
        expect(uitsnede(1024, 1536)).toEqual({ x: 0, y: 0, w: 1024, h: 1536 });
        expect(bruikbareBreedtes(1024)).toEqual([640, 960, 1024]);
    });
    it('een vierkante foto wordt in het midden 2 : 3 gesneden', () => {
        expect(check(1200, 1200).waarschuwing).toMatch(/bijgesneden/);
        expect(uitsnede(1200, 1200)).toEqual({ x: 200, y: 0, w: 800, h: 1200 });
    });
    it('een te hoge foto verliest boven en onder', () => {
        expect(uitsnede(1000, 2000)).toEqual({ x: 0, y: 250, w: 1000, h: 1500 });
    });
    it('nooit opschalen; een kleine foto waarschuwt', () => {
        expect(bruikbareBreedtes(800)).toEqual([640]);
        expect(bruikbareBreedtes(500)).toEqual([500]);
        expect(check(500, 750).waarschuwing).toMatch(/te klein/);
    });
});
