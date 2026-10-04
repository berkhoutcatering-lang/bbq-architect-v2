import { describe, expect, it } from 'vitest';
import {
    EAN_INDEX,
    EanSchema,
    StatiegeldSchema,
    ToonbankArtikelVelden,
    eanFoutMelding,
    kanalenTekst,
    normaliseerKanalen,
    toonbankGroepen,
} from './toonbankVelden';

describe('kanalen', () => {
    it('maakt uniek en zet ze in vaste volgorde', () => {
        expect(normaliseerKanalen(['toonbank', 'webshop', 'toonbank'])).toEqual(['webshop', 'toonbank']);
        expect(normaliseerKanalen(['event', 'onzin', 'webshop'])).toEqual(['webshop', 'event']);
        expect(normaliseerKanalen(null)).toEqual([]);
    });

    it('standaard alleen webshop, zoals de database', () => {
        const v = ToonbankArtikelVelden.parse({});
        expect(v).toEqual({ kanalen: ['webshop'], toonbank_groep: null, toonbank_volgorde: 0, toonbank_favoriet: false });
    });

    it('weigert een onbekend kanaal (de oude naam kassa)', () => {
        expect(ToonbankArtikelVelden.safeParse({ kanalen: ['kassa'] }).success).toBe(false);
    });

    it('lege of witte groep wordt null, en hooguit 40 tekens', () => {
        expect(ToonbankArtikelVelden.parse({ toonbank_groep: '   ' }).toonbank_groep).toBeNull();
        expect(ToonbankArtikelVelden.parse({ toonbank_groep: ' Bier ' }).toonbank_groep).toBe('Bier');
        expect(ToonbankArtikelVelden.safeParse({ toonbank_groep: 'x'.repeat(41) }).success).toBe(false);
    });

    it('volgorde is een heel getal', () => {
        expect(ToonbankArtikelVelden.safeParse({ toonbank_volgorde: 1.5 }).success).toBe(false);
        expect(ToonbankArtikelVelden.parse({ toonbank_volgorde: -3 }).toonbank_volgorde).toBe(-3);
    });

    it('beschrijft de kanalen in gewone taal', () => {
        expect(kanalenTekst(['webshop'])).toBe('alleen webshop');
        expect(kanalenTekst(['toonbank', 'webshop'])).toBe('webshop en toonbank');
        expect(kanalenTekst([])).toBe('nergens te koop');
    });
});

describe('statiegeld en EAN', () => {
    it('statiegeld: hele centen, 0 tot en met € 100', () => {
        expect(StatiegeldSchema.parse(15)).toBe(15);
        expect(StatiegeldSchema.safeParse(-1).success).toBe(false);
        expect(StatiegeldSchema.safeParse(0.5).success).toBe(false);
        expect(StatiegeldSchema.safeParse(10_001).success).toBe(false);
    });

    it('EAN: 8 tot 14 cijfers of leeg', () => {
        expect(EanSchema.parse('8712345678906')).toBe('8712345678906');
        expect(EanSchema.parse(null)).toBeNull();
        expect(EanSchema.safeParse('12345').success).toBe(false);
        expect(EanSchema.safeParse('87123456789AB').success).toBe(false);
    });

    it('herkent een dubbele EAN uit Postgres en niets anders', () => {
        const pg = { code: '23505', message: `duplicate key value violates unique constraint "${EAN_INDEX}"`, details: 'Key (organization_id, ean)=(…, 871…) already exists.' };
        expect(eanFoutMelding(pg)).toMatch(/hoort al bij een ander product/);
        expect(eanFoutMelding({ code: '23505', message: 'duplicate key value violates unique constraint "winkel_producten_slug_uniek"' })).toBeNull();
        expect(eanFoutMelding({ code: '23514', message: EAN_INDEX })).toBeNull();
        expect(eanFoutMelding(null)).toBeNull();
    });
});

describe('toonbankGroepen', () => {
    it('uniek en op naam, zonder lege', () => {
        expect(toonbankGroepen([{ toonbank_groep: 'Wijn' }, { toonbank_groep: 'Bier' }, { toonbank_groep: ' Bier' }, { toonbank_groep: null }, {}])).toEqual(['Bier', 'Wijn']);
    });
});
