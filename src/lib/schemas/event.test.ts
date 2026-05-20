import { describe, it, expect } from 'vitest';
import { EventSchema, EVENT_STATUSES } from './event';

describe('EventSchema', () => {
    it('accepteert minimale input (name + date + guests) en zet defaults', () => {
        const result = EventSchema.safeParse({
            name: 'BBQ Familie Berkhout',
            date: '2026-06-15',
            guests: 25,
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.name).toBe('BBQ Familie Berkhout');
            expect(result.data.status).toBe('concept');
            expect(result.data.guests).toBe(25);
        }
    });

    it('weigert lege name', () => {
        const result = EventSchema.safeParse({ name: '', date: '2026-06-15', guests: 25 });
        expect(result.success).toBe(false);
    });

    it('weigert ontbrekende name', () => {
        const result = EventSchema.safeParse({ date: '2026-06-15', guests: 25 });
        expect(result.success).toBe(false);
    });

    it('weigert ontbrekende date', () => {
        const result = EventSchema.safeParse({ name: 'Test', guests: 25 });
        expect(result.success).toBe(false);
    });

    it('weigert datum in slash-formaat', () => {
        const result = EventSchema.safeParse({ name: 'Test', date: '2026/06/15', guests: 25 });
        expect(result.success).toBe(false);
    });

    it('weigert datum in NL-formaat', () => {
        const result = EventSchema.safeParse({ name: 'Test', date: '15-06-2026', guests: 25 });
        expect(result.success).toBe(false);
    });

    it('weigert negatieve guests', () => {
        const result = EventSchema.safeParse({ name: 'Test', date: '2026-06-15', guests: -1 });
        expect(result.success).toBe(false);
    });

    it('weigert guests boven 10_000 (waarschijnlijk typfout)', () => {
        const result = EventSchema.safeParse({ name: 'Test', date: '2026-06-15', guests: 10_001 });
        expect(result.success).toBe(false);
    });

    it('weigert ontbrekende guests', () => {
        const result = EventSchema.safeParse({ name: 'Test', date: '2026-06-15' });
        expect(result.success).toBe(false);
    });

    it('coerced guests van string-int', () => {
        const result = EventSchema.safeParse({ name: 'Test', date: '2026-06-15', guests: '50' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.guests).toBe(50);
        }
    });

    it('weigert ongeldige status', () => {
        const result = EventSchema.safeParse({
            name: 'Test', date: '2026-06-15', guests: 25, status: 'paid',
        });
        expect(result.success).toBe(false);
    });

    it('accepteert alle 5 NL-status-waarden', () => {
        for (const status of ['concept', 'pending', 'bevestigd', 'voltooid', 'geannuleerd'] as const) {
            const result = EventSchema.safeParse({
                name: 'Test', date: '2026-06-15', guests: 25, status,
            });
            expect(result.success, `status=${status}`).toBe(true);
        }
    });

    it('accepteert alle 3 legacy Engelse status-waarden', () => {
        for (const status of ['confirmed', 'completed', 'cancelled'] as const) {
            const result = EventSchema.safeParse({
                name: 'Test', date: '2026-06-15', guests: 25, status,
            });
            expect(result.success, `legacy status=${status}`).toBe(true);
        }
    });

    it('EVENT_STATUSES bevat exact 8 waarden (5 NL + 3 legacy)', () => {
        expect(EVENT_STATUSES).toHaveLength(8);
        expect(EVENT_STATUSES).toContain('concept');
        expect(EVENT_STATUSES).toContain('confirmed');
    });

    it('id accepteert UUID + integer + coerced number-string', () => {
        const a = EventSchema.safeParse({
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'Test', date: '2026-06-15', guests: 25,
        });
        const b = EventSchema.safeParse({
            id: 42, name: 'Test', date: '2026-06-15', guests: 25,
        });
        const c = EventSchema.safeParse({
            id: '42', name: 'Test', date: '2026-06-15', guests: 25,
        });
        expect(a.success && b.success && c.success).toBe(true);
    });

    it('client_email accepteert lege string (WhatsApp-only klanten)', () => {
        const result = EventSchema.safeParse({
            name: 'Test', date: '2026-06-15', guests: 25, client_email: '',
        });
        expect(result.success).toBe(true);
    });

    it('client_email weigert ongeldig adres', () => {
        const result = EventSchema.safeParse({
            name: 'Test', date: '2026-06-15', guests: 25, client_email: 'niet-een-email',
        });
        expect(result.success).toBe(false);
    });

    it('client_email accepteert geldig adres', () => {
        const result = EventSchema.safeParse({
            name: 'Test', date: '2026-06-15', guests: 25, client_email: 'jan@example.nl',
        });
        expect(result.success).toBe(true);
    });

    it('ppp mag null zijn (event zonder vaste prijs-per-persoon)', () => {
        const result = EventSchema.safeParse({
            name: 'Test', date: '2026-06-15', guests: 25, ppp: null,
        });
        expect(result.success).toBe(true);
    });

    it('weigert ppp negatief', () => {
        const result = EventSchema.safeParse({
            name: 'Test', date: '2026-06-15', guests: 25, ppp: -5,
        });
        expect(result.success).toBe(false);
    });

    it('organization_id moet UUID zijn als gegeven', () => {
        const ok = EventSchema.safeParse({
            name: 'Test', date: '2026-06-15', guests: 25,
            organization_id: '550e8400-e29b-41d4-a716-446655440000',
        });
        const bad = EventSchema.safeParse({
            name: 'Test', date: '2026-06-15', guests: 25,
            organization_id: 'niet-een-uuid',
        });
        expect(ok.success).toBe(true);
        expect(bad.success).toBe(false);
    });

    it('passthrough behoudt onbekende velden', () => {
        const result = EventSchema.safeParse({
            name: 'Test', date: '2026-06-15', guests: 25,
            prep_tasks_synced_at: '2026-06-01T10:00:00Z',
            event_hub_settings: { theme: 'dark' },
        });
        expect(result.success).toBe(true);
        if (result.success) {
            const data = result.data as Record<string, unknown>;
            expect(data.prep_tasks_synced_at).toBe('2026-06-01T10:00:00Z');
            expect(data.event_hub_settings).toEqual({ theme: 'dark' });
        }
    });

    it('accepteert menu en menu_selectie in 3 mogelijke shapes', () => {
        const objectShape = EventSchema.safeParse({
            name: 'Test', date: '2026-06-15', guests: 25,
            menu_selectie: { hoofdgang: ['Pulled pork'] },
        });
        const arrayShape = EventSchema.safeParse({
            name: 'Test', date: '2026-06-15', guests: 25,
            menu_selectie: [{ naam: 'Pulled pork' }],
        });
        const stringShape = EventSchema.safeParse({
            name: 'Test', date: '2026-06-15', guests: 25,
            menu_selectie: '{"hoofdgang":["Pulled pork"]}',
        });
        expect(objectShape.success && arrayShape.success && stringShape.success).toBe(true);
    });

    it('weigert notities langer dan 10_000 chars', () => {
        const result = EventSchema.safeParse({
            name: 'Test', date: '2026-06-15', guests: 25,
            notities: 'x'.repeat(10_001),
        });
        expect(result.success).toBe(false);
    });

    it('accepteert volledige happy-path input', () => {
        const result = EventSchema.safeParse({
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'Verjaardag Mathijs',
            date: '2026-08-12',
            guests: 30,
            ppp: 32.50,
            location: 'Tuin Berkhout, Schoonoord',
            client_naam: 'Familie Berkhout',
            client_email: 'mathijs@example.nl',
            client_telefoon: '06-12345678',
            type: 'Verjaardag',
            status: 'bevestigd',
            menu_selectie: { hoofdgang: ['Pulled pork', 'Brisket'] },
            notities: 'Lactose-intolerantie bij 2 gasten',
            organization_id: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(true);
    });
});
