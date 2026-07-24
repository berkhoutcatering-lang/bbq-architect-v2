import { describe, it, expect } from 'vitest';
import {
    decideNextAction, allTasksDone, reconcile, computeBackoffMs, nextWakeupMinutes,
} from '../../../chrome-extension/background/runner-core.js';

const okPreflight = { ok: true };
const running = (over = {}) => ({ status: 'running', tasks_total: 5, tasks_done: 1, tasks_failed: 0, ...over });

describe('decideNextAction', () => {
    it('geen actieve run → idle', () => {
        expect(decideNextAction({ hasActiveRunId: false }).action).toBe('idle');
    });
    it('terminale status → stop', () => {
        expect(decideNextAction({ hasActiveRunId: true, run: { status: 'completed' }, originOk: true, preflight: okPreflight }).action).toBe('stop');
    });
    it('gepauzeerd (rate limited) → idle', () => {
        expect(decideNextAction({ hasActiveRunId: true, run: { status: 'paused_rate_limited' }, originOk: true, preflight: okPreflight }).action).toBe('idle');
    });
    it('verkeerde site → wrong_site', () => {
        expect(decideNextAction({ hasActiveRunId: true, run: running(), originOk: false, preflight: okPreflight }).action).toBe('wrong_site');
    });
    it('login vereist → pause_needs_login', () => {
        expect(decideNextAction({ hasActiveRunId: true, run: running(), originOk: true, preflight: { ok: false, code: 'LOGIN_REQUIRED' } }).action).toBe('pause_needs_login');
    });
    it('paused_needs_login + login hersteld → resume', () => {
        expect(decideNextAction({ hasActiveRunId: true, run: { status: 'paused_needs_login' }, originOk: true, preflight: okPreflight }).action).toBe('resume');
    });
    it('running met open taken → claim', () => {
        expect(decideNextAction({ hasActiveRunId: true, run: running(), originOk: true, preflight: okPreflight }).action).toBe('claim');
    });
    it('running zonder open taken → complete', () => {
        expect(decideNextAction({ hasActiveRunId: true, run: running({ tasks_done: 5 }), originOk: true, preflight: okPreflight }).action).toBe('complete');
    });
});

describe('allTasksDone', () => {
    it('nog geen taken (total 0) → niet compleet', () => {
        expect(allTasksDone({ tasks_total: 0, tasks_done: 0 })).toBe(false);
    });
    it('done + failed >= total → compleet', () => {
        expect(allTasksDone({ tasks_total: 5, tasks_done: 4, tasks_failed: 1 })).toBe(true);
    });
});

describe('reconcile — §19 invariant', () => {
    it('seen == accepted+quarantined+rejected → ok', () => {
        expect(reconcile({ products_seen: 6, observations_accepted: 4, observations_quarantined: 1, observations_rejected: 1 }).ok).toBe(true);
    });
    it('mismatch → issue', () => {
        const r = reconcile({ products_seen: 10, observations_accepted: 4, observations_quarantined: 1, observations_rejected: 1 });
        expect(r.ok).toBe(false);
        expect(r.issues.length).toBe(1);
    });
});

describe('computeBackoffMs', () => {
    it('groeit met attempt en respecteert plafond', () => {
        const rand = () => 0; // geen jitter
        expect(computeBackoffMs(0, rand)).toBe(500);
        expect(computeBackoffMs(1, rand)).toBe(1000);
        expect(computeBackoffMs(3, rand)).toBe(4000);
        expect(computeBackoffMs(20, rand)).toBe(30000); // plafond
    });
    it('jitter blijft binnen grens', () => {
        const v = computeBackoffMs(2, () => 0.999);
        expect(v).toBeGreaterThanOrEqual(2000);
        expect(v).toBeLessThanOrEqual(2000 + 500);
    });
});

describe('nextWakeupMinutes', () => {
    it('running → 0.5 min', () => {
        expect(nextWakeupMinutes({ hasActiveRunId: true, run: { status: 'running' } })).toBe(0.5);
    });
    it('geen run → 0 (geen periodieke wake)', () => {
        expect(nextWakeupMinutes({ hasActiveRunId: false })).toBe(0);
    });
});
