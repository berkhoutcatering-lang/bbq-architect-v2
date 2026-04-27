import { describe, it, expect } from 'vitest';
import {
    estimateSmokerKg,
    detectSmokerConflicts,
    detectVenueConflicts,
    detectCapacityWarnings,
    detectAllConflicts,
    highestSeverity,
    type ConflictableEvent,
} from './conflictDetection';

describe('estimateSmokerKg', () => {
    it('gebruikt expliciete smoker_kg als gezet', () => {
        const e: ConflictableEvent = { id: 1, smoker_kg: 25 };
        expect(estimateSmokerKg(e)).toBe(25);
    });

    it('default 0 voor events onder threshold (60 gasten)', () => {
        const e: ConflictableEvent = { id: 1, guests: 40 };
        expect(estimateSmokerKg(e)).toBe(0);
    });

    it('default berekent 0.4 kg/gast boven threshold', () => {
        const e: ConflictableEvent = { id: 1, guests: 100 };
        expect(estimateSmokerKg(e)).toBe(40);
    });

    it('respecteert needs_smoker=false ondanks veel gasten', () => {
        const e: ConflictableEvent = { id: 1, guests: 200, needs_smoker: false };
        expect(estimateSmokerKg(e)).toBe(0);
    });

    it('forceert needs_smoker=true ook bij weinig gasten', () => {
        const e: ConflictableEvent = { id: 1, guests: 30, needs_smoker: true };
        expect(estimateSmokerKg(e)).toBe(12);
    });

    it('honort custom config voor kg/gast en threshold', () => {
        const cfg = { smokerKgPerGuestDefault: 0.5, needsSmokerGuestThreshold: 30 };
        expect(estimateSmokerKg({ id: 1, guests: 40 }, cfg)).toBe(20);
    });
});

describe('detectSmokerConflicts', () => {
    it('geen conflict bij capaciteit onder limiet', () => {
        const events: ConflictableEvent[] = [
            { id: 1, date: '2026-05-01', guests: 80, status: 'confirmed' },  // 32kg
            { id: 2, date: '2026-05-01', guests: 60, status: 'confirmed' },  // 24kg → totaal 56kg < 60kg
        ];
        expect(detectSmokerConflicts(events)).toEqual([]);
    });

    it('detecteert overschrijding 60kg/dag met 2 events', () => {
        const events: ConflictableEvent[] = [
            { id: 1, date: '2026-05-01', guests: 100, status: 'confirmed' }, // 40kg
            { id: 2, date: '2026-05-01', guests: 80, status: 'confirmed' },  // 32kg → 72kg
        ];
        const conflicts = detectSmokerConflicts(events);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].type).toBe('smoker');
        expect(conflicts[0].severity).toBe('critical');
        expect(conflicts[0].eventIds).toEqual([1, 2]);
        expect(conflicts[0].date).toBe('2026-05-01');
    });

    it('1 enkel groot event = capacity-warning, niet smoker-conflict', () => {
        const events: ConflictableEvent[] = [
            { id: 1, date: '2026-05-01', guests: 200, status: 'confirmed' }, // 80kg alleen
        ];
        expect(detectSmokerConflicts(events)).toEqual([]); /* skip — capacity-warning gebruikt het */
    });

    it('genegeert events met excluded status', () => {
        const events: ConflictableEvent[] = [
            { id: 1, date: '2026-05-01', guests: 100, status: 'cancelled' },
            { id: 2, date: '2026-05-01', guests: 100, status: 'confirmed' },
        ];
        expect(detectSmokerConflicts(events)).toEqual([]);
    });
});

describe('detectVenueConflicts', () => {
    it('geen conflict bij verschillende locaties', () => {
        const events: ConflictableEvent[] = [
            { id: 1, date: '2026-05-01', location: 'Amsterdam' },
            { id: 2, date: '2026-05-01', location: 'Rotterdam' },
        ];
        expect(detectVenueConflicts(events)).toEqual([]);
    });

    it('detecteert dubbele venue zonder tijden (dag-grain)', () => {
        const events: ConflictableEvent[] = [
            { id: 1, date: '2026-05-01', location: 'Singraven' },
            { id: 2, date: '2026-05-01', location: 'singraven' }, /* case+space verschil */
        ];
        const c = detectVenueConflicts(events);
        expect(c).toHaveLength(1);
        expect(c[0].type).toBe('venue');
        expect(c[0].eventIds).toEqual([1, 2]);
    });

    it('detecteert overlappende tijden op dezelfde locatie', () => {
        const events: ConflictableEvent[] = [
            { id: 1, date: '2026-05-01', location: 'X', start_time: '14:00', end_time: '18:00' },
            { id: 2, date: '2026-05-01', location: 'X', start_time: '17:00', end_time: '21:00' },
        ];
        expect(detectVenueConflicts(events)).toHaveLength(1);
    });

    it('geen conflict bij niét-overlappende tijden op dezelfde locatie', () => {
        const events: ConflictableEvent[] = [
            { id: 1, date: '2026-05-01', location: 'X', start_time: '10:00', end_time: '14:00' },
            { id: 2, date: '2026-05-01', location: 'X', start_time: '17:00', end_time: '21:00' },
        ];
        expect(detectVenueConflicts(events)).toEqual([]);
    });

    it('half-open overlap: end == start → géén conflict', () => {
        const events: ConflictableEvent[] = [
            { id: 1, date: '2026-05-01', location: 'X', start_time: '10:00', end_time: '14:00' },
            { id: 2, date: '2026-05-01', location: 'X', start_time: '14:00', end_time: '18:00' },
        ];
        expect(detectVenueConflicts(events)).toEqual([]);
    });

    it('zonder tijden op één event → fallback dag-overlap', () => {
        const events: ConflictableEvent[] = [
            { id: 1, date: '2026-05-01', location: 'X' },
            { id: 2, date: '2026-05-01', location: 'X', start_time: '17:00', end_time: '21:00' },
        ];
        expect(detectVenueConflicts(events)).toHaveLength(1);
    });

    it('lege location wordt genegeerd', () => {
        const events: ConflictableEvent[] = [
            { id: 1, date: '2026-05-01', location: '' },
            { id: 2, date: '2026-05-01', location: '' },
        ];
        expect(detectVenueConflicts(events)).toEqual([]);
    });
});

describe('detectCapacityWarnings', () => {
    it('flagt event dat alleen al boven smoker-limiet uitkomt', () => {
        const events: ConflictableEvent[] = [
            { id: 1, date: '2026-05-01', guests: 200, status: 'confirmed' }, // 80kg > 60
        ];
        const warnings = detectCapacityWarnings(events);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].type).toBe('capacity');
        expect(warnings[0].severity).toBe('warning');
    });

    it('géén warning bij events onder limiet', () => {
        const events: ConflictableEvent[] = [
            { id: 1, date: '2026-05-01', guests: 100, status: 'confirmed' }, // 40kg
        ];
        expect(detectCapacityWarnings(events)).toEqual([]);
    });
});

describe('detectAllConflicts', () => {
    it('combineert alle conflict-types en biedt byEventId / byDate maps', () => {
        const events: ConflictableEvent[] = [
            { id: 1, date: '2026-05-01', location: 'X', guests: 100, status: 'confirmed' }, // 40kg
            { id: 2, date: '2026-05-01', location: 'X', guests: 80, status: 'confirmed' },  // 32kg → smoker + venue
            { id: 3, date: '2026-05-02', guests: 200, status: 'confirmed' },                  // capacity warning
        ];
        const r = detectAllConflicts(events);
        expect(r.conflicts.length).toBeGreaterThanOrEqual(3);
        expect(r.byEventId.get(1)?.length).toBeGreaterThan(0);
        expect(r.byDate.get('2026-05-01')?.length).toBeGreaterThanOrEqual(2);
        expect(r.byDate.get('2026-05-02')?.length).toBe(1);
    });
});

describe('highestSeverity', () => {
    it('returnt critical wanneer aanwezig', () => {
        expect(highestSeverity([
            { type: 'venue', severity: 'warning', eventIds: [], note: '' },
            { type: 'smoker', severity: 'critical', eventIds: [], note: '' },
        ])).toBe('critical');
    });

    it('returnt warning > info', () => {
        expect(highestSeverity([
            { type: 'venue', severity: 'info', eventIds: [], note: '' },
            { type: 'venue', severity: 'warning', eventIds: [], note: '' },
        ])).toBe('warning');
    });

    it('returnt null bij lege lijst', () => {
        expect(highestSeverity([])).toBeNull();
    });
});
