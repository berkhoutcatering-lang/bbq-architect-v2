import { describe, expect, it } from 'vitest';
import { calcLineTotals, discountBaseExcl, recalculateDiscountLines, formatMoneyInput, parseMoneyInput, priceExclFromIncl, priceInclFromExcl, roundMoney, roundToDecimals } from './utils';

describe('money helpers', () => {
    it('roundMoney rondt af op centen', () => {
        expect(roundMoney(12.345)).toBe(12.35);
        expect(roundMoney(12.344)).toBe(12.34);
    });

    it('roundMoney behandelt lege of ongeldige input als 0', () => {
        expect(roundMoney(null)).toBe(0);
        expect(roundMoney(undefined)).toBe(0);
        expect(roundMoney('geen bedrag')).toBe(0);
    });

    it('parseMoneyInput leest komma en punt als decimaalteken', () => {
        expect(parseMoneyInput('38,50')).toBe(38.5);
        expect(parseMoneyInput('38.50')).toBe(38.5);
        expect(parseMoneyInput('38,')).toBe(38);
        expect(parseMoneyInput('38.')).toBe(38);
    });

    it('parseMoneyInput ondersteunt bedragen met thousand-separators', () => {
        expect(parseMoneyInput('1.234,56')).toBe(1234.56);
        expect(parseMoneyInput('1,234.56')).toBe(1234.56);
    });

    it('formatMoneyInput toont geldbedragen met Nederlandse komma', () => {
        expect(formatMoneyInput(38.5)).toBe('38,50');
        expect(formatMoneyInput('38.50')).toBe('38,50');
    });

    it('roundToDecimals ondersteunt preciezere interne verkoopprijzen', () => {
        expect(roundToDecimals(28.9256198347, 6)).toBe(28.92562);
    });

    it('rekent exclusief naar inclusief btw voor 9%, 21% en 0%', () => {
        expect(priceInclFromExcl(35, 9)).toBe(38.15);
        expect(priceInclFromExcl(35, 21)).toBe(42.35);
        expect(priceInclFromExcl(35, 0)).toBe(35);
    });

    it('rekent inclusief naar exclusief btw voor 9%, 21% en 0%', () => {
        expect(priceExclFromIncl(35, 9)).toBe(32.11);
        expect(priceExclFromIncl(35, 21)).toBe(28.93);
        expect(priceExclFromIncl(35, 0)).toBe(35);
    });

    it('dekt het offertevoorbeeld: 43 keer 35 exclusief met 9% btw', () => {
        const excl = 35;
        const qty = 43;
        const btw = 9;
        const subtotal = roundMoney(qty * excl);
        const btwAmount = roundMoney(subtotal * (btw / 100));

        expect(priceInclFromExcl(excl, btw)).toBe(38.15);
        expect(subtotal).toBe(1505);
        expect(btwAmount).toBe(135.45);
        expect(roundMoney(subtotal + btwAmount)).toBe(1640.45);
    });

    it('dekt het offertevoorbeeld: 43 keer 35 inclusief met 9% btw', () => {
        const incl = 35;
        const qty = 43;
        const btw = 9;
        const excl = priceExclFromIncl(incl, btw, 6);
        const subtotal = roundMoney(qty * excl);
        const btwAmount = roundMoney(subtotal * (btw / 100));

        expect(excl).toBe(32.110092);
        expect(priceInclFromExcl(excl, btw)).toBe(35);
        expect(roundMoney(subtotal + btwAmount)).toBe(1505);
    });

    it('houdt 35,00 inclusief op 21% vast zonder terug te springen naar 35,01', () => {
        const excl = priceExclFromIncl(35, 21, 6);

        expect(excl).toBe(28.92562);
        expect(priceInclFromExcl(excl, 21)).toBe(35);
    });

    it('rekent een euro-korting als aparte negatieve regel', () => {
        const items = recalculateDiscountLines([
            { desc: 'BBQ menu', qty: 2, prijs: 50, btw: 9 },
            { desc: 'Korting', qty: 1, prijs: 0, btw: 0, type: 'discount', discount_type: 'amount', discount_value: '12,50' },
        ]);

        expect(items[1].prijs).toBe(-12.5);
        expect(calcLineTotals(items).subtotaal).toBe(87.5);
        expect(calcLineTotals(items).btw).toBe(9);
        expect(calcLineTotals(items).totaal).toBe(96.5);
    });

    it('rekent een procent-korting over normale regels exclusief btw', () => {
        const items = recalculateDiscountLines([
            { desc: 'BBQ menu', qty: 4, prijs: 25, btw: 9 },
            { desc: 'Staffelkorting', qty: 1, prijs: 0, btw: 0, type: 'discount', discount_type: 'percent', discount_value: 10 },
        ]);

        expect(discountBaseExcl(items)).toBe(100);
        expect(items[1].prijs).toBe(-10);
        expect(calcLineTotals(items).subtotaal).toBe(90);
        expect(calcLineTotals(items).btw).toBe(9);
        expect(calcLineTotals(items).totaal).toBe(99);
    });
});
