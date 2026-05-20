import { describe, it, expect } from 'vitest';
import { formatEur, formatEurInt, formatNumber, formatKm, formatPercent } from './format';

/* Note: NL-locale-tests gebruiken ` ` (non-breaking space) waar
   Intl.NumberFormat dat invoegt tussen €-symbool en getal. */
const NBSP = ' ';

describe('formatEur', () => {
    it('formatteert hele bedragen met 2 decimalen', () => {
        expect(formatEur(1234)).toBe('€' + NBSP + '1.234,00');
    });

    it('formatteert bedragen met cent-precisie', () => {
        expect(formatEur(1234.56)).toBe('€' + NBSP + '1.234,56');
    });

    it('rondt af op 2 decimalen', () => {
        expect(formatEur(1234.567)).toBe('€' + NBSP + '1.234,57');
    });

    it('handelt null/undefined als 0', () => {
        expect(formatEur(null)).toBe('€' + NBSP + '0,00');
        expect(formatEur(undefined)).toBe('€' + NBSP + '0,00');
    });

    it('handelt negatieve bedragen', () => {
        /* Intl NL-locale plaatst minteken na het symbool: `€ -100,00`. */
        expect(formatEur(-100)).toBe('€' + NBSP + '-100,00');
    });
});

describe('formatEurInt', () => {
    it('rondt af op hele euro\'s', () => {
        expect(formatEurInt(1234.56)).toBe('€' + NBSP + '1.235');
    });

    it('formatteert grote bedragen met thousand-separator', () => {
        expect(formatEurInt(123456)).toBe('€' + NBSP + '123.456');
    });

    it('handelt null/undefined als 0', () => {
        expect(formatEurInt(null)).toBe('€' + NBSP + '0');
    });
});

describe('formatNumber', () => {
    it('formatteert met NL-thousand-separator zonder decimalen', () => {
        expect(formatNumber(1234)).toBe('1.234');
    });

    it('formatteert met opgegeven decimalen', () => {
        expect(formatNumber(1234.5, 1)).toBe('1.234,5');
    });
});

describe('formatKm', () => {
    it('voegt " km" toe en gebruikt 1 decimaal default', () => {
        expect(formatKm(123.45)).toBe('123,5 km');
    });

    it('accepteert decimals-override', () => {
        expect(formatKm(123.456, 2)).toBe('123,46 km');
    });

    it('handelt null als 0', () => {
        expect(formatKm(null)).toBe('0,0 km');
    });
});

describe('formatPercent', () => {
    it('voegt %-suffix toe met 1 decimaal default', () => {
        expect(formatPercent(12.5)).toBe('12,5%');
    });

    it('accepteert decimals-override', () => {
        expect(formatPercent(12.345, 2)).toBe('12,35%');
    });
});
