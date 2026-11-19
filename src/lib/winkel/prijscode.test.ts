import { describe, expect, it } from 'vitest';
import { eanControlecijfer, leesPrijscode, prijsControlecijfer } from './prijscode';

describe('leesPrijscode (sticker van Veerbeek: 21 PPPP K CCCCC E)', () => {
    it('echte stickers: pakje en krat van hetzelfde product hebben dezelfde PLU', () => {
        expect(leesPrijscode('2101015028237')).toEqual({ ok: true, prijscode: { code: '2101015028237', plu: '0101', prijs_cents: 2823 } });
        expect(leesPrijscode('2101012076774')).toEqual({ ok: true, prijscode: { code: '2101012076774', plu: '0101', prijs_cents: 7677 } });
        expect(leesPrijscode('2102218007845')).toMatchObject({ ok: true, prijscode: { plu: '0221', prijs_cents: 784 } });
        expect(leesPrijscode('2102212056610')).toMatchObject({ ok: true, prijscode: { plu: '0221', prijs_cents: 5661 } });
        expect(leesPrijscode('2107061018758')).toMatchObject({ ok: true, prijscode: { plu: '0706', prijs_cents: 1875 } });
        expect(leesPrijscode(' 2106246004791 \n')).toMatchObject({ ok: true, prijscode: { plu: '0624', prijs_cents: 479 } });
    });
    it('PLU 0000 bestaat (gedeeld door de slager): gekruid gehakt en Honey Pops', () => {
        expect(leesPrijscode('2100007066967')).toMatchObject({ ok: true, prijscode: { plu: '0000', prijs_cents: 6696 } });
        expect(leesPrijscode('2100007054896')).toMatchObject({ ok: true, prijscode: { plu: '0000', prijs_cents: 5489 } });
    });
    it('een verkeerd gelezen cijfer valt op aan een van de twee controlecijfers', () => {
        expect(leesPrijscode('2101015028230')).toEqual({ ok: false, reden: 'controlecijfer' });
        expect(leesPrijscode('2101015028337')).toEqual({ ok: false, reden: 'controlecijfer' });
    });
    it('een prijscontrolecijfer dat niet klopt, ook al klopt het EAN-cijfer', () => {
        // K 4 in plaats van 5, met een EAN-cijfer dat wel klopt voor deze 12 cijfers.
        const twaalf = '210101402823';
        const code = twaalf + eanControlecijfer(twaalf);
        expect(leesPrijscode(code)).toEqual({ ok: false, reden: 'controlecijfer' });
    });
    it('geen prijscode: een gewone EAN, een kaassticker, te kort', () => {
        expect(leesPrijscode('8712345678906')).toEqual({ ok: false, reden: 'geen_prijscode' });
        expect(leesPrijscode('2900012004120249527031900315')).toEqual({ ok: false, reden: 'geen_prijscode' });
        expect(leesPrijscode('210101502823')).toEqual({ ok: false, reden: 'geen_prijscode' });
        expect(leesPrijscode('')).toEqual({ ok: false, reden: 'geen_prijscode' });
    });
});

describe('controlecijfers', () => {
    it('EAN-13', () => {
        expect(eanControlecijfer('210101502823')).toBe(7);
        expect(eanControlecijfer('871234567890')).toBe(6);
    });
    it('prijscontrolecijfer (GS1, vijf cijfers)', () => {
        expect(prijsControlecijfer('02823')).toBe(5);
        expect(prijsControlecijfer('07677')).toBe(2);
        expect(prijsControlecijfer('00784')).toBe(8);
        expect(prijsControlecijfer('05661')).toBe(2);
        expect(prijsControlecijfer('00000')).toBe(0);
    });
});
