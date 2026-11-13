import { describe, expect, it } from 'vitest';
import { centenUitInvoer, KasRegelSchema } from './kasInvoer';

describe('centenUitInvoer', () => {
    it('leest bedragen in Nederlandse notatie', () => {
        expect(centenUitInvoer('9')).toBe(900);
        expect(centenUitInvoer('9,5')).toBe(950);
        expect(centenUitInvoer(' € 12,34 ')).toBe(1234);
        expect(centenUitInvoer('1.250,00')).toBe(125000);
        expect(centenUitInvoer('1.250')).toBe(125000);
    });
    it('weigert leeg, nul, negatief, onzin en meer dan twee decimalen', () => {
        for (const t of ['', '0', '0,00', '-3', 'abc', '1,234', '12,3,4']) expect(centenUitInvoer(t)).toBeNull();
    });
    it('gokt niet bij een punt als decimaalteken', () => {
        for (const t of ['9.50', '9.5', '12.3,4']) expect(centenUitInvoer(t)).toBeNull();
    });
});

describe('KasRegelSchema', () => {
    const goed = { datum: '2026-11-27', richting: 'uit', bedrag: '9,00', reden: 'uitgave', omschrijving: 'Schoonmaakmiddel', moment: 'tijdens' };
    it('keurt een gewone regel goed', () => {
        expect(KasRegelSchema.safeParse(goed).success).toBe(true);
    });
    it('weigert een kapotte datum, een leeg bedrag en een te korte omschrijving', () => {
        expect(KasRegelSchema.safeParse({ ...goed, datum: '27-11-2026' }).success).toBe(false);
        expect(KasRegelSchema.safeParse({ ...goed, bedrag: '0' }).success).toBe(false);
        expect(KasRegelSchema.safeParse({ ...goed, omschrijving: 'x' }).success).toBe(false);
        expect(KasRegelSchema.safeParse({ ...goed, reden: 'anders' }).success).toBe(false);
        expect(KasRegelSchema.safeParse({ ...goed, moment: 'later' }).success).toBe(false);
    });
});
