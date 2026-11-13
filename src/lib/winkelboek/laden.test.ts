import { describe, expect, it } from 'vitest';
import { isNogNiet, zonderProefdagen } from './laden';

describe('isNogNiet', () => {
    it('herkent een tabel of kolom die er nog niet is', () => {
        for (const code of ['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205']) expect(isNogNiet({ code })).toBe(true);
    });
    it('een andere fout of geen fout is het niet', () => {
        expect(isNogNiet({ code: '42501' })).toBe(false);
        expect(isNogNiet(null)).toBe(false);
        expect(isNogNiet({})).toBe(false);
    });
});

describe('zonderProefdagen', () => {
    it('laat rijen van uitgesloten dagen weg', () => {
        const rijen = [{ bedrijfsdag: '2026-10-27', x: 1 }, { bedrijfsdag: '2026-11-21', x: 2 }];
        expect(zonderProefdagen(rijen, new Set(['2026-10-27']))).toEqual([{ bedrijfsdag: '2026-11-21', x: 2 }]);
        expect(zonderProefdagen(rijen, new Set())).toHaveLength(2);
    });
});
