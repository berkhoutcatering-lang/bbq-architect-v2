import { describe, expect, it } from 'vitest';
import { controlecijfer, controleerEan, eanVarianten } from './ean';
import { EanSchema } from './toonbankVelden';

describe('controleerEan', () => {
    it('neemt een EAN-13 met een goed controlecijfer aan', () => {
        expect(controleerEan('8712345678906')).toEqual({ ok: true, code: '8712345678906', soort: 'EAN-13' });
        /* Het GS1-voorbeeld uit de Wikipedia-uitleg. */
        expect(controleerEan('4006381333931').ok).toBe(true);
    });

    it('neemt EAN-8 en UPC-A aan', () => {
        expect(controleerEan('96385074')).toEqual({ ok: true, code: '96385074', soort: 'EAN-8' });
        expect(controleerEan('036000291452')).toEqual({ ok: true, code: '036000291452', soort: 'UPC-A' });
    });

    it('haalt spaties en een regeleinde van de scanner weg', () => {
        expect(controleerEan('  8712345678906\n')).toMatchObject({ ok: true, code: '8712345678906' });
    });

    it('weigert een verkeerd controlecijfer', () => {
        const c = controleerEan('8712345678907');
        expect(c.ok).toBe(false);
        if (c.ok === false) expect(c.fout).toMatch(/laatste cijfer/);
    });

    it('weigert een verkeerde lengte en zegt hoeveel cijfers het waren', () => {
        for (const code of ['1234567', '123456789', '12345678901', '12345678901234']) {
            const c = controleerEan(code);
            expect(c.ok).toBe(false);
            if (c.ok === false) expect(c.fout).toContain(`er ${code.length}`);
        }
    });

    it('weigert letters, leeg en niets', () => {
        expect(controleerEan('87123456789AB').ok).toBe(false);
        expect(controleerEan('https://hopbites.nl/g/abc').ok).toBe(false);
        expect(controleerEan('').ok).toBe(false);
        expect(controleerEan('   ').ok).toBe(false);
        expect(controleerEan(null).ok).toBe(false);
    });
});

describe('controlecijfer', () => {
    it('rekent volgens GS1', () => {
        expect(controlecijfer('871234567890')).toBe(6);
        expect(controlecijfer('9638507')).toBe(4);
        expect(controlecijfer('03600029145')).toBe(2);
        expect(controlecijfer('400638133393')).toBe(1);
        /* Som is al een tiental: controlecijfer 0, niet 10. */
        expect(controlecijfer('000000000000')).toBe(0);
        expect(controlecijfer('000000000001')).toBe(7);
    });
});

describe('eanVarianten', () => {
    it('UPC-A en EAN-13 met voorloopnul zijn dezelfde code', () => {
        expect(eanVarianten('036000291452')).toEqual(['036000291452', '0036000291452']);
        expect(eanVarianten('0036000291452')).toEqual(['0036000291452', '036000291452']);
        expect(eanVarianten('8712345678906')).toEqual(['8712345678906']);
        expect(eanVarianten('96385074')).toEqual(['96385074']);
    });
});

describe('EanSchema gebruikt dezelfde controle', () => {
    it('weigert een verkeerd controlecijfer, ook op de oude plekken', () => {
        expect(EanSchema.safeParse('8712345678907').success).toBe(false);
        expect(EanSchema.parse(' 8712345678906 ')).toBe('8712345678906');
        expect(EanSchema.parse(null)).toBeNull();
    });
});
