import { describe, it, expect } from 'vitest';
import {
    GerechtSchema,
    RecipeStepSchema,
    GERECHT_STATUSES,
} from './gerecht';

describe('GerechtSchema', () => {
    it('accepteert minimale input (alleen naam) en zet defaults', () => {
        const result = GerechtSchema.safeParse({ naam: 'Pulled pork burger' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.naam).toBe('Pulled pork burger');
            expect(result.data.kostprijs_pp).toBe(0);
            expect(result.data.prijs_pp).toBe(0);
            expect(result.data.yield_personen).toBe(1);
            expect(result.data.status).toBe('actief');
            expect(result.data.tags).toEqual([]);
            expect(result.data.steps).toEqual([]);
        }
    });

    it('weigert lege naam', () => {
        const result = GerechtSchema.safeParse({ naam: '' });
        expect(result.success).toBe(false);
    });

    it('weigert ontbrekende naam', () => {
        const result = GerechtSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('weigert naam langer dan 200 chars', () => {
        const result = GerechtSchema.safeParse({ naam: 'x'.repeat(201) });
        expect(result.success).toBe(false);
    });

    it('weigert negatieve kostprijs_pp', () => {
        const result = GerechtSchema.safeParse({ naam: 'Test', kostprijs_pp: -1 });
        expect(result.success).toBe(false);
    });

    it('weigert negatieve prijs_pp', () => {
        const result = GerechtSchema.safeParse({ naam: 'Test', prijs_pp: -5 });
        expect(result.success).toBe(false);
    });

    it('coerced prijs_pp van string-number', () => {
        const result = GerechtSchema.safeParse({ naam: 'Test', prijs_pp: '12.95' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.prijs_pp).toBe(12.95);
        }
    });

    it('weigert yield_personen = 0', () => {
        const result = GerechtSchema.safeParse({ naam: 'Test', yield_personen: 0 });
        expect(result.success).toBe(false);
    });

    it('weigert negatieve yield_personen', () => {
        const result = GerechtSchema.safeParse({ naam: 'Test', yield_personen: -5 });
        expect(result.success).toBe(false);
    });

    it('weigert ongeldige status', () => {
        const result = GerechtSchema.safeParse({ naam: 'Test', status: 'archief' });
        expect(result.success).toBe(false);
    });

    it('accepteert alle 3 status-waarden', () => {
        for (const status of GERECHT_STATUSES) {
            const result = GerechtSchema.safeParse({ naam: 'Test', status });
            expect(result.success, `status=${status}`).toBe(true);
        }
    });

    it('GERECHT_STATUSES bevat exact 3 waarden', () => {
        expect(GERECHT_STATUSES).toEqual(['actief', 'inactief', 'concept']);
    });

    it('tags accepteert lege string-array', () => {
        const result = GerechtSchema.safeParse({ naam: 'Test', tags: [] });
        expect(result.success).toBe(true);
    });

    it('tags accepteert string-array', () => {
        const result = GerechtSchema.safeParse({
            naam: 'Test',
            tags: ['BBQ', 'low-sodium', 'glutenvrij'],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.tags).toEqual(['BBQ', 'low-sodium', 'glutenvrij']);
        }
    });

    it('weigert tag langer dan 50 chars', () => {
        const result = GerechtSchema.safeParse({ naam: 'Test', tags: ['x'.repeat(51)] });
        expect(result.success).toBe(false);
    });

    it('id accepteert UUID + integer + coerced number-string', () => {
        const a = GerechtSchema.safeParse({
            id: '550e8400-e29b-41d4-a716-446655440000',
            naam: 'Test',
        });
        const b = GerechtSchema.safeParse({ id: 42, naam: 'Test' });
        const c = GerechtSchema.safeParse({ id: '42', naam: 'Test' });
        expect(a.success && b.success && c.success).toBe(true);
    });

    it('strip-modus: allergens-veld wordt gedropt (hard rule 2: allergens NIET in schema)', () => {
        const result = GerechtSchema.safeParse({
            naam: 'Test',
            allergens: ['gluten', 'lactose'],
        } as unknown);
        expect(result.success).toBe(true);
        if (result.success) {
            expect((result.data as Record<string, unknown>).allergens).toBeUndefined();
        }
    });

    it('weigert beschrijving langer dan 5000 chars', () => {
        const result = GerechtSchema.safeParse({
            naam: 'Test',
            beschrijving: 'x'.repeat(5001),
        });
        expect(result.success).toBe(false);
    });

    it('accepteert volledige happy-path input', () => {
        const result = GerechtSchema.safeParse({
            id: 7,
            naam: 'Pulled pork burger',
            categorie: 'Hoofdgerecht',
            gang_slug: 'hoofdgang',
            beschrijving: '14 uur low-and-slow gerookt over kersenhout',
            kostprijs_pp: 3.85,
            prijs_pp: 12.95,
            yield_personen: 1,
            status: 'actief',
            tags: ['BBQ', 'signature'],
            steps: [
                { nr: 1, beschrijving: 'Rub aanbrengen', duration_min: 15 },
                { nr: 2, beschrijving: 'Roker op 110°C', duration_min: 5 },
                { nr: 3, beschrijving: 'Roken tot 96°C kern', duration_min: 840 },
            ],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.steps).toHaveLength(3);
        }
    });
});

describe('RecipeStepSchema', () => {
    it('accepteert minimale step (nr + beschrijving)', () => {
        const result = RecipeStepSchema.safeParse({ nr: 1, beschrijving: 'Rub aanbrengen' });
        expect(result.success).toBe(true);
    });

    it('weigert nr = 0', () => {
        const result = RecipeStepSchema.safeParse({ nr: 0, beschrijving: 'Test' });
        expect(result.success).toBe(false);
    });

    it('weigert negatieve nr', () => {
        const result = RecipeStepSchema.safeParse({ nr: -1, beschrijving: 'Test' });
        expect(result.success).toBe(false);
    });

    it('weigert decimale nr', () => {
        const result = RecipeStepSchema.safeParse({ nr: 1.5, beschrijving: 'Test' });
        expect(result.success).toBe(false);
    });

    it('weigert beschrijving langer dan 2000 chars', () => {
        const result = RecipeStepSchema.safeParse({ nr: 1, beschrijving: 'x'.repeat(2001) });
        expect(result.success).toBe(false);
    });

    it('weigert photo_url die geen geldige URL is', () => {
        const result = RecipeStepSchema.safeParse({
            nr: 1, beschrijving: 'Test', photo_url: 'niet-een-url',
        });
        expect(result.success).toBe(false);
    });

    it('accepteert geldige photo_url', () => {
        const result = RecipeStepSchema.safeParse({
            nr: 1, beschrijving: 'Test', photo_url: 'https://cdn.example.com/step.jpg',
        });
        expect(result.success).toBe(true);
    });

    it('weigert negatieve duration_min', () => {
        const result = RecipeStepSchema.safeParse({
            nr: 1, beschrijving: 'Test', duration_min: -10,
        });
        expect(result.success).toBe(false);
    });

    it('coerced nr + duration_min van string-numbers', () => {
        const result = RecipeStepSchema.safeParse({
            nr: '3', beschrijving: 'Test', duration_min: '45',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.nr).toBe(3);
            expect(result.data.duration_min).toBe(45);
        }
    });
});
