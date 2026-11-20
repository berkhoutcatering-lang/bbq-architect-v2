import { describe, expect, it } from 'vitest';
import { dagenIngevroren, sorteerVriezer, type VriezerStuk } from './vriezer';

const stuk = (o: Partial<VriezerStuk>): VriezerStuk => ({
    id: 'x', naam: 'Haasbiefstuk', gewicht_g: null, prijs_cents: 100, tht: null, ingevroren_op: '2026-11-20', opgebruikt_at: null, door: null, ...o,
});

describe('vriezerlijst', () => {
    it('oudste invriesdatum bovenaan, dan de vroegste THT, dan op naam', () => {
        const lijst = [
            stuk({ id: 'c', ingevroren_op: '2026-11-20', tht: '2026-11-25', naam: 'Kogel' }),
            stuk({ id: 'a', ingevroren_op: '2026-11-02' }),
            stuk({ id: 'd', ingevroren_op: '2026-11-20', tht: null }),
            stuk({ id: 'b', ingevroren_op: '2026-11-20', tht: '2026-11-22' }),
        ].sort(sorteerVriezer);
        expect(lijst.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('dagen in de vriezer, ook over de wisseling naar wintertijd', () => {
        expect(dagenIngevroren('2026-11-20', '2026-11-20')).toBe(0);
        expect(dagenIngevroren('2026-10-20', '2026-11-20')).toBe(31);
        expect(dagenIngevroren('2026-11-21', '2026-11-20')).toBe(0);
    });
});
