import { describe, it, expect } from 'vitest';
import { packToBase, packToBaseMulti, unitPriceLabel, exampleUseCost } from './unitPrice';

/* Deze tests ontbraken volledig (briefing §20.1). unitPrice is de
   rekenkundige canon voor gerecht-kostprijzen — hier hard vastgelegd. */

describe('packToBase — gewicht naar per 100 g', () => {
    it('2,5 kg voor €22,50 → base per 100 g', () => {
        const b = packToBase(2250, 2.5, 'kg');
        expect(b).toEqual({ base_quantity: 100, base_unit: 'g', base_cost_cents: 90 });
        // 90 cent / 100 g = €9,00 / kg
        expect(unitPriceLabel(b!.base_cost_cents, b!.base_quantity, b!.base_unit)).toBe('€9.00 / kg');
    });
    it('750 g voor €8,25 → €11,00 / kg', () => {
        const b = packToBase(825, 750, 'g');
        expect(b!.base_cost_cents).toBe(110); // 110 cent / 100 g
        expect(unitPriceLabel(b!.base_cost_cents, b!.base_quantity, b!.base_unit)).toBe('€11.00 / kg');
    });
    it('gram-invoer werkt gelijk aan kg-invoer', () => {
        expect(packToBase(2250, 2500, 'g')).toEqual(packToBase(2250, 2.5, 'kg'));
    });
});

describe('packToBase — volume en stuks', () => {
    it('1 liter voor €6,80 → €6,80 / liter', () => {
        const b = packToBase(680, 1, 'liter');
        expect(b).toEqual({ base_quantity: 100, base_unit: 'ml', base_cost_cents: 68 });
        expect(unitPriceLabel(b!.base_cost_cents, b!.base_quantity, b!.base_unit)).toBe('€6.80 / liter');
    });
    it('12 stuks voor €5,04 → €0,42 / stuk', () => {
        const b = packToBase(504, 12, 'stuk');
        expect(b).toEqual({ base_quantity: 1, base_unit: 'stuk', base_cost_cents: 42 });
        expect(unitPriceLabel(b!.base_cost_cents, b!.base_quantity, b!.base_unit)).toBe('€0.42 / stuk');
    });
});

describe('packToBase — randgevallen', () => {
    it('null bij ongeldige input', () => {
        expect(packToBase(-1, 1, 'kg')).toBeNull();
        expect(packToBase(100, 0, 'kg')).toBeNull();
        expect(packToBase(100, -5, 'liter')).toBeNull();
    });
});

describe('packToBaseMulti — multipacks', () => {
    it('24 × 330 ml voor €18,96 → per 100 ml (≈€2,39/L)', () => {
        const b = packToBaseMulti(1896, 24, 330, 'ml');
        // totaal 7920 ml → base_cost_cents = round(1896*100/7920) = 24
        expect(b).toEqual({ base_quantity: 100, base_unit: 'ml', base_cost_cents: 24 });
    });
    it('6 × 1,5 L voor €13,50 → €1,50 / liter', () => {
        const b = packToBaseMulti(1350, 6, 1.5, 'liter');
        // totaal 9000 ml → round(1350*100/9000) = 15 cent/100ml = €1,50/L
        expect(b!.base_cost_cents).toBe(15);
        expect(unitPriceLabel(b!.base_cost_cents, b!.base_quantity, b!.base_unit)).toBe('€1.50 / liter');
    });
    it('2 × 1 kg voor €18,95 → gebruikt de pakprijs, niet het aantal', () => {
        const b = packToBaseMulti(1895, 2, 1, 'kg');
        // totaal 2000 g → round(1895*100/2000) = 95 cent/100g = €9,475/kg → label €9.48
        expect(b!.base_cost_cents).toBe(95);
    });
    it("'piece' wordt als 'stuk' behandeld", () => {
        const b = packToBaseMulti(504, 12, 1, 'piece');
        expect(b).toEqual({ base_quantity: 1, base_unit: 'stuk', base_cost_cents: 42 });
    });
    it('null bij ongeldig aantal of inhoud', () => {
        expect(packToBaseMulti(1000, 0, 330, 'ml')).toBeNull();
        expect(packToBaseMulti(1000, 24, 0, 'ml')).toBeNull();
    });
});

describe('exampleUseCost', () => {
    it('200 g dosering uit een per-100g base', () => {
        const b = packToBase(2250, 2.5, 'kg')!; // 90 cent / 100 g
        const use = exampleUseCost(b);
        expect(use).toEqual({ qty: 200, unit: 'g', cents: 180 }); // 200 g = €1,80
    });
});
