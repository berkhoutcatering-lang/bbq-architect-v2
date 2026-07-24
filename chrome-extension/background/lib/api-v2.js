/* background/lib/api-v2 — client voor de Extension API v2.
 * Alle calls sturen x-extension-key; de key staat alleen in chrome.storage.local
 * en verschijnt nooit in logs of UI. */

import { getConfig } from './storage.js';

async function req(path, { method = 'GET', body, idempotencyKey, timeoutMs = 30000 } = {}) {
    const { apiUrl, apiKey } = await getConfig();
    if (!apiUrl || !apiKey) throw new Error('API niet geconfigureerd');
    const headers = { 'x-extension-key': apiKey };
    if (body) headers['content-type'] = 'application/json';
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(`${apiUrl}${path}`, {
            method, headers, signal: ctrl.signal,
            body: body ? JSON.stringify(body) : undefined,
        });
        const json = await res.json().catch(() => ({}));
        return { status: res.status, ok: res.ok, ...json };
    } finally {
        clearTimeout(t);
    }
}

export const apiV2 = {
    testConnection: () => req('/api/extension/auth'),
    listSuppliers: () => req('/api/extension/leveranciers'),

    startRun: (payload) => req('/api/extension/v2/runs', { method: 'POST', body: payload }),

    getActiveRun: (supplierId, accountKey) =>
        req(`/api/extension/v2/runs/active?supplierId=${supplierId}&accountKey=${encodeURIComponent(accountKey || '')}`),

    registerTasks: (runId, tasks) =>
        req(`/api/extension/v2/runs/${runId}/tasks`, { method: 'POST', body: { tasks } }),

    claimTask: (runId, leaseSeconds, claimedBy) =>
        req(`/api/extension/v2/runs/${runId}/tasks/claim`, { method: 'POST', body: { leaseSeconds, claimedBy } }),

    checkpoint: (runId, idempotencyKey, payload) =>
        req(`/api/extension/v2/runs/${runId}/checkpoints`, { method: 'POST', body: payload, idempotencyKey, timeoutMs: 45000 }),

    heartbeat: (runId) => req(`/api/extension/v2/runs/${runId}/heartbeat`, { method: 'POST', body: {} }),
    pause: (runId, reason, retryAfter) => req(`/api/extension/v2/runs/${runId}/pause`, { method: 'POST', body: { reason, retryAfter } }),
    resume: (runId) => req(`/api/extension/v2/runs/${runId}/resume`, { method: 'POST', body: {} }),
    cancel: (runId) => req(`/api/extension/v2/runs/${runId}/cancel`, { method: 'POST', body: {} }),
    completeRequest: (runId) => req(`/api/extension/v2/runs/${runId}/complete-request`, { method: 'POST', body: {} }),
};
