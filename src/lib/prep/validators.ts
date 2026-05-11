/**
 * Inline validators voor /api/prep/* routes.
 *
 * Volgt het bestaande codebase-patroon (zie src/app/api/components/route.ts):
 *   `validateX(body): { ok: true; data: X } | { ok: false; error: string }`
 *
 * Geen Zod-dependency — consistent met rest van de codebase.
 * Elke route importeert alleen wat 'ie nodig heeft.
 */

import type { PrepTaskPhase, PrepTaskStatus } from '@/types/database.types';

const VALID_PHASES: readonly PrepTaskPhase[] = [
    'inkoop', 'pekel', 'rub', 'marinade', 'smoke',
    'grill', 'warm', 'koud', 'plate', 'service', 'other',
];

const VALID_STATUSES: readonly PrepTaskStatus[] = [
    'planned', 'queued', 'in_progress', 'done', 'skipped', 'blocked',
];

export type ValidatorResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string };

/* ─── Type-guards / safe extractors ───────────────────────────── */

function isPositiveInt(v: unknown): v is number {
    return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function isNonNegNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function isUuid(v: unknown): v is string {
    return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function asString(v: unknown, maxLen = 500): string | null {
    if (typeof v !== 'string') return null;
    const trimmed = v.trim();
    if (trimmed.length === 0 || trimmed.length > maxLen) return null;
    return trimmed;
}

/* ─── start-task ─────────────────────────────────────────────── */

export interface StartTaskInput {
    taskId: number;
}

export function validateStartTask(body: unknown): { ok: true; data: StartTaskInput } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    if (!isPositiveInt(b.taskId)) return { ok: false, error: 'taskId moet een positief integer zijn' };
    return { ok: true, data: { taskId: b.taskId } };
}

/* ─── complete-task ──────────────────────────────────────────── */

export interface CompleteTaskInput {
    taskId: number;
    actualQty: number | null;
    notes: string | null;
}

export function validateCompleteTask(body: unknown): { ok: true; data: CompleteTaskInput } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    if (!isPositiveInt(b.taskId)) return { ok: false, error: 'taskId moet een positief integer zijn' };

    let actualQty: number | null = null;
    if (b.actualQty !== undefined && b.actualQty !== null) {
        if (!isNonNegNumber(b.actualQty) || (b.actualQty as number) > 10_000) {
            return { ok: false, error: 'actualQty moet 0..10000 zijn' };
        }
        actualQty = Math.round((b.actualQty as number) * 1000) / 1000;
    }

    let notes: string | null = null;
    if (b.notes !== undefined && b.notes !== null) {
        notes = asString(b.notes, 500);
        if (notes === null && typeof b.notes === 'string') {
            return { ok: false, error: 'notes is te lang of leeg' };
        }
    }

    return { ok: true, data: { taskId: b.taskId, actualQty, notes } };
}

/* ─── skip-task ──────────────────────────────────────────────── */

export interface SkipTaskInput {
    taskId: number;
    reason: string;
}

export function validateSkipTask(body: unknown): { ok: true; data: SkipTaskInput } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    if (!isPositiveInt(b.taskId)) return { ok: false, error: 'taskId moet een positief integer zijn' };
    const reason = asString(b.reason, 250);
    if (!reason) return { ok: false, error: 'reason verplicht (max 250 tekens)' };
    return { ok: true, data: { taskId: b.taskId, reason } };
}

/* ─── reassign-task ──────────────────────────────────────────── */

export interface ReassignTaskInput {
    taskId: number;
    newAssigneeId: string;  // personeel.id
}

export function validateReassignTask(body: unknown): { ok: true; data: ReassignTaskInput } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    if (!isPositiveInt(b.taskId)) return { ok: false, error: 'taskId moet een positief integer zijn' };
    if (!isUuid(b.newAssigneeId)) return { ok: false, error: 'newAssigneeId moet een geldige UUID zijn' };
    return { ok: true, data: { taskId: b.taskId, newAssigneeId: b.newAssigneeId } };
}

/* ─── bulk-schedule ──────────────────────────────────────────── */

export interface BulkScheduleInput {
    eventId: number;
    dryRun: boolean;
    /** Optioneel: alleen specifieke gerecht-IDs schedulen (UUID-strings). */
    onlyGerechtIds: string[] | null;
}

export function validateBulkSchedule(body: unknown): { ok: true; data: BulkScheduleInput } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    if (!isPositiveInt(b.eventId)) return { ok: false, error: 'eventId moet een positief integer zijn' };
    const dryRun = b.dryRun === true;
    let onlyGerechtIds: string[] | null = null;
    if (Array.isArray(b.onlyGerechtIds)) {
        const filtered = b.onlyGerechtIds.filter(isUuid) as string[];
        if (filtered.length !== b.onlyGerechtIds.length) {
            return { ok: false, error: 'onlyGerechtIds moet array van UUIDs zijn' };
        }
        if (filtered.length > 200) return { ok: false, error: 'onlyGerechtIds max 200 items' };
        onlyGerechtIds = filtered.length > 0 ? filtered : null;
    }
    return { ok: true, data: { eventId: b.eventId, dryRun, onlyGerechtIds } };
}

/* ─── device-token (admin only) ──────────────────────────────── */

export interface DeviceTokenInput {
    deviceName: string;
    stationId: number | null;
    scope: 'read_only_display' | 'write' | 'read';
}

export function validateDeviceToken(body: unknown): { ok: true; data: DeviceTokenInput } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    const deviceName = asString(b.deviceName, 80);
    if (!deviceName) return { ok: false, error: 'deviceName verplicht (max 80 tekens)' };

    let stationId: number | null = null;
    if (b.stationId !== undefined && b.stationId !== null) {
        if (!isPositiveInt(b.stationId)) return { ok: false, error: 'stationId moet positief integer zijn' };
        stationId = b.stationId;
    }

    const scope = b.scope;
    if (scope !== 'read_only_display' && scope !== 'write' && scope !== 'read') {
        return { ok: false, error: 'scope moet read_only_display, write of read zijn' };
    }

    return { ok: true, data: { deviceName, stationId, scope } };
}

/* ─── device-verify (PIN-check tijdens write actie) ─────────── */

export interface DeviceVerifyInput {
    pin: string;          // 4-6 digits
    personeelId: string;  // UUID
}

export function validateDeviceVerify(body: unknown): { ok: true; data: DeviceVerifyInput } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    if (typeof b.pin !== 'string' || !/^\d{4,6}$/.test(b.pin)) {
        return { ok: false, error: 'pin moet 4-6 cijfers zijn' };
    }
    if (!isUuid(b.personeelId)) return { ok: false, error: 'personeelId moet UUID zijn' };
    return { ok: true, data: { pin: b.pin, personeelId: b.personeelId } };
}

/* ─── Helpers re-exporteert voor route-files ────────────────── */

export const PREP_VALID_PHASES = VALID_PHASES;
export const PREP_VALID_STATUSES = VALID_STATUSES;
