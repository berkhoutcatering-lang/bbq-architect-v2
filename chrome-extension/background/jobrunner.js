/* background/jobrunner — voert per wake-up HOOGUIT één begrensde taak uit.
 *
 * Geen langlopende message-handler: start doet alleen preflight + POST run +
 * lokale pointer + eerste alarm, en antwoordt direct. Daarna verwerkt de runner
 * per wake-up (alarm/onStartup/side panel) één taak. De server bewaakt run,
 * volledigheid en tellingen (ADR-2), dus een SW-stop verliest geen bevestigd werk.
 */

import { apiV2 } from './lib/api-v2.js';
import { getActiveRun, setActiveRun, clearActiveRun, setLastStatus } from './lib/storage.js';
import { getAdapter } from '../adapters/registry.js';
import { decideNextAction } from './runner-core.js';
import { parseHtmlViaOffscreen } from './offscreen-client.js';
import { inPageExtract } from './inpage-extract.js';

const LEASE_SECONDS = 120;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Bouw de adapter-context met geïnjecteerde, credentialed capabilities. */
function buildAdapterCtx(active, adapter) {
    return {
        origin: active.origin,
        supplierId: active.supplierId,
        supplierAccountKey: active.accountKey,
        adapterKey: adapter.key,
        adapterVersion: adapter.version,
        taxMode: active.taxMode || 'ex_vat',
        currency: 'EUR',
        capturedAt: new Date().toISOString(),
        categories: active.categories || [],
        now: () => Date.now(),
        async fetchJson(url, opts = {}) {
            const res = await fetch(url, { ...opts, credentials: 'include' });
            const json = await res.json().catch(() => null);
            return { json, status: res.status };
        },
        async fetchText(url, opts = {}) {
            const res = await fetch(url, { ...opts, credentials: 'include' });
            return res.text();
        },
        async parseHtml(html, selectors) {
            return parseHtmlViaOffscreen(html, selectors);
        },
        /* Lees producten uit de LIVE, gerenderde leverancier-tab (voor sites die
           prijzen via JavaScript renderen, bv. Bidfood). Draait het extractiescript
           in de ingelogde pagina. */
        async readTab(config) {
            const tabs = await chrome.tabs.query({ url: `${active.origin}/*` });
            const tab = tabs.find((t) => t.active) || tabs[0];
            if (!tab || !tab.id) return { records: [], error: 'geen open tab voor deze leverancier' };
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: inPageExtract,
                args: [config || {}],
            });
            return (results && results[0] && results[0].result) || { records: [] };
        },
        /* Huidige URL van de leverancier-tab (voor URL-gebaseerd bladeren). */
        async getTabUrl() {
            const tabs = await chrome.tabs.query({ url: `${active.origin}/*` });
            const tab = tabs.find((t) => t.active) || tabs[0];
            return (tab && tab.url) || null;
        },
        /* Navigeer de tab naar `url` en wacht tot 'ie klaar is met laden (geen
           race met de render). Time-out voorkomt vasthangen. */
        async navigateTab(url, opts = {}) {
            const timeoutMs = opts.timeoutMs || 15000;
            const tabs = await chrome.tabs.query({ url: `${active.origin}/*` });
            const tab = tabs.find((t) => t.active) || tabs[0];
            if (!tab || !tab.id) return { ok: false };
            const tabId = tab.id;
            await chrome.tabs.update(tabId, { url });
            await new Promise((resolve) => {
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    try { chrome.tabs.onUpdated.removeListener(listener); } catch (e) { /* al weg */ }
                    clearTimeout(to);
                    resolve();
                };
                const listener = (id, info) => { if (id === tabId && info.status === 'complete') finish(); };
                const to = setTimeout(finish, timeoutMs);
                chrome.tabs.onUpdated.addListener(listener);
            });
            return { ok: true };
        },
        /* Navigeer naar één pagina-URL en lees 'm — met settle + retry tot de
           JS-gerenderde prijzen er zijn. Voor het per-pagina-takenmodel (elke
           taak = één pagina = één checkpoint), niet één lange in-taak-crawl. */
        async readPage(config, url) {
            if (url) await this.navigateTab(url);
            let res = { records: [] };
            for (let t = 0; t < 6; t++) {
                await sleep(600);
                res = await this.readTab(config);
                const recs = (res && res.records) || [];
                if (recs.some((r) => r && r.priceText)) return res;   // prijzen geladen
                if (recs.length && t >= 2) return res;                 // items maar (nog) geen prijs → toch terug
            }
            return res;
        },
    };
}

/** Eén wake-up: lees serverstatus, beslis, voer hooguit één stap uit. */
export async function runOnce() {
    const active = await getActiveRun();
    if (!active) return { action: 'idle', reason: 'geen actieve run' };

    const adapter = getAdapter(active.adapterKey);
    if (!adapter) { await clearActiveRun(); return { action: 'idle', reason: 'onbekende adapter' }; }

    const activeRes = await apiV2.getActiveRun(active.supplierId, active.accountKey).catch(() => ({ run: null }));
    const run = activeRes.run || null;
    if (!run) { await clearActiveRun(); return { action: 'stop', reason: 'geen serverrun' }; }
    await setLastStatus(run);

    const ctx = buildAdapterCtx(active, adapter);
    const originOk = adapter.matches(active.origin);

    // Preflight (login/prijszichtbaarheid) alleen bij twijfel: als run gepauzeerd
    // op login of als we nog geen bevestigde login hebben.
    let preflight = { ok: true };
    if (run.status === 'paused_needs_login' || active.needsPreflight) {
        preflight = await adapter.preflight(ctx).catch(() => ({ ok: false, code: 'SUPPLIER_TIMEOUT' }));
    }

    const decision = decideNextAction({ hasActiveRunId: true, run, originOk, preflight });

    switch (decision.action) {
        case 'claim':
            return claimAndExecute({ active, run, adapter, ctx });
        case 'complete': {
            const r = await apiV2.completeRequest(run.id);
            const status = r?.result?.status;
            if (status && ['completed', 'partial', 'failed'].includes(status)) await clearActiveRun();
            return { action: 'complete', status };
        }
        case 'pause_needs_login':
            await apiV2.pause(run.id, 'needs_login');
            return decision;
        case 'resume':
            await apiV2.resume(run.id);
            return decision;
        case 'stop':
            await clearActiveRun();
            return decision;
        default:
            return decision;
    }
}

/**
 * Verwerk meerdere taken binnen één wake-up, met een hard tijdsbudget zodat de
 * service worker niet te lang bezig is. Elke taak is een eigen transactioneel
 * checkpoint; stopt zodra er niets meer te claimen valt, bij pauze, of bij budget.
 */
export async function runUntilBudget({ maxTasks = 25, maxMs = 40000 } = {}) {
    const start = Date.now();
    let processed = 0;
    for (let i = 0; i < maxTasks; i++) {
        const r = await runOnce();
        if (r.action === 'checkpoint') {
            processed += 1;
            if (Date.now() - start > maxMs) return { processed, stopped: 'budget' };
            continue;
        }
        // idle/complete/pause/stop/wrong_site/error → deze wake is klaar.
        return { processed, stopped: r.action };
    }
    return { processed, stopped: 'maxTasks' };
}

async function claimAndExecute({ active, run, adapter, ctx }) {
    const claimRes = await apiV2.claimTask(run.id, LEASE_SECONDS, `key`);
    const task = claimRes.task;
    if (!task) {
        // Niets te claimen → mogelijk klaar; vraag de server om afronding.
        const r = await apiV2.completeRequest(run.id);
        const status = r?.result?.status;
        if (status && ['completed', 'partial', 'failed'].includes(status)) await clearActiveRun();
        return { action: 'complete', status };
    }

    let result;
    try {
        result = await adapter.fetchTask(ctx, task);
    } catch (e) {
        await apiV2.pause(run.id, 'needs_login'); // conservatief: onbekende fout → stop claims
        return { action: 'error', error: String(e) };
    }

    if (result.errorCode === 'LOGIN_REQUIRED' || result.errorCode === 'PERSONAL_PRICE_NOT_VISIBLE') {
        await setActiveRun({ ...active, needsPreflight: true });
        await apiV2.pause(run.id, 'needs_login');
        return { action: 'pause_needs_login' };
    }
    if (result.errorCode === 'SUPPLIER_RATE_LIMITED') {
        await apiV2.pause(run.id, 'rate_limited', 60);
        return { action: 'pause_rate_limited' };
    }

    // Normaliseer (puur) — sourceCursor meegeven voor provenance.
    const observations = (result.records || []).flatMap((rec) =>
        adapter.normalize({ ...rec, sourceCursor: task.sourceCursor }, ctx));

    // Transactioneel checkpoint; idempotency-key = taak-sleutel (replay-veilig).
    const ack = await apiV2.checkpoint(run.id, task.idempotencyKey, {
        taskId: task.id,
        observations,
        nextTasks: result.nextTasks || [],
        adapterDiagnostics: result.diagnostics || {},
    });

    return { action: 'checkpoint', ack: ack?.checkpoint || ack };
}

/** Alleen preflight: één bronpagina testen + sample van ≥5 producten (§7.2). */
export async function preflightSupplier({ supplierId, accountKey, adapterKey, origin, categories }) {
    const adapter = getAdapter(adapterKey);
    if (!adapter) return { ok: false, code: 'ADAPTER_PARSE_FAILED' };
    const ctx = buildAdapterCtx({ supplierId, accountKey, adapterKey, origin, categories, taxMode: 'ex_vat' }, adapter);
    return adapter.preflight(ctx).catch(() => ({ ok: false, code: 'SUPPLIER_TIMEOUT', sample: [] }));
}

/** Start of hervat een run. Antwoordt direct; geen langlopende callback. */
export async function startRun({ supplierId, accountKey, adapterKey, origin, mode, categories }) {
    const adapter = getAdapter(adapterKey);
    if (!adapter) throw new Error('Onbekende adapter');
    // Zelfde volledige context als preflightSupplier (incl. fetchText/parseHtml),
    // anders valt de DOM-adapter terug op een niet-bestaande JSON-route.
    const ctx = buildAdapterCtx({ supplierId, accountKey, adapterKey, origin, categories, taxMode: 'ex_vat' }, adapter);

    const pf = await adapter.preflight(ctx).catch(() => ({ ok: false, code: 'SUPPLIER_TIMEOUT', sample: [] }));
    if (!pf.ok) return { ok: false, code: pf.code || 'LOGIN_REQUIRED', preflight: pf };

    const started = await apiV2.startRun({
        supplierId, mode: mode || 'full', origin, adapterKey: adapter.key,
        adapterVersion: adapter.version, supplierAccountKey: accountKey,
        scope: { mode: mode || 'full', categories: categories || [] },
    });
    if (!started.runId) return { ok: false, code: 'RUN_NOT_RESUMABLE', error: started.error };

    await setActiveRun({ runId: started.runId, supplierId, accountKey, adapterKey: adapter.key, origin, categories: categories || [], taxMode: pf.taxMode || 'ex_vat' });

    // Ontdek de eerste taken en registreer ze (idempotent).
    const tasks = await adapter.discover(ctx).catch(() => []);
    if (tasks.length) await apiV2.registerTasks(started.runId, tasks);

    return { ok: true, runId: started.runId, resumed: started.resumed, preflight: pf };
}
