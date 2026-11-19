import { describe, expect, it } from 'vitest';
import { datumKort, datumVoluit, maandNaam, maandRooster, maandVan, vandaagIso, verschuifMaand } from './datumKiezer';

describe('maandRooster', () => {
    it('november 2026 begint op zondag: de week begint op maandag 26 oktober', () => {
        const r = maandRooster(2026, 10);
        expect(r[0][0]).toEqual({ iso: '2026-10-26', dag: 26, inMaand: false });
        expect(r[0][6]).toEqual({ iso: '2026-11-01', dag: 1, inMaand: true });
        expect(r.every((w) => w.length === 7)).toBe(true);
        expect(r.flat().filter((d) => d.inMaand)).toHaveLength(30);
        expect(r.at(-1)!.at(-1)!.iso).toBe('2026-12-06');
    });

    it('een maand die op maandag begint en precies vier weken heeft', () => {
        const r = maandRooster(2027, 1); // februari 2027: maandag 1 t/m zondag 28
        expect(r).toHaveLength(4);
        expect(r[0][0].iso).toBe('2027-02-01');
        expect(r[3][6].iso).toBe('2027-02-28');
    });

    it('schrikkeljaar: 29 februari 2028', () => {
        expect(maandRooster(2028, 1).flat().some((d) => d.iso === '2028-02-29' && d.inMaand)).toBe(true);
    });
});

describe('maanden en datums', () => {
    it('verschuift over de jaargrens', () => {
        expect(verschuifMaand(2026, 11, 1)).toEqual({ jaar: 2027, maand0: 0 });
        expect(verschuifMaand(2027, 0, -1)).toEqual({ jaar: 2026, maand0: 11 });
    });
    it('leest een iso-datum, en niets bij onzin', () => {
        expect(maandVan('2026-11-26')).toEqual({ jaar: 2026, maand0: 10 });
        expect(maandVan('')).toBeNull();
        expect(maandVan('2026-13-01')).toBeNull();
    });
    it('vandaag op de klok van het apparaat', () => {
        expect(vandaagIso(new Date(2026, 10, 19, 23, 30))).toBe('2026-11-19');
    });
    it('in het Nederlands', () => {
        expect(maandNaam(2026, 10)).toBe('november 2026');
        expect(datumVoluit('2026-11-26')).toBe('donderdag 26 november 2026');
        expect(datumVoluit('')).toBe('');
        expect(datumKort('2026-11-26')).toBe('do 26 nov 2026');
    });
});
