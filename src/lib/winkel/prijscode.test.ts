import { describe, expect, it } from 'vitest';
import { eanControlecijfer, leesPrijscode } from './prijscode';

describe('leesPrijscode (sticker van Veerbeek: 21 AAAAA PPPPP C)', () => {
    it('echte stickers van 18 november 2026', () => {
        expect(leesPrijscode('2101015028237')).toEqual({ ok: true, prijscode: { code: '2101015028237', nr: '01015', prijs_cents: 2823 } });
        expect(leesPrijscode('2107061018758')).toEqual({ ok: true, prijscode: { code: '2107061018758', nr: '07061', prijs_cents: 1875 } });
        expect(leesPrijscode(' 2106246004791 \n')).toMatchObject({ ok: true, prijscode: { nr: '06246', prijs_cents: 479 } });
    });
    it('een verkeerd gelezen cijfer valt op aan het controlecijfer', () => {
        expect(leesPrijscode('2101015028230')).toEqual({ ok: false, reden: 'controlecijfer' });
        expect(leesPrijscode('2101015028337')).toEqual({ ok: false, reden: 'controlecijfer' });
    });
    it('geen prijscode: een gewone EAN, een kaassticker, te kort', () => {
        expect(leesPrijscode('8712345678906')).toEqual({ ok: false, reden: 'geen_prijscode' });
        expect(leesPrijscode('2900012004120249527031900315')).toEqual({ ok: false, reden: 'geen_prijscode' });
        expect(leesPrijscode('210101502823')).toEqual({ ok: false, reden: 'geen_prijscode' });
        expect(leesPrijscode('')).toEqual({ ok: false, reden: 'geen_prijscode' });
    });
    it('controlecijfer volgens EAN-13', () => {
        expect(eanControlecijfer('210101502823')).toBe(7);
        expect(eanControlecijfer('871234567890')).toBe(6);
    });
});
