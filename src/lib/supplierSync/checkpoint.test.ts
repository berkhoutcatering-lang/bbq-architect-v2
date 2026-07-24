import { describe, it, expect } from 'vitest';
import { buildCheckpointDecisions, type CheckpointScope, type PriorInfo } from './checkpoint';
import { validRawObservation } from './__testdata__/observation';

const scope: CheckpointScope = {
    organizationId: 'org-1',
    supplierId: 42,
    supplierAccountKey: 'sha256:acct',
    adapterKnownActive: true,
};

describe('buildCheckpointDecisions — accepted', () => {
    it('schone 2,5 kg €22,50 → accepted met correcte prijs + snake_case observation', () => {
        const { decisions, summary } = buildCheckpointDecisions([validRawObservation()], scope);
        expect(summary.accepted).toBe(1);
        const d = decisions[0];
        expect(d.validation_status).toBe('accepted');
        expect(d.identity_key).toMatch(/^[0-9a-f]{64}$/);
        expect(d.observation.supplier_id).toBe(42);
        expect(d.observation.product_url).toBe('https://www.baktotaal.nl/product/rookmot-2500');
        expect(d.observation.source).toBe('extension');
        expect(d.price).not.toBeNull();
        expect(d.price!.effective_price_cents).toBe(2250);
        expect(d.price!.price_per_kg_ex_vat).toBe(9);
        expect(d.price!.effective_price_ex_vat).toBe('22.50');
        expect(d.price!.unit).toBe('kg');
    });

    it('variabel gewicht €8,95/kg → accepted, price_cents = per-kg, geen pak', () => {
        const raw = validRawObservation({
            priceBasis: 'kg', variableWeight: true, regularPriceExVat: '8.95',
            packCount: null, contentPerItemQuantity: null, contentPerItemUnit: null,
        });
        const { decisions } = buildCheckpointDecisions([raw], scope);
        const d = decisions[0];
        expect(d.validation_status).toBe('accepted');
        expect(d.price!.effective_price_cents).toBe(895);
        expect(d.price!.unit).toBe('kg');
        expect(d.price!.price_per_kg_ex_vat).toBe(8.95);
        expect(d.observation.total_base_quantity).toBeNull();
    });
});

describe('buildCheckpointDecisions — quarantined', () => {
    it('onbekende BTW → quarantined, geen prijs, review_payload gevuld', () => {
        const { decisions, summary } = buildCheckpointDecisions([validRawObservation({ taxMode: 'unknown' })], scope);
        expect(summary.quarantined).toBe(1);
        expect(decisions[0].validation_status).toBe('quarantined');
        expect(decisions[0].price).toBeNull();
        expect(decisions[0].validation_codes).toContain('UNKNOWN_TAX_MODE');
        expect(decisions[0].review_payload.productName).toBeTruthy();
    });

    it('>20% prijsafwijking t.o.v. prior → quarantined', () => {
        const prior = new Map<string, PriorInfo>();
        // bereken identity_key niet handmatig; forceer via een lage prior op álle identiteiten
        const { decisions } = buildCheckpointDecisions([validRawObservation()], scope);
        const idKey = decisions[0].identity_key!;
        prior.set(idKey, { effectiveCents: 1500 });
        const again = buildCheckpointDecisions([validRawObservation()], scope, prior);
        expect(again.decisions[0].validation_status).toBe('quarantined');
        expect(again.decisions[0].validation_codes).toContain('PRICE_ANOMALY');
    });
});

describe('buildCheckpointDecisions — rejected', () => {
    it('structureel ongeldige input → rejected, geen prijs', () => {
        const { decisions, summary } = buildCheckpointDecisions([{ garbage: true }], scope);
        expect(summary.rejected).toBe(1);
        expect(decisions[0].validation_status).toBe('rejected');
        expect(decisions[0].price).toBeNull();
        expect(decisions[0].observation.extraction_method).toBe('dom_adapter'); // gesaneerd
    });
    it('prijs op aanvraag → rejected (PRICE_NONPOSITIVE)', () => {
        const { decisions } = buildCheckpointDecisions([validRawObservation({ regularPriceExVat: null })], scope);
        expect(decisions[0].validation_status).toBe('rejected');
        expect(decisions[0].validation_codes).toContain('PRICE_NONPOSITIVE');
    });
});

describe('buildCheckpointDecisions — reconciliatie', () => {
    it('summary telt op tot het aantal waarnemingen', () => {
        const { summary } = buildCheckpointDecisions([
            validRawObservation(),                              // accepted
            validRawObservation({ taxMode: 'unknown' }),        // quarantined
            validRawObservation({ regularPriceExVat: null }),   // rejected
            { junk: 1 },                                        // rejected (invalid)
        ], scope);
        expect(summary.accepted + summary.quarantined + summary.rejected).toBe(4);
        expect(summary.accepted).toBe(1);
        expect(summary.quarantined).toBe(1);
        expect(summary.rejected).toBe(2);
    });
});
