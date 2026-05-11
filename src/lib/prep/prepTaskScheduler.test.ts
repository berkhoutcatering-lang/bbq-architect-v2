import { describe, it, expect } from 'vitest';
import {
    PHASE_OFFSET_MINUTES,
    scheduledAtForPhase,
    buildPhaseTimeline,
    topologicalSort,
    computeBlockedStatus,
} from './prepTaskScheduler';

const EVENT_START = '2026-05-16T16:00:00.000Z'; // zaterdag 16:00

describe('scheduledAtForPhase', () => {
    it('plate begint 30 min voor event-start', () => {
        const t = scheduledAtForPhase('plate', { eventStart: EVENT_START });
        expect(t).toBe('2026-05-16T15:30:00.000Z');
    });

    it('smoke begint 13u voor event-start (12u smoke + 1u rust)', () => {
        const t = scheduledAtForPhase('smoke', { eventStart: EVENT_START });
        expect(t).toBe('2026-05-16T03:00:00.000Z'); // 13u eerder
    });

    it('pekel begint 36u voor event (24u pekel + 12u rub-buffer)', () => {
        const t = scheduledAtForPhase('pekel', { eventStart: EVENT_START });
        /* 16:00 zaterdag - 36u = 04:00 vrijdag */
        expect(t).toBe('2026-05-15T04:00:00.000Z');
    });

    it('inkoop begint 2 dagen voor event', () => {
        const t = scheduledAtForPhase('inkoop', { eventStart: EVENT_START });
        expect(t).toBe('2026-05-14T16:00:00.000Z');
    });

    it('service heeft offset 0 (start = event-start)', () => {
        const t = scheduledAtForPhase('service', { eventStart: EVENT_START });
        expect(t).toBe(EVENT_START);
    });

    it('customOffsetMinutes overschrijft phase-default', () => {
        const t = scheduledAtForPhase('smoke', {
            eventStart: EVENT_START,
            customOffsetMinutes: 8 * 60, // 8u smoke i.p.v. 13u
        });
        expect(t).toBe('2026-05-16T08:00:00.000Z');
    });

    it('accepteert Date instance', () => {
        const start = new Date(EVENT_START);
        expect(scheduledAtForPhase('plate', { eventStart: start })).toBe(
            '2026-05-16T15:30:00.000Z',
        );
    });

    it('werpt bij ongeldige datum-string', () => {
        expect(() =>
            scheduledAtForPhase('plate', { eventStart: 'niet-een-datum' }),
        ).toThrow(/invalid date/);
    });
});

describe('buildPhaseTimeline', () => {
    it('bouwt complete BBQ-keten voor zaterdag-event', () => {
        const timeline = buildPhaseTimeline(EVENT_START, [
            'inkoop', 'pekel', 'rub', 'smoke', 'plate', 'service',
        ]);
        expect(timeline).toHaveLength(6);
        expect(timeline[0]).toEqual({
            phase: 'inkoop',
            scheduled_at: '2026-05-14T16:00:00.000Z',
            offset_minutes: 48 * 60,
            duration_minutes: 60,
        });
        expect(timeline[3].phase).toBe('smoke');
        expect(timeline[3].scheduled_at).toBe('2026-05-16T03:00:00.000Z');
    });

    it('returnt elke phase met offset + duration', () => {
        const timeline = buildPhaseTimeline(EVENT_START, ['grill']);
        expect(timeline[0].offset_minutes).toBe(60);
        expect(timeline[0].duration_minutes).toBe(30);
    });
});

describe('PHASE_OFFSET_MINUTES — sanity check op BBQ-keten', () => {
    it('inkoop ligt eerder dan pekel', () => {
        expect(PHASE_OFFSET_MINUTES.inkoop).toBeGreaterThan(
            PHASE_OFFSET_MINUTES.pekel,
        );
    });
    it('pekel ligt eerder dan rub', () => {
        expect(PHASE_OFFSET_MINUTES.pekel).toBeGreaterThan(
            PHASE_OFFSET_MINUTES.rub,
        );
    });
    it('rub ligt eerder dan smoke', () => {
        expect(PHASE_OFFSET_MINUTES.rub).toBeGreaterThan(
            PHASE_OFFSET_MINUTES.smoke,
        );
    });
    it('smoke ligt eerder dan grill', () => {
        expect(PHASE_OFFSET_MINUTES.smoke).toBeGreaterThan(
            PHASE_OFFSET_MINUTES.grill,
        );
    });
    it('grill ligt eerder dan plate', () => {
        expect(PHASE_OFFSET_MINUTES.grill).toBeGreaterThan(
            PHASE_OFFSET_MINUTES.plate,
        );
    });
    it('service heeft offset 0', () => {
        expect(PHASE_OFFSET_MINUTES.service).toBe(0);
    });
});

describe('topologicalSort', () => {
    it('returnt nodes in dependency-volgorde (eenvoudig)', () => {
        const sorted = topologicalSort([
            { id: 3, deps: [1, 2] },
            { id: 1, deps: [] },
            { id: 2, deps: [1] },
        ]);
        expect(sorted).toEqual([1, 2, 3]);
    });

    it('handelt diamond-DAG correct af', () => {
        // 1 → 2,3 → 4
        const sorted = topologicalSort([
            { id: 4, deps: [2, 3] },
            { id: 3, deps: [1] },
            { id: 2, deps: [1] },
            { id: 1, deps: [] },
        ]);
        expect(sorted[0]).toBe(1);
        expect(sorted[3]).toBe(4);
        expect(sorted.indexOf(2)).toBeLessThan(sorted.indexOf(4));
        expect(sorted.indexOf(3)).toBeLessThan(sorted.indexOf(4));
    });

    it('detecteert cycle', () => {
        expect(() =>
            topologicalSort([
                { id: 1, deps: [2] },
                { id: 2, deps: [1] },
            ]),
        ).toThrow(/cycle detected/);
    });

    it('werpt bij dependency naar onbekende node', () => {
        expect(() =>
            topologicalSort([{ id: 1, deps: [99] }]),
        ).toThrow(/unknown 99/);
    });

    it('returnt lege array bij geen nodes', () => {
        expect(topologicalSort([])).toEqual([]);
    });

    it('is deterministisch — gelijke prioriteit sorteert op id', () => {
        const sorted = topologicalSort([
            { id: 5, deps: [] },
            { id: 2, deps: [] },
            { id: 8, deps: [] },
        ]);
        expect(sorted).toEqual([2, 5, 8]);
    });
});

describe('computeBlockedStatus', () => {
    it('blocked als één dep nog niet done is', () => {
        expect(
            computeBlockedStatus(10, [
                { depends_on_id: 1, status: 'done' },
                { depends_on_id: 2, status: 'in_progress' },
            ]),
        ).toBe('blocked');
    });

    it('queued als alle deps done of skipped zijn', () => {
        expect(
            computeBlockedStatus(10, [
                { depends_on_id: 1, status: 'done' },
                { depends_on_id: 2, status: 'skipped' },
            ]),
        ).toBe('queued');
    });

    it('queued bij geen dependencies', () => {
        expect(computeBlockedStatus(10, [])).toBe('queued');
    });

    it('blocked bij dep zonder status (planned)', () => {
        expect(
            computeBlockedStatus(10, [
                { depends_on_id: 1, status: 'planned' },
            ]),
        ).toBe('blocked');
    });
});
