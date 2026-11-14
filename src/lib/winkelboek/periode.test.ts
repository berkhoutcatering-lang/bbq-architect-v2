import { describe, expect, it } from 'vitest';
import { maandSleutel, periodeVan, weekSleutel } from './periode';

describe('periodeVan', () => {
    it('een week loopt van maandag tot en met zondag', () => {
        expect(periodeVan('2026-W48', '2026-11-13')).toEqual({
            sleutel: '2026-W48', soort: 'week', start: '2026-11-23', eind: '2026-11-29',
            label: 'Week 48 · 23 – 29 nov', vorige: '2026-W47', volgende: '2026-W49',
        });
    });
    it('week 53 van 2026 loopt door in januari en wordt gevolgd door week 1 van 2027', () => {
        const p = periodeVan('2026-W53', '2026-11-13');
        expect(p).toMatchObject({ start: '2026-12-28', eind: '2027-01-03', volgende: '2027-W01', label: 'Week 53 · 28 dec – 3 jan' });
        expect(periodeVan('2027-W01', '2026-11-13')).toMatchObject({ start: '2027-01-04', vorige: '2026-W53' });
    });
    it('een maand loopt van de 1e tot en met de laatste dag', () => {
        expect(periodeVan('2026-11', '2026-11-13')).toEqual({
            sleutel: '2026-11', soort: 'maand', start: '2026-11-01', eind: '2026-11-30',
            label: 'November 2026', vorige: '2026-10', volgende: '2026-12',
        });
        expect(periodeVan('2026-12', '2026-11-13').volgende).toBe('2027-01');
    });
    it('zonder of met een kapotte sleutel: de week van vandaag', () => {
        expect(periodeVan(undefined, '2026-11-13').sleutel).toBe('2026-W46');
        expect(periodeVan('2026-W99', '2026-11-13').sleutel).toBe('2026-W46');
        expect(periodeVan('onzin', '2026-11-13').sleutel).toBe('2026-W46');
    });
    it('wisselt tussen week en maand op de begindatum', () => {
        expect(maandSleutel(periodeVan('2026-W48', '2026-11-13'))).toBe('2026-11');
        expect(weekSleutel(periodeVan('2026-11', '2026-11-13'))).toBe('2026-W44');
    });
});
