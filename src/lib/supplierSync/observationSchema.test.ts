import { describe, it, expect } from 'vitest';
import { validateObservation, LIMITS } from './observationSchema';
import { validRawObservation } from './__testdata__/observation';

describe('validateObservation — happy path', () => {
    it('accepteert een structureel geldige waarneming en trimt', () => {
        const r = validateObservation(validRawObservation({ productName: '  Rookmot  ' }));
        expect(r.ok).toBe(true);
        expect(r.value?.productName).toBe('Rookmot');
        expect(r.value?.supplierSku).toBe('BT-12345');
        expect(r.value?.currency).toBe('EUR');
    });
});

describe('validateObservation — additionalProperties:false', () => {
    it('weigert onbekende top-level velden', () => {
        const r = validateObservation(validRawObservation({ evilField: 'x' }));
        expect(r.ok).toBe(false);
        expect(r.codes).toContain('INVALID_OBSERVATION');
        expect(r.errors.join(' ')).toContain('evilField');
    });
    it('weigert niet-object', () => {
        expect(validateObservation(null).ok).toBe(false);
        expect(validateObservation('str').ok).toBe(false);
        expect(validateObservation([]).ok).toBe(false);
    });
});

describe('validateObservation — direct reject regels §15', () => {
    it('ontbrekende productnaam', () => {
        const r = validateObservation(validRawObservation({ productName: '   ' }));
        expect(r.codes).toContain('MISSING_PRODUCT_NAME');
    });
    it('malformed URL', () => {
        const r = validateObservation(validRawObservation({ productUrl: 'javascript:alert(1)' }));
        expect(r.codes).toContain('MALFORMED_URL');
    });
    it('ongeldige currency', () => {
        const r = validateObservation(validRawObservation({ currency: 'USD' }));
        expect(r.codes).toContain('INVALID_CURRENCY');
    });
    it('ontbrekende adapterversie', () => {
        const r = validateObservation(validRawObservation({ adapterVersion: '' }));
        expect(r.codes).toContain('MISSING_ADAPTER_VERSION');
    });
    it('ongeldig getal', () => {
        const r = validateObservation(validRawObservation({ regularPriceExVat: 'gratis' }));
        expect(r.codes).toContain('INVALID_NUMBER');
    });
    it('geen stabiele identiteit (geen sku/ean/url)', () => {
        const r = validateObservation(validRawObservation({ supplierSku: null, ean: null, productUrl: 'not a url' }));
        expect(r.ok).toBe(false);
        // malformed URL wint als eerste guard; identiteit is de vangnet-check
        expect(r.codes.some((c) => c === 'MALFORMED_URL' || c === 'MISSING_STABLE_IDENTITY')).toBe(true);
    });
});

describe('validateObservation — enums', () => {
    it('ongeldige taxMode', () => {
        expect(validateObservation(validRawObservation({ taxMode: 'maybe' })).ok).toBe(false);
    });
    it('ongeldige priceBasis', () => {
        expect(validateObservation(validRawObservation({ priceBasis: 'per_ton' })).ok).toBe(false);
    });
    it('ongeldige contentPerItemUnit', () => {
        expect(validateObservation(validRawObservation({ contentPerItemUnit: 'gallon' })).ok).toBe(false);
    });
    it('vatPct null is toegestaan', () => {
        expect(validateObservation(validRawObservation({ vatPct: null })).ok).toBe(true);
    });
    it('taxMode unknown is structureel geldig (anomaly quarantainet later)', () => {
        expect(validateObservation(validRawObservation({ taxMode: 'unknown' })).ok).toBe(true);
    });
});

describe('validateObservation — security / limieten', () => {
    it('weigert verboden sleutels in rawRecord (geen secrets §18)', () => {
        const r = validateObservation(validRawObservation({ rawRecord: { cookie: 'session=abc' } }));
        expect(r.ok).toBe(false);
        expect(r.errors.join(' ')).toContain('cookie');
    });
    it('weigert Authorization/token-achtige sleutels', () => {
        expect(validateObservation(validRawObservation({ rawRecord: { authorization: 'Bearer x' } })).ok).toBe(false);
        expect(validateObservation(validRawObservation({ rawRecord: { csrf_token: 'x' } })).ok).toBe(false);
    });
    it('weigert te grote rawRecord (payload limiet)', () => {
        const big = { blob: 'x'.repeat(LIMITS.rawRecordBytesMax + 100) };
        const r = validateObservation(validRawObservation({ rawRecord: big }));
        expect(r.codes).toContain('PAYLOAD_TOO_LARGE');
    });
    it('weigert te lange productnaam', () => {
        const r = validateObservation(validRawObservation({ productName: 'x'.repeat(LIMITS.productNameMax + 1) }));
        expect(r.codes).toContain('PAYLOAD_TOO_LARGE');
    });
    it('weigert fieldConfidence buiten [0,1]', () => {
        expect(validateObservation(validRawObservation({ fieldConfidence: { x: 1.5 } })).ok).toBe(false);
    });
});
