import { describe, it, expect } from 'vitest';
import {
    OfferteSchema,
    OfferteItemSchema,
    VasteKostenSchema,
} from './offerte';

describe('OfferteSchema', () => {
    it('accepteert minimale input (client_naam + datum) en zet defaults', () => {
        const result = OfferteSchema.safeParse({
            client_naam: 'Familie Berkhout',
            datum: '2026-06-15',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.client_naam).toBe('Familie Berkhout');
            expect(result.data.status).toBe('concept');
            expect(result.data.items).toEqual([]);
            expect(result.data.vaste_kosten).toEqual([]);
            expect(result.data.aantal_gasten).toBe(0);
            expect(result.data.basis_prijs_pp).toBe(0);
        }
    });

    it('weigert lege client_naam', () => {
        const result = OfferteSchema.safeParse({
            client_naam: '',
            datum: '2026-06-15',
        });
        expect(result.success).toBe(false);
    });

    it('weigert ontbrekende client_naam', () => {
        const result = OfferteSchema.safeParse({ datum: '2026-06-15' });
        expect(result.success).toBe(false);
    });

    it('weigert ontbrekende datum', () => {
        const result = OfferteSchema.safeParse({ client_naam: 'Jan' });
        expect(result.success).toBe(false);
    });

    it('weigert datum in slash-formaat', () => {
        const result = OfferteSchema.safeParse({
            client_naam: 'Jan',
            datum: '2026/06/15',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            const datumErrors = result.error.flatten().fieldErrors.datum;
            expect(datumErrors?.[0]).toContain('YYYY-MM-DD');
        }
    });

    it('weigert datum in NL-formaat (DD-MM-YYYY)', () => {
        const result = OfferteSchema.safeParse({
            client_naam: 'Jan',
            datum: '15-06-2026',
        });
        expect(result.success).toBe(false);
    });

    it('weigert ongeldige status', () => {
        const result = OfferteSchema.safeParse({
            client_naam: 'Jan',
            datum: '2026-06-15',
            status: 'unknown',
        });
        expect(result.success).toBe(false);
    });

    it('accepteert alle gedocumenteerde status-waarden', () => {
        const statuses = [
            'concept', 'verzonden', 'geaccepteerd', 'betaald',
            'geannuleerd', 'goedgekeurd', 'voltooid',
        ] as const;
        for (const status of statuses) {
            const result = OfferteSchema.safeParse({
                client_naam: 'Jan',
                datum: '2026-06-15',
                status,
            });
            expect(result.success, `status=${status}`).toBe(true);
        }
    });

    it('coerced aantal_gasten van string naar int', () => {
        const result = OfferteSchema.safeParse({
            client_naam: 'Jan',
            datum: '2026-06-15',
            aantal_gasten: '50',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.aantal_gasten).toBe(50);
        }
    });

    it('coerced basis_prijs_pp van string naar number', () => {
        const result = OfferteSchema.safeParse({
            client_naam: 'Jan',
            datum: '2026-06-15',
            basis_prijs_pp: '29.95',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.basis_prijs_pp).toBe(29.95);
        }
    });

    it('weigert negatieve basis_prijs_pp', () => {
        const result = OfferteSchema.safeParse({
            client_naam: 'Jan',
            datum: '2026-06-15',
            basis_prijs_pp: -10,
        });
        expect(result.success).toBe(false);
    });

    it('id accepteert UUID-string', () => {
        const result = OfferteSchema.safeParse({
            id: '550e8400-e29b-41d4-a716-446655440000',
            client_naam: 'Jan',
            datum: '2026-06-15',
        });
        expect(result.success).toBe(true);
    });

    it('id accepteert integer en coerced number-string', () => {
        const a = OfferteSchema.safeParse({ id: 42, client_naam: 'Jan', datum: '2026-06-15' });
        const b = OfferteSchema.safeParse({ id: '42', client_naam: 'Jan', datum: '2026-06-15' });
        expect(a.success).toBe(true);
        expect(b.success).toBe(true);
        if (a.success && b.success) {
            expect(a.data.id).toBe(42);
            expect(b.data.id).toBe(42);
        }
    });

    it('klant_id mag null zijn (los-staande klant zonder DB-koppeling)', () => {
        const result = OfferteSchema.safeParse({
            client_naam: 'Walk-in',
            datum: '2026-06-15',
            klant_id: null,
        });
        expect(result.success).toBe(true);
    });

    it('passthrough behoudt onbekende velden (geldig_tot, public_token, verzonden_op)', () => {
        const result = OfferteSchema.safeParse({
            client_naam: 'Jan',
            datum: '2026-06-15',
            geldig_tot: '2026-07-15',
            public_token: 'abc-123-token',
            verzonden_op: '2026-06-01T10:00:00Z',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            const data = result.data as Record<string, unknown>;
            expect(data.geldig_tot).toBe('2026-07-15');
            expect(data.public_token).toBe('abc-123-token');
            expect(data.verzonden_op).toBe('2026-06-01T10:00:00Z');
        }
    });

    it('weigert notities langer dan 10_000 chars', () => {
        const result = OfferteSchema.safeParse({
            client_naam: 'Jan',
            datum: '2026-06-15',
            notities: 'x'.repeat(10_001),
        });
        expect(result.success).toBe(false);
    });

    it('accepteert volledige happy-path input met items + vaste_kosten + menu_selectie', () => {
        const result = OfferteSchema.safeParse({
            client_naam: 'Familie Berkhout',
            klant_id: 7,
            datum: '2026-06-15',
            aantal_gasten: 25,
            basis_prijs_pp: 32.50,
            status: 'verzonden',
            items: [
                { beschrijving: 'Pulled pork burger', qty: 25, prijs: 8.50, btw_category: 'food_catering' },
                { beschrijving: 'Bediening', qty: 4, prijs: 35, btw_category: 'service_personnel' },
            ],
            vaste_kosten: [
                { naam: 'Reiskosten', bedrag: 45 },
            ],
            menu_selectie: { hoofdgang: ['Pulled pork'], bijgerecht: ['Coleslaw'] },
            notities: 'Allergie: lactose-intolerantie bij 1 gast',
        });
        expect(result.success).toBe(true);
    });
});

describe('OfferteItemSchema', () => {
    it('weigert negatieve qty', () => {
        const result = OfferteItemSchema.safeParse({
            beschrijving: 'Test',
            qty: -1,
            prijs: 10,
        });
        expect(result.success).toBe(false);
    });

    it('accepteert negatieve prijs voor kortingsregels', () => {
        const result = OfferteItemSchema.safeParse({
            beschrijving: 'Korting trouwe klant',
            qty: 1,
            prijs: -5,
        });
        expect(result.success).toBe(true);
    });

    it('weigert ongeldige btw_category', () => {
        const result = OfferteItemSchema.safeParse({
            beschrijving: 'Test',
            qty: 1,
            prijs: 10,
            btw_category: 'btw_high',
        });
        expect(result.success).toBe(false);
    });

    it('accepteert geldige btw_category', () => {
        const result = OfferteItemSchema.safeParse({
            beschrijving: 'Pulled pork',
            qty: 1,
            prijs: 10,
            btw_category: 'food_catering',
        });
        expect(result.success).toBe(true);
    });

    it('btw_category is optioneel (AI-suggesties zijn niet verplicht)', () => {
        const result = OfferteItemSchema.safeParse({
            beschrijving: 'Iets',
            qty: 1,
            prijs: 10,
        });
        expect(result.success).toBe(true);
    });
});

describe('VasteKostenSchema', () => {
    it('coerced bedrag van string-number', () => {
        const result = VasteKostenSchema.safeParse({ naam: 'Transport', bedrag: '45.00' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.bedrag).toBe(45);
        }
    });

    it('accepteert negatief bedrag (korting-post)', () => {
        /* VasteKostenSchema heeft geen nonnegative-check — een korting
           als negatieve "vaste kost" moet kunnen. */
        const result = VasteKostenSchema.safeParse({ naam: 'Korting trouwe klant', bedrag: -25 });
        expect(result.success).toBe(true);
    });

    it('weigert lange naam (>200 chars)', () => {
        const result = VasteKostenSchema.safeParse({ naam: 'x'.repeat(201), bedrag: 10 });
        expect(result.success).toBe(false);
    });
});
