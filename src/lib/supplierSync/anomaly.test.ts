import { describe, it, expect } from 'vitest';
import { decideValidation } from './anomaly';
import { computePricing, type PricingInput } from './pricing';
import { validateObservation } from './observationSchema';
import { validRawObservation } from './__testdata__/observation';

function obs(over: Record<string, unknown> = {}) {
    const r = validateObservation(validRawObservation(over));
    if (!r.value) throw new Error('fixture invalid: ' + r.errors.join(', '));
    return r.value;
}
function pricingFor(o: ReturnType<typeof obs>) {
    const input: PricingInput = {
        priceBasis: o.priceBasis, packCount: o.packCount, contentPerItemQuantity: o.contentPerItemQuantity,
        contentPerItemUnit: o.contentPerItemUnit, totalBaseQuantity: o.totalBaseQuantity, baseUnit: o.baseUnit,
        regularPriceExVat: o.regularPriceExVat, promoPriceExVat: o.promoPriceExVat, variableWeight: o.variableWeight,
    };
    return computePricing(input);
}

describe('decideValidation — harde reject', () => {
    it('geen bruikbare prijs → rejected', () => {
        const o = obs({ regularPriceExVat: null });
        const d = decideValidation(o, pricingFor(o));
        expect(d.status).toBe('rejected');
        expect(d.codes).toContain('PRICE_NONPOSITIVE');
    });
    it('prijs boven bovengrens → rejected', () => {
        const o = obs({ priceBasis: 'kg', regularPriceExVat: '100000.00' });
        const d = decideValidation(o, pricingFor(o));
        expect(d.status).toBe('rejected');
        expect(d.codes).toContain('PRICE_OUT_OF_RANGE');
    });
});

describe('decideValidation — quarantaine', () => {
    it('onbekende BTW-modus', () => {
        const o = obs({ taxMode: 'unknown' });
        const d = decideValidation(o, pricingFor(o));
        expect(d.status).toBe('quarantined');
        expect(d.codes).toContain('UNKNOWN_TAX_MODE');
    });
    it('onbekende verpakking (priceBasis=package zonder inhoud)', () => {
        const o = obs({ packCount: null, contentPerItemQuantity: null, contentPerItemUnit: null });
        const d = decideValidation(o, pricingFor(o));
        expect(d.status).toBe('quarantined');
        expect(d.codes).toContain('AMBIGUOUS_PACKAGE');
    });
    it('>20% prijsafwijking t.o.v. laatst goedgekeurd', () => {
        const o = obs(); // €22,50 pak → effectief 2250
        const d = decideValidation(o, pricingFor(o), { previousApprovedEffectiveCents: 1500 });
        expect(d.status).toBe('quarantined');
        expect(d.codes).toContain('PRICE_ANOMALY');
    });
    it('SKU met conflicterende verpakking', () => {
        const o = obs();
        const d = decideValidation(o, pricingFor(o), {
            previousPackVariantKey: 'pack:a', currentPackVariantKey: 'pack:b',
        });
        expect(d.codes).toContain('SKU_PACKAGE_CONFLICT');
    });
    it('EAN aan andere naam gekoppeld', () => {
        const o = obs();
        const d = decideValidation(o, pricingFor(o), { previousEanName: 'Heel ander product' });
        expect(d.codes).toContain('EAN_NAME_CONFLICT');
    });
    it('lage veldconfidence', () => {
        const o = obs({ fieldConfidence: { productName: 0.3 } });
        const d = decideValidation(o, pricingFor(o));
        expect(d.codes).toContain('LOW_CONFIDENCE');
    });
    it('fuzzy master-koppeling', () => {
        const o = obs();
        const d = decideValidation(o, pricingFor(o), { fuzzyMasterMatch: true });
        expect(d.codes).toContain('FUZZY_MASTER_MATCH');
    });
    it('AI-afgeleide waarneming is nooit auto-accepted', () => {
        const o = obs({ extractionMethod: 'ai_assisted' });
        const d = decideValidation(o, pricingFor(o));
        expect(d.status).toBe('quarantined');
    });
});

describe('decideValidation — accepted', () => {
    it('schone waarneming met SKU, bekende BTW, volledige verpakking, geen anomalie', () => {
        const o = obs();
        const d = decideValidation(o, pricingFor(o), { adapterKnownActive: true });
        expect(d.status).toBe('accepted');
        expect(d.codes).toEqual([]);
    });
    it('kleine prijswijziging (<20%) blijft accepted', () => {
        const o = obs();
        const d = decideValidation(o, pricingFor(o), { previousApprovedEffectiveCents: 2100, adapterKnownActive: true });
        expect(d.status).toBe('accepted');
    });
});
