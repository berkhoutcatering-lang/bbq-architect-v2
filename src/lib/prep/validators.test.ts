import { describe, it, expect } from 'vitest';
import {
    validateStartTask,
    validateCompleteTask,
    validateSkipTask,
    validateReassignTask,
    validateBulkSchedule,
    validateDeviceToken,
    validateDeviceVerify,
} from './validators';

const UUID = '12345678-1234-1234-1234-123456789abc';

describe('validateStartTask', () => {
    it('accepts positive integer taskId', () => {
        const r = validateStartTask({ taskId: 42 });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.data.taskId).toBe(42);
    });
    it('rejects missing body', () => {
        expect(validateStartTask(null).ok).toBe(false);
    });
    it('rejects negative taskId', () => {
        expect(validateStartTask({ taskId: -1 }).ok).toBe(false);
    });
    it('rejects float taskId', () => {
        expect(validateStartTask({ taskId: 1.5 }).ok).toBe(false);
    });
    it('rejects string taskId', () => {
        expect(validateStartTask({ taskId: '42' }).ok).toBe(false);
    });
});

describe('validateCompleteTask', () => {
    it('accepts minimal payload', () => {
        const r = validateCompleteTask({ taskId: 1 });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.data.actualQty).toBeNull();
            expect(r.data.notes).toBeNull();
        }
    });
    it('accepts actualQty + notes', () => {
        const r = validateCompleteTask({ taskId: 1, actualQty: 8.5, notes: 'koeler dan verwacht' });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.data.actualQty).toBe(8.5);
            expect(r.data.notes).toBe('koeler dan verwacht');
        }
    });
    it('rounds actualQty to 3 decimals', () => {
        const r = validateCompleteTask({ taskId: 1, actualQty: 8.123456789 });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.data.actualQty).toBe(8.123);
    });
    it('rejects actualQty > 10000', () => {
        expect(validateCompleteTask({ taskId: 1, actualQty: 99999 }).ok).toBe(false);
    });
    it('rejects negative actualQty', () => {
        expect(validateCompleteTask({ taskId: 1, actualQty: -1 }).ok).toBe(false);
    });
});

describe('validateSkipTask', () => {
    it('requires non-empty reason', () => {
        expect(validateSkipTask({ taskId: 1, reason: '' }).ok).toBe(false);
        expect(validateSkipTask({ taskId: 1 }).ok).toBe(false);
    });
    it('accepts reason', () => {
        const r = validateSkipTask({ taskId: 1, reason: 'event afgezegd' });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.data.reason).toBe('event afgezegd');
    });
    it('rejects reason > 250 chars', () => {
        expect(validateSkipTask({ taskId: 1, reason: 'x'.repeat(251) }).ok).toBe(false);
    });
});

describe('validateReassignTask', () => {
    it('accepts valid UUID', () => {
        const r = validateReassignTask({ taskId: 1, newAssigneeId: UUID });
        expect(r.ok).toBe(true);
    });
    it('rejects non-UUID', () => {
        expect(validateReassignTask({ taskId: 1, newAssigneeId: 'not-uuid' }).ok).toBe(false);
    });
    it('rejects missing newAssigneeId', () => {
        expect(validateReassignTask({ taskId: 1 }).ok).toBe(false);
    });
});

describe('validateBulkSchedule', () => {
    it('accepts minimal payload', () => {
        const r = validateBulkSchedule({ eventId: 10 });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.data.dryRun).toBe(false);
            expect(r.data.onlyGerechtIds).toBeNull();
        }
    });
    it('respects dryRun flag', () => {
        const r = validateBulkSchedule({ eventId: 10, dryRun: true });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.data.dryRun).toBe(true);
    });
    it('accepts onlyGerechtIds array of UUIDs', () => {
        const ids = [
            '11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222',
        ];
        const r = validateBulkSchedule({ eventId: 10, onlyGerechtIds: ids });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.data.onlyGerechtIds).toEqual(ids);
    });
    it('rejects onlyGerechtIds with non-UUID strings', () => {
        expect(validateBulkSchedule({ eventId: 10, onlyGerechtIds: ['not-uuid', 'abc'] }).ok).toBe(false);
    });
    it('rejects onlyGerechtIds with numbers', () => {
        expect(validateBulkSchedule({ eventId: 10, onlyGerechtIds: [1, 2] }).ok).toBe(false);
    });
    it('rejects onlyGerechtIds > 200 items', () => {
        const id = '11111111-1111-1111-1111-111111111111';
        expect(
            validateBulkSchedule({
                eventId: 10,
                onlyGerechtIds: Array.from({ length: 201 }, () => id),
            }).ok,
        ).toBe(false);
    });
});

describe('validateDeviceToken', () => {
    it('accepts read_only_display scope without station', () => {
        const r = validateDeviceToken({ deviceName: 'Pass-monitor', scope: 'read_only_display' });
        expect(r.ok).toBe(true);
    });
    it('accepts write scope with station', () => {
        const r = validateDeviceToken({ deviceName: 'Smoker-tablet', stationId: 5, scope: 'write' });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.data.stationId).toBe(5);
    });
    it('rejects invalid scope', () => {
        expect(
            validateDeviceToken({ deviceName: 'x', scope: 'super-admin' }).ok,
        ).toBe(false);
    });
    it('rejects empty deviceName', () => {
        expect(validateDeviceToken({ deviceName: '', scope: 'write' }).ok).toBe(false);
    });
});

describe('validateDeviceVerify', () => {
    it('accepts 4-digit PIN', () => {
        const r = validateDeviceVerify({ pin: '1234', personeelId: UUID });
        expect(r.ok).toBe(true);
    });
    it('accepts 6-digit PIN', () => {
        const r = validateDeviceVerify({ pin: '123456', personeelId: UUID });
        expect(r.ok).toBe(true);
    });
    it('rejects 3-digit PIN', () => {
        expect(validateDeviceVerify({ pin: '123', personeelId: UUID }).ok).toBe(false);
    });
    it('rejects letters in PIN', () => {
        expect(validateDeviceVerify({ pin: '12ab', personeelId: UUID }).ok).toBe(false);
    });
    it('rejects non-UUID personeelId', () => {
        expect(validateDeviceVerify({ pin: '1234', personeelId: 'not-uuid' }).ok).toBe(false);
    });
});
