import { describe, it, expect } from 'vitest';
import {
    FactuurSchema,
    FactuurItemSchema,
    FACTUUR_STATUSES,
} from './factuur';

describe('FactuurSchema', () => {
    it('accepteert minimale input (nummer + client_naam) en zet defaults', () => {
        const result = FactuurSchema.safeParse({
            nummer: '2026-001',
            client_naam: 'Familie Berkhout',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.nummer).toBe('2026-001');
            expect(result.data.status).toBe('concept');
            expect(result.data.client_adres).toBe('');
            expect(result.data.items).toEqual([]);
        }
    });

    it('weigert ontbrekende nummer (fiscaal verplicht)', () => {
        const result = FactuurSchema.safeParse({ client_naam: 'Jan' });
        expect(result.success).toBe(false);
    });

    it('weigert lege nummer', () => {
        const result = FactuurSchema.safeParse({ nummer: '', client_naam: 'Jan' });
        expect(result.success).toBe(false);
    });

    it('weigert nummer langer dan 50 chars', () => {
        const result = FactuurSchema.safeParse({
            nummer: 'F'.repeat(51),
            client_naam: 'Jan',
        });
        expect(result.success).toBe(false);
    });

    it('weigert lege client_naam', () => {
        const result = FactuurSchema.safeParse({ nummer: '2026-001', client_naam: '' });
        expect(result.success).toBe(false);
    });

    it('weigert ontbrekende client_naam', () => {
        const result = FactuurSchema.safeParse({ nummer: '2026-001' });
        expect(result.success).toBe(false);
    });

    it('weigert datum in slash-formaat', () => {
        const result = FactuurSchema.safeParse({
            nummer: '2026-001',
            client_naam: 'Jan',
            datum: '2026/06/15',
        });
        expect(result.success).toBe(false);
    });

    it('weigert vervaldatum in NL-formaat', () => {
        const result = FactuurSchema.safeParse({
            nummer: '2026-001',
            client_naam: 'Jan',
            vervaldatum: '15-06-2026',
        });
        expect(result.success).toBe(false);
    });

    it('weigert ongeldige status', () => {
        const result = FactuurSchema.safeParse({
            nummer: '2026-001',
            client_naam: 'Jan',
            status: 'paid',
        });
        expect(result.success).toBe(false);
    });

    it('accepteert alle 6 gedocumenteerde status-waarden', () => {
        for (const status of FACTUUR_STATUSES) {
            const result = FactuurSchema.safeParse({
                nummer: '2026-001',
                client_naam: 'Jan',
                status,
            });
            expect(result.success, `status=${status}`).toBe(true);
        }
    });

    it('id accepteert UUID + integer + coerced number-string', () => {
        const a = FactuurSchema.safeParse({
            id: '550e8400-e29b-41d4-a716-446655440000',
            nummer: 'F1', client_naam: 'Jan',
        });
        const b = FactuurSchema.safeParse({ id: 42, nummer: 'F1', client_naam: 'Jan' });
        const c = FactuurSchema.safeParse({ id: '42', nummer: 'F1', client_naam: 'Jan' });
        expect(a.success && b.success && c.success).toBe(true);
        if (b.success && c.success) {
            expect(b.data.id).toBe(42);
            expect(c.data.id).toBe(42);
        }
    });

    it('strip-modus dropt onbekende velden (security: voorkomt organization_id-injectie)', () => {
        const result = FactuurSchema.safeParse({
            nummer: '2026-001',
            client_naam: 'Jan',
            organization_id: 'andere-tenant-id',
            user_id: 'gemanipuleerde-id',
        } as unknown);
        expect(result.success).toBe(true);
        if (result.success) {
            expect((result.data as Record<string, unknown>).organization_id).toBeUndefined();
            expect((result.data as Record<string, unknown>).user_id).toBeUndefined();
        }
    });

    it('accepteert volledige happy-path input', () => {
        const result = FactuurSchema.safeParse({
            nummer: '2026-042',
            client_naam: 'Familie Berkhout',
            client_adres: 'Dorpsstraat 1, 1234 AB Amsterdam',
            datum: '2026-06-15',
            vervaldatum: '2026-07-15',
            status: 'verzonden',
            items: [
                { desc: 'Pulled pork burger', qty: 25, prijs: 8.50, btw: 9 },
                { desc: 'Bediening 4 uur', qty: 4, prijs: 35, btw: 21 },
            ],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.items).toHaveLength(2);
            expect(result.data.items[0]?.btw).toBe(9);
        }
    });
});

describe('FactuurItemSchema', () => {
    it('accepteert lege input met defaults (desc="", qty=0, prijs=0, btw=21)', () => {
        const result = FactuurItemSchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.desc).toBe('');
            expect(result.data.qty).toBe(0);
            expect(result.data.prijs).toBe(0);
            expect(result.data.btw).toBe(21);
        }
    });

    it('weigert negatieve qty', () => {
        const result = FactuurItemSchema.safeParse({ qty: -1 });
        expect(result.success).toBe(false);
    });

    it('weigert negatieve prijs', () => {
        const result = FactuurItemSchema.safeParse({ prijs: -10 });
        expect(result.success).toBe(false);
    });

    it('weigert btw boven 100%', () => {
        const result = FactuurItemSchema.safeParse({ btw: 150 });
        expect(result.success).toBe(false);
    });

    it('weigert negatieve btw', () => {
        const result = FactuurItemSchema.safeParse({ btw: -5 });
        expect(result.success).toBe(false);
    });

    it('accepteert btw=0 (vrijgestelde post)', () => {
        const result = FactuurItemSchema.safeParse({ desc: 'BTW-vrij', btw: 0 });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.btw).toBe(0);
        }
    });

    it('coerced qty + prijs van string-numbers', () => {
        const result = FactuurItemSchema.safeParse({ qty: '5', prijs: '12.50', btw: '9' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.qty).toBe(5);
            expect(result.data.prijs).toBe(12.5);
            expect(result.data.btw).toBe(9);
        }
    });

    it('weigert desc langer dan 500 chars', () => {
        const result = FactuurItemSchema.safeParse({ desc: 'x'.repeat(501) });
        expect(result.success).toBe(false);
    });
});

describe('FACTUUR_STATUSES', () => {
    it('exporteert exact 6 statussen in vaste volgorde', () => {
        expect(FACTUUR_STATUSES).toEqual([
            'concept', 'verzonden', 'betaald', 'verlopen', 'vervallen', 'geannuleerd',
        ]);
    });
});
