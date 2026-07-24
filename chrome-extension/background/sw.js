/* background/sw.js — service-worker entry (type: module).
 *
 * Wiret de hervat-mechanismen (briefing §8.3): onStartup, onInstalled, alarms,
 * side-panel-open en tab-events wekken de runner. De server is de bron van
 * waarheid; deze SW mag ge-evict worden zonder bevestigd werk te verliezen.
 */

import { runOnce, runUntilBudget, startRun, preflightSupplier } from './jobrunner.js';
import { getActiveRun, clearActiveRun, setLastStatus } from './lib/storage.js';
import { getAdapter, detectAdapter, listAdapters } from '../adapters/registry.js';
import { apiV2 } from './lib/api-v2.js';

const ALARM = 'bbq_v2_tick';
const ALARM_MINUTES = 0.5; // Chrome-minimum voor periodieke alarms

/* ── Alarm-beheer ───────────────────────────────────────────────────────────*/
async function ensureAlarm() {
    const active = await getActiveRun();
    const existing = await chrome.alarms.get(ALARM);
    if (active && !existing) {
        chrome.alarms.create(ALARM, { periodInMinutes: ALARM_MINUTES });
    } else if (!active && existing) {
        chrome.alarms.clear(ALARM);
    }
}

/* ── Lifecycle: elke wake controleert of het alarm bestaat + hervat werk ─────*/
chrome.runtime.onStartup.addListener(async () => { await ensureAlarm(); await safeRun(); });
chrome.runtime.onInstalled.addListener(async () => { await ensureAlarm(); });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ALARM) return;
    await ensureAlarm(); // vertrouw niet blind op alarmpersistentie tussen versies
    await safeRun();
});

async function safeRun() {
    try {
        const res = await runUntilBudget();
        await ensureAlarm();
        return res;
    } catch (e) {
        console.warn('[BBQ v2] runner-fout (niet-blokkerend):', e?.message || e);
    }
}

/* ── Side panel: per tab/origin inschakelen, openen op action-klik ──────────*/
chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
});

async function updateSidePanelForTab(tabId, url) {
    if (!chrome.sidePanel || !url) return;
    const adapter = detectAdapter(url);
    try {
        if (adapter) {
            await chrome.sidePanel.setOptions({ tabId, path: 'sidepanel/sidepanel.html', enabled: true });
        } else {
            // Geen gekoppelde leverancier op deze origin → side panel uit (domeinguard).
            await chrome.sidePanel.setOptions({ tabId, enabled: false });
        }
    } catch { /* tab kan verdwenen zijn */ }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status === 'complete' || info.url) updateSidePanelForTab(tabId, tab.url);
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab) updateSidePanelForTab(tabId, tab.url);
});

/* ── Commando's vanuit het side panel (kort; geen langlopende callback) ─────*/
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type || !String(msg.type).startsWith('BBQ_V2_')) return;
    handleCommand(msg).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true; // async antwoord
});

async function handleCommand(msg) {
    switch (msg.type) {
        case 'BBQ_V2_LIST_ADAPTERS':
            return { ok: true, adapters: listAdapters() };

        case 'BBQ_V2_DETECT': {
            const adapter = msg.url ? detectAdapter(msg.url) : null;
            return { ok: true, adapter: adapter ? { key: adapter.key, version: adapter.version, displayName: adapter.displayName } : null };
        }

        case 'BBQ_V2_LIST_SUPPLIERS':
            return apiV2.listSuppliers();

        case 'BBQ_V2_PREFLIGHT':
            return preflightSupplier(msg.payload || {});

        case 'BBQ_V2_START': {
            const result = await startRun(msg.payload || {});
            if (result.ok) { await ensureAlarm(); safeRun(); } // kick direct, niet awaiten
            return result;
        }

        case 'BBQ_V2_GET_STATE': {
            // supplierId/accountKey uit het bericht (panel) óf uit de lokale pointer,
            // zodat de eindstatus ook zichtbaar blijft nadat de runner de pointer wiste.
            const active = await getActiveRun();
            const supplierId = msg.supplierId || active?.supplierId;
            const accountKey = msg.accountKey || active?.accountKey || 'main';
            if (!supplierId) return { ok: true, run: null };
            const res = await apiV2.getActiveRun(supplierId, accountKey).catch(() => ({ run: null }));
            if (res.run) await setLastStatus(res.run);
            return { ok: true, run: res.run || null, active };
        }

        case 'BBQ_V2_PAUSE': {
            const active = await getActiveRun();
            if (!active) return { ok: false, error: 'geen actieve run' };
            const r = await apiV2.pause(active.runId, msg.reason || 'manual');
            return { ok: true, status: r.status };
        }
        case 'BBQ_V2_RESUME': {
            const active = await getActiveRun();
            if (!active) return { ok: false, error: 'geen actieve run' };
            await apiV2.resume(active.runId);
            await ensureAlarm(); safeRun();
            return { ok: true };
        }
        case 'BBQ_V2_CANCEL': {
            const active = await getActiveRun();
            if (!active) return { ok: false, error: 'geen actieve run' };
            await apiV2.cancel(active.runId);
            await clearActiveRun();
            await ensureAlarm();
            return { ok: true };
        }
        case 'BBQ_V2_TEST_CONNECTION':
            return apiV2.testConnection();

        default:
            return { ok: false, error: 'onbekend commando' };
    }
}

/* Bij laden van de SW: zorg dat een lopende run weer een alarm heeft. */
ensureAlarm();
