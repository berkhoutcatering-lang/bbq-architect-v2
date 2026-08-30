import { describe, it, expect } from 'vitest';
import { KlantSchema } from './klant';

describe('KlantSchema', () => {
    it('accepteert minimale input (alleen naam)', () => {
        const result = KlantSchema.safeParse({ naam: 'Jan Jansen' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.naam).toBe('Jan Jansen');
            /* Defaults vullen alle optionele velden met lege string. */
            expect(result.data.bedrijf).toBe('');
            expect(result.data.email).toBe('');
        }
    });

    it('weigert lege naam', () => {
        const result = KlantSchema.safeParse({ naam: '' });
        expect(result.success).toBe(false);
    });

    it('weigert ontbrekende naam', () => {
        const result = KlantSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('weigert naam langer dan 200 chars', () => {
        const result = KlantSchema.safeParse({ naam: 'a'.repeat(201) });
        expect(result.success).toBe(false);
    });

    it('accepteert lege email', () => {
        const result = KlantSchema.safeParse({ naam: 'Jan', email: '' });
        expect(result.success).toBe(true);
    });

    it('accepteert geldige email', () => {
        const result = KlantSchema.safeParse({ naam: 'Jan', email: 'jan@example.nl' });
        expect(result.success).toBe(true);
    });

    it('weigert ongeldige email', () => {
        const result = KlantSchema.safeParse({ naam: 'Jan', email: 'niet-een-email' });
        expect(result.success).toBe(false);
        if (!result.success) {
            const emailErrors = result.error.flatten().fieldErrors.email;
            expect(emailErrors).toBeDefined();
            expect(emailErrors?.[0]).toContain('Ongeldig');
        }
    });

    it('id accepteert UUID-string', () => {
        const result = KlantSchema.safeParse({
            id: '550e8400-e29b-41d4-a716-446655440000',
            naam: 'Jan',
        });
        expect(result.success).toBe(true);
    });

    it('id accepteert integer-id', () => {
        const result = KlantSchema.safeParse({ id: 42, naam: 'Jan' });
        expect(result.success).toBe(true);
    });

    it('id coerced van string-number naar number', () => {
        const result = KlantSchema.safeParse({ id: '42', naam: 'Jan' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.id).toBe(42);
        }
    });

    it('weigert ongeldige id-shape', () => {
        const result = KlantSchema.safeParse({ id: { wat: 'is dit' }, naam: 'Jan' });
        expect(result.success).toBe(false);
    });

    it('strip onbekende velden in strip-modus (default)', () => {
        const result = KlantSchema.safeParse({
            naam: 'Jan',
            organization_id: 'gemanipuleerde-id',  // niet in schema
            tier: 'enterprise',                     // niet in schema
            unknown_field: 'foo',
        } as unknown);
        expect(result.success).toBe(true);
        if (result.success) {
            expect((result.data as Record<string, unknown>).organization_id).toBeUndefined();
            expect((result.data as Record<string, unknown>).tier).toBeUndefined();
            expect((result.data as Record<string, unknown>).unknown_field).toBeUndefined();
        }
    });

    it('weigert notities langer dan 5000 chars', () => {
        const result = KlantSchema.safeParse({
            naam: 'Jan',
            notities: 'x'.repeat(5001),
        });
        expect(result.success).toBe(false);
    });

    it('accepteert volledige input', () => {
        const result = KlantSchema.safeParse({
            naam: 'Jan Jansen',
            bedrijf: 'Jansen B.V.',
            adres: 'Dorpsstraat 1',
            postcode: '1234 AB',
            plaats: 'Amsterdam',
            telefoon: '06-12345678',
            email: 'jan@jansen.nl',
            type: 'Bedrijf',
            notities: 'Vaste klant sinds 2024',
        });
        expect(result.success).toBe(true);
    });
});
