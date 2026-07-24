import { describe, it, expect } from 'vitest';
// Importeert de EXTENSIE-adapter-helpers rechtstreeks (één bron van waarheid).
import { toDecimalString, parsePackaging } from '../../../chrome-extension/adapters/lib/parse.js';

describe('extension adapter — toDecimalString', () => {
    it('NL en internationale notatie → canonieke decimale string', () => {
        expect(toDecimalString('€ 22,50')).toBe('22.50');
        expect(toDecimalString('18.96')).toBe('18.96');
        expect(toDecimalString('1.234,56')).toBe('1234.56');
        expect(toDecimalString('1,234.56')).toBe('1234.56');
        expect(toDecimalString('8,25')).toBe('8.25');
    });
    it('onbruikbaar → null', () => {
        expect(toDecimalString('op aanvraag')).toBeNull();
        expect(toDecimalString(null)).toBeNull();
    });
});

describe('extension adapter — parsePackaging (§14.2 bronvelden)', () => {
    it('enkel gewicht "2,5 kg"', () => {
        const p = parsePackaging('Zak 2,5 kg');
        expect(p.priceBasis).toBe('package');
        expect(p.packCount).toBe('1');
        expect(p.contentPerItemQuantity).toBe('2.5');
        expect(p.contentPerItemUnit).toBe('kg');
        expect(p.packageDescriptionRaw).toBe('Zak 2,5 kg');
    });
    it('multipack "24 × 330 ml"', () => {
        const p = parsePackaging('24 × 330 ml');
        expect(p.packCount).toBe('24');
        expect(p.contentPerItemQuantity).toBe('330');
        expect(p.contentPerItemUnit).toBe('ml');
    });
    it('multipack "6 x 1,5 L"', () => {
        const p = parsePackaging('6 x 1,5 L');
        expect(p.packCount).toBe('6');
        expect(p.contentPerItemQuantity).toBe('1.5');
        expect(p.contentPerItemUnit).toBe('liter');
    });
    it('stuks "12 stuks"', () => {
        const p = parsePackaging('12 stuks');
        expect(p.packCount).toBe('12');
        expect(p.contentPerItemUnit).toBe('piece');
    });
    it('"750 g"', () => {
        const p = parsePackaging('750 g');
        expect(p.contentPerItemQuantity).toBe('750');
        expect(p.contentPerItemUnit).toBe('g');
    });
    it('"2 × 1 kg" → aantal 2, inhoud 1 kg (prijs blijft pakprijs)', () => {
        const p = parsePackaging('2 × 1 kg');
        expect(p.packCount).toBe('2');
        expect(p.contentPerItemQuantity).toBe('1');
        expect(p.contentPerItemUnit).toBe('kg');
    });
    it('variabel gewicht "per kg"', () => {
        const p = parsePackaging('Prijs per kg (vanggewicht)');
        expect(p.priceBasis).toBe('kg');
        expect(p.variableWeight).toBe(true);
    });
    it('onbekende verpakking blijft unknown', () => {
        const p = parsePackaging('assortiment');
        expect(p.priceBasis).toBe('unknown');
    });
});
