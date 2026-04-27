import { describe, it, expect } from 'vitest';
import {
    cleanWinkelString,
    matchLeverancier,
    parseAmount,
    normalizeBonItem,
    parseBonBtw,
    summarizeBon,
    type LeverancierLookup,
} from './bonProcessing';
import type { BonItemRow } from '@/types';

describe('cleanWinkelString', () => {
    it('strip BV/NV', () => {
        expect(cleanWinkelString('Sligro B.V.')).toBe('Sligro');
        expect(cleanWinkelString('Hanos NV')).toBe('Hanos');
    });

    it('strip datums', () => {
        expect(cleanWinkelString('SLIGRO 2026-04-12')).toBe('SLIGRO');
        expect(cleanWinkelString('Crisp 12-04-2026')).toBe('Crisp');
    });

    it('strip bon-nummers', () => {
        expect(cleanWinkelString('Sligro #12345')).toBe('Sligro');
        expect(cleanWinkelString('Hanos @ 998')).toBe('Hanos');
    });

    it('strip filiaal-nummers', () => {
        expect(cleanWinkelString('Sligro filiaal 12')).toBe('Sligro');
    });

    it('lege input', () => {
        expect(cleanWinkelString('')).toBe('');
        expect(cleanWinkelString('   ')).toBe('');
    });
});

describe('parseAmount', () => {
    it('parses numbers', () => {
        expect(parseAmount(2.5)).toBe(2.5);
        expect(parseAmount(0)).toBe(0);
    });

    it('parses NL-format strings', () => {
        expect(parseAmount('2,50')).toBe(2.5);
        expect(parseAmount('€4,20')).toBe(4.2);
        expect(parseAmount(' 12.34 ')).toBe(12.34);
    });

    it('returns 0 voor onparse-bare input', () => {
        expect(parseAmount('foo')).toBe(0);
        expect(parseAmount(null)).toBe(0);
        expect(parseAmount(undefined)).toBe(0);
        expect(parseAmount(NaN)).toBe(0);
        expect(parseAmount(Infinity)).toBe(0);
    });
});

describe('matchLeverancier', () => {
    const leveranciers: LeverancierLookup[] = [
        { id: 1, naam: 'Sligro', type: 'Groothandel' },
        { id: 2, naam: 'Hanos', type: 'Groothandel' },
        { id: 3, naam: 'Bakker Holtkamp', type: 'Bakker' },
        { id: 4, naam: 'Crisp', type: 'Supermarkt' },
    ];

    it('exacte match', () => {
        expect(matchLeverancier('Sligro', leveranciers)?.id).toBe(1);
    });

    it('match na cleaning datum/bon-nummer', () => {
        expect(matchLeverancier('SLIGRO 2026-04-12 #998', leveranciers)?.id).toBe(1);
    });

    it('case-insensitive', () => {
        expect(matchLeverancier('sligro b.v.', leveranciers)?.id).toBe(1);
    });

    it('reverse match (winkel-string langer dan leverancier-naam)', () => {
        expect(matchLeverancier('Sligro Distribution Center', leveranciers)?.id).toBe(1);
    });

    it('returnt null voor onbekende winkel', () => {
        expect(matchLeverancier('Onbekende Groothandel', leveranciers)).toBeNull();
    });

    it('returnt null voor te korte naam (<3 chars na cleaning)', () => {
        expect(matchLeverancier('AB', leveranciers)).toBeNull();
    });

    it('returnt null voor lege input', () => {
        expect(matchLeverancier('', leveranciers)).toBeNull();
    });
});

describe('normalizeBonItem', () => {
    it('NL-velden naar canoniek shape', () => {
        const r = normalizeBonItem({ naam: 'Brisket', aantal: 2, prijs: 28.50, eenheid: 'kg', btw: 9 });
        expect(r).toEqual({
            naam: 'Brisket',
            aantal: 2,
            unit: 'kg',
            prijs: 28.5,
            btw_pct: 9,
            totaal: 57,
        });
    });

    it('EN-velden mapping', () => {
        const r = normalizeBonItem({ name: 'Brisket', qty: 2, price: 28.50, unit: 'kg', tax: 9 });
        expect(r?.naam).toBe('Brisket');
        expect(r?.aantal).toBe(2);
        expect(r?.prijs).toBe(28.5);
    });

    it('btw-tarief snapping (8.5 → 9, 22 → 21)', () => {
        expect(normalizeBonItem({ naam: 'X', aantal: 1, prijs: 1, btw: 8.5 })?.btw_pct).toBe(9);
        expect(normalizeBonItem({ naam: 'X', aantal: 1, prijs: 1, btw: 22 })?.btw_pct).toBe(21);
        expect(normalizeBonItem({ naam: 'X', aantal: 1, prijs: 1, btw: 3 })?.btw_pct).toBe(0);
    });

    it('btw als string "laag"/"hoog"', () => {
        expect(normalizeBonItem({ naam: 'X', aantal: 1, prijs: 1, btw: 'laag' })?.btw_pct).toBe(9);
        expect(normalizeBonItem({ naam: 'X', aantal: 1, prijs: 1, btw: 'hoog' })?.btw_pct).toBe(21);
    });

    it('lege naam → null', () => {
        expect(normalizeBonItem({ aantal: 1, prijs: 1 })).toBeNull();
        expect(normalizeBonItem({ naam: '', aantal: 1 })).toBeNull();
    });

    it('default values', () => {
        const r = normalizeBonItem({ naam: 'Foo' });
        expect(r?.aantal).toBe(1);
        expect(r?.prijs).toBe(0);
        expect(r?.unit).toBe('stuks');
    });

    it('NL komma in qty', () => {
        const r = normalizeBonItem({ naam: 'Mayo', aantal: '2,5', prijs: '4,80', unit: 'L' });
        expect(r?.aantal).toBe(2.5);
        expect(r?.prijs).toBe(4.8);
    });
});

describe('parseBonBtw', () => {
    it('lege items → alles 0', () => {
        const b = parseBonBtw([]);
        expect(b).toEqual({ btw_laag_bedrag: 0, btw_hoog_bedrag: 0, netto_bedrag: 0, bruto_bedrag: 0 });
    });

    it('alleen 9% (food)', () => {
        const items: BonItemRow[] = [
            { naam: 'Brisket', aantal: 1, unit: 'kg', prijs: 32.70, btw_pct: 9, totaal: 32.70 },
        ];
        const b = parseBonBtw(items);
        /* netto = 32.70 / 1.09 = 30.00 → btw 2.70 */
        expect(b.netto_bedrag).toBeCloseTo(30, 1);
        expect(b.btw_laag_bedrag).toBeCloseTo(2.70, 1);
        expect(b.btw_hoog_bedrag).toBe(0);
    });

    it('alleen 21% (non-food)', () => {
        const items: BonItemRow[] = [
            { naam: 'Schoonmaak', aantal: 1, unit: 'L', prijs: 12.10, btw_pct: 21, totaal: 12.10 },
        ];
        const b = parseBonBtw(items);
        /* netto = 12.10 / 1.21 = 10.00 → btw 2.10 */
        expect(b.netto_bedrag).toBeCloseTo(10, 1);
        expect(b.btw_hoog_bedrag).toBeCloseTo(2.10, 1);
    });

    it('mix 9% + 21%', () => {
        const items: BonItemRow[] = [
            { naam: 'Brisket', aantal: 1, unit: 'kg', prijs: 32.70, btw_pct: 9, totaal: 32.70 },
            { naam: 'Schoonmaak', aantal: 1, unit: 'L', prijs: 12.10, btw_pct: 21, totaal: 12.10 },
        ];
        const b = parseBonBtw(items);
        expect(b.bruto_bedrag).toBeCloseTo(44.80, 1);
        expect(b.btw_laag_bedrag).toBeCloseTo(2.70, 1);
        expect(b.btw_hoog_bedrag).toBeCloseTo(2.10, 1);
        expect(b.netto_bedrag).toBeCloseTo(40, 1);
    });

    it('btw 0% (vrijgesteld) → totaal naar netto', () => {
        const items: BonItemRow[] = [
            { naam: 'X', aantal: 1, unit: 'stuks', prijs: 10, btw_pct: 0, totaal: 10 },
        ];
        const b = parseBonBtw(items);
        expect(b.netto_bedrag).toBe(10);
        expect(b.btw_laag_bedrag).toBe(0);
        expect(b.btw_hoog_bedrag).toBe(0);
    });

    it('totaal-veld override aantal × prijs', () => {
        const items: BonItemRow[] = [
            /* aantal × prijs = 5, maar bon zegt totaal=4.50 (bv. korting) */
            { naam: 'X', aantal: 1, unit: 'kg', prijs: 5, btw_pct: 9, totaal: 4.50 },
        ];
        const b = parseBonBtw(items);
        expect(b.bruto_bedrag).toBeCloseTo(4.50, 2);
    });
});

describe('summarizeBon', () => {
    it('parsed array van AI-actions', () => {
        const raw = [
            {
                type: 'process_receipt',
                data: {
                    winkel: 'Sligro',
                    datum: '2026-04-12',
                    totaal_bedrag: 32.70,
                    items: [
                        { naam: 'Brisket', aantal: 1, prijs: 32.70, eenheid: 'kg', btw: 9 },
                    ],
                },
            },
        ];
        const s = summarizeBon(raw);
        expect(s.winkel).toBe('Sligro');
        expect(s.datum).toBe('2026-04-12');
        expect(s.items).toHaveLength(1);
        expect(s.items[0].naam).toBe('Brisket');
        expect(s.btw.btw_laag_bedrag).toBeCloseTo(2.70, 1);
    });

    it('parsed direct object', () => {
        const raw = {
            winkel: 'Hanos',
            datum: '2026-04-13',
            items: [{ naam: 'Mayo', aantal: 2, prijs: 4.20, unit: 'L' }],
        };
        const s = summarizeBon(raw);
        expect(s.winkel).toBe('Hanos');
        expect(s.items).toHaveLength(1);
        expect(s.items[0].unit).toBe('l');
    });

    it('default datum bij ontbrekende', () => {
        const s = summarizeBon({ winkel: 'X', items: [] });
        expect(s.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('totaal_bedrag fallback uit items als ontbrekend', () => {
        const s = summarizeBon({
            winkel: 'X',
            items: [{ naam: 'Y', aantal: 1, prijs: 10, totaal: 10 }],
        });
        expect(s.totaal_bedrag).toBe(10);
    });

    it('skip items met lege naam', () => {
        const s = summarizeBon({
            winkel: 'X',
            items: [
                { naam: 'Goed', aantal: 1, prijs: 5 },
                { naam: '', aantal: 1, prijs: 5 },
                { aantal: 1, prijs: 5 },
            ],
        });
        expect(s.items).toHaveLength(1);
        expect(s.items[0].naam).toBe('Goed');
    });
});
