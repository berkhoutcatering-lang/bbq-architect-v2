import { describe, it, expect } from 'vitest';
import {
    parseMoneyToCents,
    resolvePackaging,
    computeEffectivePrice,
    computePricing,
    round6,
    pricePerUnitLabel,
    type PricingInput,
} from './pricing';

/* Basis-observatie voor computePricing; per test overschreven. */
function baseInput(over: Partial<PricingInput>): PricingInput {
    return {
        priceBasis: 'package',
        packCount: null,
        contentPerItemQuantity: null,
        contentPerItemUnit: null,
        totalBaseQuantity: null,
        baseUnit: null,
        regularPriceExVat: null,
        promoPriceExVat: null,
        variableWeight: false,
        ...over,
    };
}

describe('parseMoneyToCents — NL en internationale notatie', () => {
    it('Nederlandse komma-decimaal', () => {
        expect(parseMoneyToCents('22,50')).toBe(2250);
        expect(parseMoneyToCents('0,42')).toBe(42);
        expect(parseMoneyToCents('8,25')).toBe(825);
    });
    it('internationale punt-decimaal', () => {
        expect(parseMoneyToCents('22.50')).toBe(2250);
        expect(parseMoneyToCents('18.96')).toBe(1896);
    });
    it('euroteken en spaties', () => {
        expect(parseMoneyToCents('€ 22,50')).toBe(2250);
        expect(parseMoneyToCents('  €18.96 ')).toBe(1896);
    });
    it('duizendtal-scheiding — NL (punt) en EN (komma)', () => {
        expect(parseMoneyToCents('1.234,56')).toBe(123456);
        expect(parseMoneyToCents('1,234.56')).toBe(123456);
        expect(parseMoneyToCents('1.250,95')).toBe(125095);
    });
    it('één teken gevolgd door 3 cijfers = duizendtal', () => {
        expect(parseMoneyToCents('1.234')).toBe(123400);
        expect(parseMoneyToCents('1,234')).toBe(123400);
    });
    it('hele euro zonder scheidingsteken', () => {
        expect(parseMoneyToCents('1234')).toBe(123400);
        expect(parseMoneyToCents(18)).toBe(1800);
    });
    it('onbruikbare input → null', () => {
        expect(parseMoneyToCents(null)).toBeNull();
        expect(parseMoneyToCents('')).toBeNull();
        expect(parseMoneyToCents('op aanvraag')).toBeNull();
        expect(parseMoneyToCents('-5,00')).toBe(-500); // teken behouden; caller reject <=0
    });
});

describe('resolvePackaging', () => {
    it('multipack 24 × 330 ml → 7920 ml', () => {
        const r = resolvePackaging({
            priceBasis: 'package', packCount: '24', contentPerItemQuantity: '330',
            contentPerItemUnit: 'ml', totalBaseQuantity: null, baseUnit: null,
        });
        expect(r.ok).toBe(true);
        expect(r.totalBaseQuantity).toBe(7920);
        expect(r.baseUnit).toBe('ml');
    });
    it('multipack 6 × 1,5 L → 9000 ml', () => {
        const r = resolvePackaging({
            priceBasis: 'package', packCount: '6', contentPerItemQuantity: '1.5',
            contentPerItemUnit: 'liter', totalBaseQuantity: null, baseUnit: null,
        });
        expect(r.totalBaseQuantity).toBe(9000);
        expect(r.baseUnit).toBe('ml');
    });
    it('enkelpak 2,5 kg → 2500 g', () => {
        const r = resolvePackaging({
            priceBasis: 'package', packCount: '1', contentPerItemQuantity: '2.5',
            contentPerItemUnit: 'kg', totalBaseQuantity: null, baseUnit: null,
        });
        expect(r.totalBaseQuantity).toBe(2500);
        expect(r.baseUnit).toBe('g');
    });
    it('expliciet totaal heeft voorrang', () => {
        const r = resolvePackaging({
            priceBasis: 'package', packCount: null, contentPerItemQuantity: null,
            contentPerItemUnit: null, totalBaseQuantity: '7920', baseUnit: 'ml',
        });
        expect(r.totalBaseQuantity).toBe(7920);
        expect(r.baseUnit).toBe('ml');
    });
    it('onbekende verpakking → AMBIGUOUS_PACKAGE', () => {
        const r = resolvePackaging({
            priceBasis: 'package', packCount: null, contentPerItemQuantity: null,
            contentPerItemUnit: null, totalBaseQuantity: null, baseUnit: null,
        });
        expect(r.ok).toBe(false);
        expect(r.codes).toContain('AMBIGUOUS_PACKAGE');
    });
});

describe('computeEffectivePrice — promo vs regulier', () => {
    it('promo lager → effectief = promo', () => {
        const r = computeEffectivePrice({ regularPriceExVat: '10.00', promoPriceExVat: '7.50' });
        expect(r.effectiveCents).toBe(750);
        expect(r.codes).not.toContain('PROMO_GT_REGULAR');
    });
    it('promo hoger dan regulier → val terug op regulier + code', () => {
        const r = computeEffectivePrice({ regularPriceExVat: '10.00', promoPriceExVat: '12.00' });
        expect(r.effectiveCents).toBe(1000);
        expect(r.codes).toContain('PROMO_GT_REGULAR');
    });
    it('alleen regulier', () => {
        const r = computeEffectivePrice({ regularPriceExVat: '18.95', promoPriceExVat: null });
        expect(r.effectiveCents).toBe(1895);
    });
    it('prijs ontbreekt → PRICE_NONPOSITIVE', () => {
        const r = computeEffectivePrice({ regularPriceExVat: null, promoPriceExVat: null });
        expect(r.effectiveCents).toBeNull();
        expect(r.codes).toContain('PRICE_NONPOSITIVE');
    });
});

/* ── De verplichte §14.2-voorbeelden: moeten EXACT slagen ──────────────────*/
describe('computePricing — briefing §14.2 exacte voorbeelden', () => {
    it('2,5 kg voor €22,50 per pak → €9,000000/kg', () => {
        const r = computePricing(baseInput({
            priceBasis: 'package', packCount: '1', contentPerItemQuantity: '2.5',
            contentPerItemUnit: 'kg', regularPriceExVat: '22.50',
        }));
        expect(r.ok).toBe(true);
        expect(r.effectivePriceCents).toBe(2250);
        expect(r.pricePerKg).toBe(9);
        expect(r.totalBaseQuantity).toBe(2500);
        expect(r.baseUnit).toBe('g');
    });
    it('24 × 330 ml voor €18,96 per doos → €2,393939/L', () => {
        const r = computePricing(baseInput({
            priceBasis: 'package', packCount: '24', contentPerItemQuantity: '330',
            contentPerItemUnit: 'ml', regularPriceExVat: '18.96',
        }));
        expect(r.ok).toBe(true);
        expect(r.totalBaseQuantity).toBe(7920);
        expect(r.pricePerLiter).toBe(2.393939);
    });
    it('12 stuks voor €5,04 → €0,420000/stuk', () => {
        const r = computePricing(baseInput({
            priceBasis: 'package', packCount: '12', contentPerItemQuantity: '1',
            contentPerItemUnit: 'piece', regularPriceExVat: '5.04',
        }));
        expect(r.ok).toBe(true);
        expect(r.pricePerPiece).toBe(0.42);
        expect(r.totalBaseQuantity).toBe(12);
        expect(r.baseUnit).toBe('piece');
    });
    it('6 × 1,5 L voor €13,50 → €1,500000/L', () => {
        const r = computePricing(baseInput({
            priceBasis: 'package', packCount: '6', contentPerItemQuantity: '1.5',
            contentPerItemUnit: 'liter', regularPriceExVat: '13.50',
        }));
        expect(r.pricePerLiter).toBe(1.5);
        expect(r.totalBaseQuantity).toBe(9000);
    });
    it('750 g voor €8,25 → €11,000000/kg', () => {
        const r = computePricing(baseInput({
            priceBasis: 'package', packCount: '1', contentPerItemQuantity: '750',
            contentPerItemUnit: 'g', regularPriceExVat: '8.25',
        }));
        expect(r.pricePerKg).toBe(11);
    });
    it('zichtbaar €8,95/kg, variabel gewicht → priceBasis=kg, geen fictieve pakprijs', () => {
        const r = computePricing(baseInput({
            priceBasis: 'kg', regularPriceExVat: '8.95', variableWeight: true,
        }));
        expect(r.ok).toBe(true);
        expect(r.pricePerKg).toBe(8.95);
        expect(r.pricePerLiter).toBeNull();
        expect(r.pricePerPiece).toBeNull();
        expect(r.totalBaseQuantity).toBeNull(); // geen verzonnen pakinhoud
    });
    it('2 × 1 kg voor €18,95 → prijs is 18,95 (niet 2) → €9,475000/kg', () => {
        const r = computePricing(baseInput({
            priceBasis: 'package', packCount: '2', contentPerItemQuantity: '1',
            contentPerItemUnit: 'kg', regularPriceExVat: '18.95',
        }));
        expect(r.effectivePriceCents).toBe(1895);
        expect(r.totalBaseQuantity).toBe(2000);
        expect(r.pricePerKg).toBe(9.475);
    });
    it('prijs op aanvraag → geen current price (niet ok)', () => {
        const r = computePricing(baseInput({
            priceBasis: 'package', packCount: '1', contentPerItemQuantity: '1',
            contentPerItemUnit: 'kg', regularPriceExVat: null,
        }));
        expect(r.ok).toBe(false);
        expect(r.pricePerKg).toBeNull();
        expect(r.codes).toContain('PRICE_NONPOSITIVE');
    });
    it('priceBasis=package maar verpakking onbekend → AMBIGUOUS_PACKAGE, niet ok', () => {
        const r = computePricing(baseInput({
            priceBasis: 'package', regularPriceExVat: '10.00',
        }));
        expect(r.ok).toBe(false);
        expect(r.codes).toContain('AMBIGUOUS_PACKAGE');
    });
    it('priceBasis=unknown → UNKNOWN_PRICE_BASIS, niet ok', () => {
        const r = computePricing(baseInput({
            priceBasis: 'unknown', regularPriceExVat: '10.00',
        }));
        expect(r.ok).toBe(false);
        expect(r.codes).toContain('UNKNOWN_PRICE_BASIS');
    });
    it('promo werkt door in de basisprijs', () => {
        const r = computePricing(baseInput({
            priceBasis: 'package', packCount: '1', contentPerItemQuantity: '2.5',
            contentPerItemUnit: 'kg', regularPriceExVat: '22.50', promoPriceExVat: '20.00',
        }));
        expect(r.effectivePriceCents).toBe(2000);
        expect(r.pricePerKg).toBe(8); // 20 / 2,5
    });
});

describe('pricePerUnitLabel', () => {
    it('formatteert de van toepassing zijnde eenheid', () => {
        expect(pricePerUnitLabel({ pricePerKg: 9, pricePerLiter: null, pricePerPiece: null })).toBe('€9,00 / kg');
        expect(pricePerUnitLabel({ pricePerKg: null, pricePerLiter: 2.39, pricePerPiece: null })).toBe('€2,39 / liter');
        expect(pricePerUnitLabel({ pricePerKg: null, pricePerLiter: null, pricePerPiece: 0.42 })).toBe('€0,42 / stuk');
    });
});

describe('round6', () => {
    it('rondt af op 6 decimalen', () => {
        expect(round6(18.96 / 7.92)).toBe(2.393939);
        expect(round6(9)).toBe(9);
    });
});
