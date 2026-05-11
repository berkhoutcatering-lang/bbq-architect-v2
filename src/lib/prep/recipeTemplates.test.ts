import { describe, it, expect } from 'vitest';
import {
    RECIPE_TEMPLATES,
    findTemplateForDish,
    resolveOffsetMinutes,
    resolveDurationMinutes,
} from './recipeTemplates';
import { PHASE_OFFSET_MINUTES } from './prepTaskScheduler';

describe('RECIPE_TEMPLATES — minstens 10 BBQ-staples', () => {
    it('bevat minstens 10 templates', () => {
        expect(RECIPE_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    });
    it('ieder template heeft ≥1 phase + service als laatste', () => {
        for (const t of RECIPE_TEMPLATES) {
            expect(t.steps.length).toBeGreaterThan(0);
            const last = t.steps[t.steps.length - 1];
            expect(['service', 'plate', 'koud']).toContain(last.phase);
        }
    });
    it('ieder template heeft unieke id', () => {
        const ids = RECIPE_TEMPLATES.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('findTemplateForDish', () => {
    it('matcht pulled pork (case-insensitive)', () => {
        expect(findTemplateForDish('Pulled Pork')?.id).toBe('pulled-pork');
        expect(findTemplateForDish('pulled pork broodje')?.id).toBe('pulled-pork');
    });
    it('matcht brisket', () => {
        expect(findTemplateForDish('Brisket Texas-style')?.id).toBe('brisket');
    });
    it('matcht spareribs en short ribs verschillend', () => {
        expect(findTemplateForDish('Spareribs')?.id).toBe('spare-ribs');
        expect(findTemplateForDish('Beef Short Ribs')?.id).toBe('beef-ribs');
    });
    it('matcht hele kip vs pulled chicken', () => {
        expect(findTemplateForDish('Hele kip')?.id).toBe('whole-chicken');
        expect(findTemplateForDish('Pulled Chicken')?.id).toBe('pulled-chicken');
    });
    it('matcht coleslaw + mac & cheese + zalm', () => {
        expect(findTemplateForDish('Coleslaw')?.id).toBe('coleslaw');
        expect(findTemplateForDish('Mac and cheese')?.id).toBe('mac-and-cheese');
        expect(findTemplateForDish('Zalm uit de smoker')?.id).toBe('salmon');
    });
    it('returnt null voor onbekend gerecht', () => {
        expect(findTemplateForDish('UFO-burger met Marsmannetjes')).toBeNull();
    });
    it('returnt null voor lege/invalide input', () => {
        expect(findTemplateForDish('')).toBeNull();
        expect(findTemplateForDish(null as unknown as string)).toBeNull();
    });
});

describe('resolveOffsetMinutes', () => {
    it('gebruikt customOffset als gezet', () => {
        const step = {
            phase: 'smoke' as const,
            text: 'x',
            customOffsetMinutes: 999,
        };
        expect(resolveOffsetMinutes(step)).toBe(999);
    });
    it('valt terug op PHASE_OFFSET default', () => {
        const step = { phase: 'pekel' as const, text: 'x' };
        expect(resolveOffsetMinutes(step)).toBe(PHASE_OFFSET_MINUTES.pekel);
    });
});

describe('resolveDurationMinutes', () => {
    it('gebruikt customDuration als gezet', () => {
        const step = {
            phase: 'smoke' as const,
            text: 'x',
            customDurationMinutes: 360,
        };
        expect(resolveDurationMinutes(step)).toBe(360);
    });
});

describe('Brisket DAG — typische 16:00 zaterdag event', () => {
    it('brisket-smoke-offset is langer dan pulled-pork-smoke (14u vs 12u)', () => {
        const brisket = RECIPE_TEMPLATES.find((t) => t.id === 'brisket')!;
        const pp = RECIPE_TEMPLATES.find((t) => t.id === 'pulled-pork')!;
        const briskSmoke = brisket.steps.find((s) => s.phase === 'smoke')!;
        const ppSmoke = pp.steps.find((s) => s.phase === 'smoke')!;
        expect(resolveOffsetMinutes(briskSmoke)).toBeGreaterThan(
            resolveOffsetMinutes(ppSmoke),
        );
    });
});
