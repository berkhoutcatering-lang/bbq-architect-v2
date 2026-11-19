import { describe, expect, it } from 'vitest';
import { krijgtStreepjescode, productenOpKassa, volgendeNa } from './streepjescodes';

describe('krijgtStreepjescode', () => {
    const los = { actief: true, eenheid: 'stuk', binnen_per_sticker: false, prijscode_nr: null };
    it('losse actieve producten wel', () => {
        expect(krijgtStreepjescode(los)).toBe(true);
    });
    it('niet op gewicht, niet met een prijssticker van de slager, niet uit', () => {
        expect(krijgtStreepjescode({ ...los, eenheid: 'gram' })).toBe(false);
        expect(krijgtStreepjescode({ ...los, binnen_per_sticker: true })).toBe(false);
        expect(krijgtStreepjescode({ ...los, prijscode_nr: '01015' })).toBe(false);
        expect(krijgtStreepjescode({ ...los, actief: false })).toBe(false);
    });
});

describe('productenOpKassa', () => {
    const art = (id: string, kanalen: string[], prijs: number | null = 295) => ({ id, kanalen, prijs_cents: prijs });
    it('alleen een artikel op de Toonbank met een prijs en precies één onderdeel van 1 stuk', () => {
        const artikelen = [
            art('a-los', ['webshop', 'toonbank']),
            art('a-webshop', ['webshop']),
            art('a-geen-prijs', ['toonbank'], null),
            art('a-pakket', ['toonbank']),
            art('a-zes', ['toonbank']),
        ];
        const slots = [
            { artikel_id: 'a-los', standaard_product_id: 'p1', hoeveelheid: '1' },
            { artikel_id: 'a-webshop', standaard_product_id: 'p2', hoeveelheid: 1 },
            { artikel_id: 'a-geen-prijs', standaard_product_id: 'p3', hoeveelheid: 1 },
            { artikel_id: 'a-pakket', standaard_product_id: 'p4', hoeveelheid: 1 },
            { artikel_id: 'a-pakket', standaard_product_id: 'p5', hoeveelheid: 1 },
            { artikel_id: 'a-zes', standaard_product_id: 'p6', hoeveelheid: 6 },
        ];
        expect([...productenOpKassa(artikelen, slots)]).toEqual(['p1']);
    });
});

describe('volgendeNa', () => {
    const lijst = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    it('springt naar het volgende product', () => {
        expect(volgendeNa(lijst, 'a')).toBe('b');
    });
    it('slaat over wat al een code heeft', () => {
        expect(volgendeNa(lijst, 'a', new Set(['b']))).toBe('c');
    });
    it('null na het laatste, of bij een onbekend product', () => {
        expect(volgendeNa(lijst, 'c')).toBeNull();
        expect(volgendeNa(lijst, 'x')).toBeNull();
    });
});
