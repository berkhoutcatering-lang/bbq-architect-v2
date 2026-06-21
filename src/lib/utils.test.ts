import { describe, expect, it } from 'vitest';
import { priceExclFromIncl, priceInclFromExcl, roundMoney, roundToDecimals } from './utils';

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
});
