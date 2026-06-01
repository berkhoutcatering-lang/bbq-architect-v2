/**
 * Service worker: orchestreert sync-runs, batchen + posten naar BBQ Architect.
 *
 * State: sync-state in chrome.storage.session zodat popup ook na sluiten/openen
 * de progress kan blijven tonen.
 */

importScripts('api.js', 'adapters.js');

const BG_VERSION = '0.5.1';   // bump bij elke release; popup checkt mismatch
const SYNC_STATE_KEY = 'bbq_sync_state';
const BATCH_SIZE = 50;
const PAGE_DELAY_MS_DEFAULT = 1500;

/* Module-level cancel-flag. Wint áltijd over persisted state — zo kan een
   loop-iteration die net z'n state overschrijft de cancel niet "vergeten".
   Reset bij start van elke nieuwe scan.
   Plus: AbortController dat in-flight fetches (Claude vision-call van 5-15s)
   direct afkapt. Zonder dit moet de gebruiker wachten tot de call returns. */
let _cancelFlag = { active: false, syncRunId: null };
let _scanController = null;

function requestCancel(syncRunId) {
    _cancelFlag = { active: true, syncRunId: syncRunId || _cancelFlag.syncRunId };
    if (_scanController) {
        try { _scanController.abort(); } catch { /* ignore */ }
    }
}
function isCancelled(syncRunId) {
    return _cancelFlag.active && (!_cancelFlag.syncRunId || _cancelFlag.syncRunId === syncRunId);
}
function resetCancel(syncRunId) {
    _cancelFlag = { active: false, syncRunId };
    /* Fresh controller per scan — abort() heeft alleen effect op huidige in-flight requests */
    _scanController = new AbortController();
}
function getScanSignal() {
    return _scanController ? _scanController.signal : undefined;
}

/** Interruptible sleep — ja-of-nee retourneert false als gecancelt tijdens wachten. */
async function cancellableSleep(ms, syncRunId) {
    const stepMs = 200;
    const steps = Math.max(1, Math.ceil(ms / stepMs));
    for (let i = 0; i < steps; i++) {
        if (isCancelled(syncRunId)) return false;
        await new Promise(r => setTimeout(r, Math.min(stepMs, ms - i * stepMs)));
    }
    return true;
}

/* Tempo-presets in ms (delay tussen pagina-loads) */
const TEMPO_PRESETS = {
    normal:   { min: 1200, max: 1800,  scroll: false, jitter: false },
    cautious: { min: 4000, max: 6000,  scroll: true,  jitter: false },
    stealth:  { min: 12000, max: 18000, scroll: true,  jitter: true  },
};

function tempoDelay(tempo) {
    const p = TEMPO_PRESETS[tempo] || TEMPO_PRESETS.normal;
    return Math.floor(p.min + Math.random() * (p.max - p.min));
}
function tempoFlags(tempo) {
    return TEMPO_PRESETS[tempo] || TEMPO_PRESETS.normal;
}

async function setSyncState(state) {
    await new Promise(r => chrome.storage.session.set({ [SYNC_STATE_KEY]: state }, r));
    chrome.runtime.sendMessage({ type: 'BBQ_STATE_UPDATE', state }).catch(() => {});
}
async function getSyncState() {
    return new Promise(resolve => chrome.storage.session.get([SYNC_STATE_KEY], data => resolve(data[SYNC_STATE_KEY] || null)));
}
async function clearSyncState() {
    await new Promise(r => chrome.storage.session.remove([SYNC_STATE_KEY], r));
    chrome.runtime.sendMessage({ type: 'BBQ_STATE_UPDATE', state: null }).catch(() => {});
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getActiveTab() {
    /* `lastFocusedWindow` werkt betrouwbaar vanuit MV3 service worker.
       `currentWindow` is ambiguïs vanuit een SW-context (geen window-binding)
       en kan op sommige Chrome-versies een lege array geven. */
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs[0] || null;
}

/** captureVisibleTab → { base64, mimeType } | null.
 *  Vereist activeTab permissie (al in manifest). PNG voor max kwaliteit op productlabels.
 *  windowId is verplicht vanaf service-worker context — `null` werkt wel in popup-context
 *  maar geeft "no current window"-error vanuit MV3 service worker. */
async function captureScreenshot(windowId) {
    return new Promise(resolve => {
        try {
            chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, dataUrl => {
                if (chrome.runtime.lastError) {
                    console.warn('[BBQ scraper] captureVisibleTab error:', chrome.runtime.lastError.message);
                    resolve(null);
                    return;
                }
                if (!dataUrl) { resolve(null); return; }
                /* dataUrl: "data:image/png;base64,XXX" */
                const m = String(dataUrl).match(/^data:(image\/[a-z]+);base64,(.+)$/);
                if (!m) { resolve(null); return; }
                resolve({ mimeType: m[1], base64: m[2] });
            });
        } catch (e) {
            console.warn('[BBQ scraper] captureScreenshot threw:', e?.message || e);
            resolve(null);
        }
    });
}

/** Multi-screenshot: scroll door de pagina + capture op meerdere posities.
 *  Returns array van {base64, mimeType, scrollY}, max `maxShots`.
 *  Cap op 3 voor scan-page (~€0.03 met Haiku vision).
 *  Wacht 750ms per scroll-step voor lazy-load + AJAX. Cancel-aware.
 *  windowId verplicht voor captureVisibleTab vanuit service worker. */
async function captureMultiScreenshot(tabId, windowId, syncRunId, maxShots = 3, setPhase) {
    const shots = [];

    /* Scroll naar top + capture eerste shot */
    await tabSend(tabId, { type: 'BBQ_SCROLL_TO', y: 0 }, 3000);
    await cancellableSleep(600, syncRunId);
    if (isCancelled(syncRunId)) return shots;
    const first = await captureScreenshot(windowId);
    if (first) shots.push({ ...first, scrollY: 0 });
    console.log('[BBQ scraper] screenshot 1/' + maxShots + ':', first ? 'ok (' + Math.round(first.base64.length / 1024) + 'KB)' : 'FAILED');

    /* Pagina-dimensies opvragen */
    const dim = await tabSend(tabId, { type: 'BBQ_GET_DIMENSIONS' }, 3000);
    if (!dim?.ok || !dim.scrollHeight) {
        console.warn('[BBQ scraper] geen page-dimensies — content.js mogelijk oude versie. 1 shot genoeg?');
        return shots;
    }
    const viewportH = dim.viewportHeight || 800;
    const scrollH = dim.scrollHeight;
    console.log('[BBQ scraper] page-dim: viewport=' + viewportH + ' scrollHeight=' + scrollH);

    /* Pagina past al in 1 viewport → 1 shot is genoeg */
    if (scrollH <= viewportH * 1.4) return shots;

    /* Anders verdeel resterende scrollruimte over (maxShots - 1) extra shots */
    const remainingShots = Math.max(1, maxShots - 1);
    const totalScroll = scrollH - viewportH;
    for (let i = 1; i <= remainingShots; i++) {
        if (isCancelled(syncRunId)) break;
        if (setPhase) await setPhase(`Screenshots maken (${i + 1}/${maxShots})…`);
        const targetY = Math.floor(totalScroll * (i / remainingShots));
        await tabSend(tabId, { type: 'BBQ_SCROLL_TO', y: targetY }, 3000);
        /* Wacht voor lazy-load + AJAX */
        if (!await cancellableSleep(750, syncRunId)) break;
        const shot = await captureScreenshot(windowId);
        if (shot) shots.push({ ...shot, scrollY: targetY });
        console.log('[BBQ scraper] screenshot ' + (i + 1) + '/' + maxShots + ' @ y=' + targetY + ':', shot ? 'ok' : 'FAILED');
        /* Chrome rate-limit op captureVisibleTab is 2/sec; extra buffer voor zekerheid */
        if (!await cancellableSleep(550, syncRunId)) break;
    }

    /* Scroll terug naar top voor consistentie */
    await tabSend(tabId, { type: 'BBQ_SCROLL_TO', y: 0 }, 1500);
    return shots;
}

/** Dedupe producten op (genormaliseerde naam) — vision over meerdere screenshots
 *  geeft soms dubbel als een product op shot 1 én shot 2 te zien is. */
function dedupeProducten(list) {
    const seen = new Set();
    const out = [];
    for (const p of list) {
        if (!p || typeof p.naam !== 'string') continue;
        const key = p.naam.toLowerCase().replace(/\s+/g, ' ').trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(p);
    }
    return out;
}

/** Inject content scripts on-demand. Gebruikt na een tabs already-loaded-before-reload
 *  scenario: content_scripts uit manifest worden alleen bij navigation geinjecteerd,
 *  niet retroactief. Met chrome.scripting kunnen we dat handmatig forceren. */
async function injectContentScripts(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId, allFrames: false },
            files: ['auto-extractor.js', 'content.js'],
        });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: String(e?.message || e) };
    }
}

/* ============================================================
   ROBUST MESSAGING — debug logging, retry/backoff, pre-ping,
   auto-inject. Vervangt de simpele tabSend uit eerdere versies.
   ============================================================ */

const AUTO_WALK_DEBUG = true;
const TABSEND_DEBUG = true;

function awLog(syncRunId, msg, data) {
    if (!AUTO_WALK_DEBUG) return;
    const p = `[AUTO-WALK ${syncRunId || 'no-run'}]`;
    if (data === undefined) console.log(p, msg);
    else console.log(p, msg, data);
}
function awWarn(syncRunId, msg, data) {
    const p = `[AUTO-WALK ${syncRunId || 'no-run'}]`;
    if (data === undefined) console.warn(p, msg);
    else console.warn(p, msg, data);
}
function awErr(syncRunId, msg, data) {
    const p = `[AUTO-WALK ${syncRunId || 'no-run'}]`;
    if (data === undefined) console.error(p, msg);
    else console.error(p, msg, data);
}
function tsLog(...args) {
    if (TABSEND_DEBUG) console.log('[tabSend]', ...args);
}
function tsWarn(...args) {
    console.warn('[tabSend]', ...args);
}

function toErrorMessage(err) {
    if (!err) return 'unknown error';
    if (typeof err === 'string') return err;
    return err.message || String(err);
}
function makeRequestId(prefix = 'req') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function withStepTimeout(label, ms, fn) {
    let t = null;
    return Promise.race([
        (async () => {
            try { return await fn(); }
            finally { if (t) clearTimeout(t); }
        })(),
        new Promise((_, reject) => {
            t = setTimeout(() => reject(new Error(`Timeout in ${label} (${ms}ms)`)), ms);
        }),
    ]);
}

async function getRealTab(tabId) {
    try { return await chrome.tabs.get(tabId); }
    catch { return null; }
}
async function getRealTabUrl(tabId) {
    const t = await getRealTab(tabId);
    return t?.url || '';
}

/** Detecteer of een tabSend-error wijst op een ontbrekend content script. */
function isNoReceiverError(msg) {
    const m = String(msg || '').toLowerCase();
    return (
        m.includes('could not establish connection') ||
        m.includes('receiving end does not exist') ||
        m.includes('the message port closed') ||
        m.includes('message port closed')
    );
}
function isRetriableError(msg) {
    const m = String(msg || '').toLowerCase();
    return (
        isNoReceiverError(m) ||
        m.includes('timeout') ||
        m.includes('temporarily unavailable') ||
        m.includes('disconnected')
    );
}
function backoffDelayMs(attempt, base = 250, max = 3000) {
    const exp = Math.min(max, base * Math.pow(2, Math.max(0, attempt - 1)));
    const jitter = Math.floor(Math.random() * 120);
    return exp + jitter;
}
function isHeavyMessageType(type) {
    return type === 'BBQ_GET_HTML' || type === 'BBQ_HUMAN_SCROLL' || type === 'BBQ_AUTO_EXTRACT';
}

async function sendMessageOnce(tabId, message, timeoutMs, requestId) {
    return new Promise((resolve, reject) => {
        let done = false;
        const started = Date.now();
        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            reject(new Error(`tabSend timeout after ${timeoutMs}ms [${requestId}] type=${message?.type}`));
        }, timeoutMs);
        try {
            chrome.tabs.sendMessage(tabId, message, (response) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                const lastErr = chrome.runtime.lastError;
                if (lastErr) {
                    reject(new Error(`${lastErr.message} [${requestId}] type=${message?.type}`));
                    return;
                }
                resolve({ response, meta: { requestId, type: message?.type, durationMs: Date.now() - started } });
            });
        } catch (e) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            reject(new Error(`${toErrorMessage(e)} [${requestId}] type=${message?.type}`));
        }
    });
}

async function pingTab(tabId, timeoutMs = 1200) {
    const requestId = makeRequestId('ping');
    const msg = { type: 'BBQ_PING', __bbqMeta: { requestId, sentAt: Date.now() } };
    const { response } = await sendMessageOnce(tabId, msg, timeoutMs, requestId);
    return !!(response && response.ok && response.pong);
}

/**
 * Drop-in tabSend. Backward-compatible: `tabSend(tabId, msg, timeoutMs)` werkt.
 * Nieuwe optie:
 *   tabSend(tabId, msg, timeoutMs, { syncRunId, retries, pingBeforeHeavy, retryInject })
 *
 * Bij heavy types (HUMAN_SCROLL/AUTO_EXTRACT/GET_HTML) doet hij een pre-ping; bij
 * "could not establish connection" errors injecteert hij content scripts opnieuw
 * en retry't volgens exponential backoff.
 */
async function tabSend(tabId, message, timeoutMs = 5000, opts = {}) {
    const {
        retries = 2,
        pingBeforeHeavy = true,
        retryInject = true,
        syncRunId = null,
    } = opts || {};

    if (!tabId) throw new Error('tabSend: missing tabId');
    if (!message || typeof message !== 'object') throw new Error('tabSend: invalid message');

    const msgType = message.type || 'UNKNOWN';
    const totalAttempts = 1 + Math.max(0, Number(retries) || 0);

    if (pingBeforeHeavy && isHeavyMessageType(msgType) && msgType !== 'BBQ_PING') {
        try {
            const ok = await pingTab(tabId, 1200);
            tsLog('pre-ping', { syncRunId, msgType, ok });
            if (!ok && retryInject) {
                await injectContentScripts(tabId);
                await sleep(120);
            }
        } catch (e) {
            tsWarn('pre-ping failed (fail-open)', { syncRunId, msgType, err: toErrorMessage(e) });
            if (retryInject) {
                await injectContentScripts(tabId);
                await sleep(120);
            }
        }
    }

    let lastError = null;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
        const requestId = makeRequestId('msg');
        const messageWithMeta = {
            ...message,
            __bbqMeta: { requestId, sentAt: Date.now(), attempt, totalAttempts, syncRunId: syncRunId || null },
        };

        try {
            tsLog('send attempt', { syncRunId, msgType, attempt, totalAttempts, requestId });
            const { response, meta } = await sendMessageOnce(tabId, messageWithMeta, timeoutMs, requestId);
            tsLog('send success', { syncRunId, msgType, attempt, requestId, durationMs: meta.durationMs });
            if (response && response.ok === false) {
                tsWarn('response !ok', { syncRunId, msgType, requestId, response });
            }
            return response;
        } catch (e) {
            const errText = toErrorMessage(e);
            lastError = e;
            const retriable = isRetriableError(errText);
            const hasNext = attempt < totalAttempts;
            tsWarn('send failed', { syncRunId, msgType, attempt, totalAttempts, retriable, err: errText });
            if (!hasNext || !retriable) break;
            if (retryInject && isNoReceiverError(errText)) {
                await injectContentScripts(tabId);
            }
            await sleep(backoffDelayMs(attempt));
        }
    }

    throw lastError || new Error(`tabSend failed: ${msgType}`);
}

/** Navigate tab + wait for load complete (timeout 15s). Cancel-aware: stopt bij cancel-flag. */
async function navigateAndWait(tabId, url, syncRunId) {
    await chrome.tabs.update(tabId, { url });
    await new Promise(resolve => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        const listener = (id, info) => {
            if (id === tabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                finish();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
        const hardTimeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); finish(); }, 15000);
        /* Cancel-check elke 250ms */
        const cancelPoll = setInterval(() => {
            if (isCancelled(syncRunId)) {
                clearInterval(cancelPoll);
                clearTimeout(hardTimeout);
                chrome.tabs.onUpdated.removeListener(listener);
                finish();
            }
        }, 250);
        /* Clear poll bij finish */
        const origResolve = resolve;
        resolve = () => { clearInterval(cancelPoll); clearTimeout(hardTimeout); origResolve(); };
    });
    /* Settle delay voor DOM-hydration (React/Vue/SPA). Cancellable. */
    await cancellableSleep(800, syncRunId);
}

/** Pre-extract human-like behaviour op pagina (scroll/jitter).
 *  Hard timeout per call via withStepTimeout. Faalt zacht (continue) bij errors —
 *  scrape mag niet stoppen alleen omdat scroll/jitter een hiccup had. */
async function humanizePage(tabId, tempo, syncRunId, opts) {
    const options = opts || {};
    const flags = tempoFlags(tempo);

    if (isCancelled(syncRunId)) return { ok: false, cancelled: true };

    if (flags.scroll) {
        try {
            await withStepTimeout('BBQ_HUMAN_SCROLL', 30000, async () => {
                await tabSend(
                    tabId,
                    { type: 'BBQ_HUMAN_SCROLL', noLoadMore: !!options.noLoadMore },
                    25000,
                    { syncRunId, retries: 1, pingBeforeHeavy: true, retryInject: true }
                );
            });
        } catch (e) {
            awWarn(syncRunId, 'HUMAN_SCROLL failed (continue)', toErrorMessage(e));
        }
    }

    if (flags.jitter && !isCancelled(syncRunId)) {
        try {
            await withStepTimeout('BBQ_JITTER', 5000, async () => {
                await tabSend(
                    tabId,
                    { type: 'BBQ_JITTER', count: 4 },
                    3000,
                    { syncRunId, retries: 1, pingBeforeHeavy: false, retryInject: true }
                );
            });
        } catch (e) {
            awWarn(syncRunId, 'JITTER failed (continue)', toErrorMessage(e));
        }
    }

    return { ok: true };
}

/** withTimeout: wraps any async operation in een hard-timeout. */
async function withTimeout(label, promise, timeoutMs) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout na ${Math.round(timeoutMs/1000)}s`)), timeoutMs);
    });
    try {
        const result = await Promise.race([promise, timeout]);
        clearTimeout(timer);
        return result;
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

/** Same-origin check + URL normalisatie */
function normalizeUrl(href, baseUrl) {
    try {
        const u = new URL(href, baseUrl);
        u.hash = '';
        /* Strip tracking params */
        ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid'].forEach(p => u.searchParams.delete(p));
        return u.toString();
    } catch { return null; }
}
function sameOrigin(a, b) {
    try { return new URL(a).hostname === new URL(b).hostname; } catch { return false; }
}

/** Probeer een ?page=N+1 fallback URL. Werkt voor de meest voorkomende
 *  paginerings-conventies: ?page=N, ?p=N, /page/N, /p/N. Returnt null als
 *  geen pattern matched. */
function buildNextPageFallback(currentUrl) {
    try {
        const u = new URL(currentUrl);
        /* Probeer eerst query-param ?page=N */
        for (const param of ['page', 'p', 'pagina']) {
            if (u.searchParams.has(param)) {
                const cur = parseInt(u.searchParams.get(param), 10);
                if (Number.isFinite(cur) && cur > 0) {
                    u.searchParams.set(param, String(cur + 1));
                    return u.toString();
                }
            }
        }
        /* Geen page-param? Voeg ?page=2 toe als de pagina lijkt op een listing */
        const path = u.pathname.toLowerCase();
        const looksLikeListing = /\/(c|category|categorie|categorieen|collections?|producten|products|shop)\//.test(path)
            || /\/(c|category|collections?)\/[^/]+\/?$/.test(path);
        if (looksLikeListing) {
            u.searchParams.set('page', '2');
            return u.toString();
        }
        /* /page/N path-segment patroon */
        const pathPageMatch = u.pathname.match(/^(.*\/page\/)(\d+)(\/?)$/i);
        if (pathPageMatch) {
            const next = parseInt(pathPageMatch[2], 10) + 1;
            u.pathname = `${pathPageMatch[1]}${next}${pathPageMatch[3]}`;
            return u.toString();
        }
        return null;
    } catch { return null; }
}

/**
 * Deep crawl: BFS door hele site vanaf huidige URL.
 * Ontdekt categorieën via AI-detect's category_links + paginating via next_page_url.
 * Dedup op URL. Cap op maxPages (default 200). Tempo-aware (normal/cautious/stealth).
 */
async function deepCrawlSite({ leverancierId, tempo, maxPages }) {
    const tab = await getActiveTab();
    if (!tab) throw new Error('Geen actief tabblad');

    const ping = await tabSend(tab.id, { type: 'BBQ_PING' });
    if (!ping?.ok) throw new Error('Kon content-script niet bereiken op deze pagina');

    const startUrl = tab.url;
    const startOrigin = (() => { try { return new URL(startUrl).origin; } catch { return null; } })();
    if (!startOrigin) throw new Error('Ongeldige start-URL');

    const cap = Math.min(Math.max(5, maxPages || 200), 500);
    const tempoChoice = TEMPO_PRESETS[tempo] ? tempo : 'stealth';

    const start = await BBQ.startSync({ leverancierId, mode: 'full', portalUrl: startUrl });
    const syncRunId = start.syncRunId;
    const scope = start?.leverancier?.scope_filter || 'alles';
    const scopeKeywords = start?.leverancier?.scope_keywords || [];

    /* Reset cancel-flag voor deze nieuwe sync */
    resetCancel(syncRunId);

    await setSyncState({
        running: true, mode: 'deep-crawl', leverancierId, syncRunId,
        startedAt: Date.now(), pagesScanned: 0, productsSeen: 0, errors: [],
        currentUrl: startUrl, tempo: tempoChoice, queueSize: 1, scope,
    });

    /* BFS state */
    const visited = new Set();
    const queue = [startUrl];
    let pagesScanned = 0;
    let productsSeen = 0;
    const errors = [];

    /* Heuristic: skip URL-paths die overduidelijk niet-product zijn */
    const SKIP_PATTERNS = /\/(login|account|cart|winkelwagen|checkout|wishlist|favorieten|contact|over-ons|about|privacy|terms|voorwaarden|leveringsvoorwaarden|garantie|retour|cookies|sitemap|blog|nieuws|inspiratie)(\/|$|\?)/i;

    /* Helper: check cancel + cleanup; returns true als gecanceld */
    async function checkCancel() {
        if (!isCancelled(syncRunId)) return false;
        try { await BBQ.finishSync({ syncRunId, status: 'cancelled', errorText: 'door gebruiker geannuleerd' }); } catch { /* ignore */ }
        await setSyncState({
            running: false, mode: 'deep-crawl', leverancierId, syncRunId,
            done: true, cancelled: true, pagesScanned, productsSeen, errors,
            currentUrl: tab.url, tempo: tempoChoice, queueSize: queue.length,
        });
        return true;
    }

    /* Hard cap: max 120s per pagina — als een pagina langer kost, skip + door. */
    const PAGE_HARD_TIMEOUT_MS = 120000;

    try {
        while (queue.length > 0 && pagesScanned < cap) {
            if (await checkCancel()) return { ok: true, cancelled: true, productsSeen, pagesScanned };

            const url = queue.shift();
            const norm = normalizeUrl(url, startUrl);
            if (!norm || visited.has(norm)) continue;
            if (!sameOrigin(norm, startUrl)) continue;
            if (SKIP_PATTERNS.test(norm)) { visited.add(norm); continue; }
            visited.add(norm);

            try {
                /* Wrap de hele pagina-cyclus in een hard-timeout */
                await withTimeout(`pagina ${norm.slice(0, 80)}`, (async () => {
                    /* Navigate + humanize. Cancel-checks tussendoor om vroeg te stoppen. */
                    await navigateAndWait(tab.id, norm, syncRunId);
                    if (isCancelled(syncRunId)) return;
                    /* Deep-crawl pagineert via discovered next_page_url +
                       buildNextPageFallback — load-more clicks zouden de tab
                       weg-navigeren. Zelfde reden als bij auto-walk. */
                    await humanizePage(tab.id, tempoChoice, syncRunId, { noLoadMore: true });
                    if (isCancelled(syncRunId)) return;

                    /* Check pagina nog leeft (geen captcha-redirect) */
                    const ping2 = await tabSend(tab.id, { type: 'BBQ_PING' }, 5000);
                    if (!ping2?.ok) {
                        errors.push(`${norm}: content-script unreachable (anti-bot?)`);
                        return;
                    }

                    /* AI-detect — krijgt producten + category_links + next_page_url */
                    const html = await tabSend(tab.id, { type: 'BBQ_GET_HTML' }, 8000);
                    if (!html?.ok) throw new Error('Kon HTML niet ophalen');
                    if (isCancelled(syncRunId)) return;
                    const ai = await BBQ.aiDetect({ html: html.html, pageUrl: norm, scope, scopeKeywords });
                    if (isCancelled(syncRunId)) return;

                /* Push found products */
                if (Array.isArray(ai.producten) && ai.producten.length > 0) {
                    for (let i = 0; i < ai.producten.length; i += BATCH_SIZE) {
                        const batch = ai.producten.slice(i, i + BATCH_SIZE);
                        try {
                            await BBQ.sendBatch({
                                syncRunId, leverancierId, pageUrl: norm,
                                pagesScanned: i === 0 ? 1 : 0,
                                producten: batch,
                            });
                        } catch (e) {
                            errors.push(`${norm}: ${e.message}`);
                        }
                    }
                    productsSeen += ai.producten.length;
                }

                /* Enqueue: next_page_url (priority) + category_links + page-fallback */
                let pushedNext = false;
                if (ai.next_page_url) {
                    const nxt = normalizeUrl(ai.next_page_url, norm);
                    if (nxt && !visited.has(nxt) && sameOrigin(nxt, startUrl)) {
                        queue.unshift(nxt);
                        pushedNext = true;
                    }
                }
                /* Fallback: AI vond geen next_page maar pagina had producten →
                   probeer ?page=N+1 zelf. Werkt voor SPA-stores die paginering
                   client-side doen (Makro, Sligro). */
                if (!pushedNext && Array.isArray(ai.producten) && ai.producten.length > 0) {
                    const fallback = buildNextPageFallback(norm);
                    if (fallback && !visited.has(fallback) && sameOrigin(fallback, startUrl)) {
                        queue.unshift(fallback);
                    }
                }
                if (Array.isArray(ai.category_links)) {
                    for (const link of ai.category_links) {
                        const c = normalizeUrl(link, norm);
                        if (c && !visited.has(c) && sameOrigin(c, startUrl) && !SKIP_PATTERNS.test(c) && !queue.includes(c)) {
                            queue.push(c);
                        }
                    }
                }

                pagesScanned++;
                await setSyncState({
                    running: true, mode: 'deep-crawl', leverancierId, syncRunId,
                    startedAt: (await getSyncState())?.startedAt || Date.now(),
                    pagesScanned, productsSeen, errors,
                    currentUrl: norm, tempo: tempoChoice, queueSize: queue.length,
                });

                }), PAGE_HARD_TIMEOUT_MS);

                if (await checkCancel()) return { ok: true, cancelled: true, productsSeen, pagesScanned };

                if (queue.length > 0 && pagesScanned < cap) {
                    await cancellableSleep(tempoDelay(tempoChoice), syncRunId);
                    if (await checkCancel()) return { ok: true, cancelled: true, productsSeen, pagesScanned };
                }
            } catch (e) {
                errors.push(`${norm}: ${e.message}`);
                await cancellableSleep(Math.min(tempoDelay(tempoChoice), 3000), syncRunId);
            }
        }

        const status = errors.length === 0 ? 'completed' : (productsSeen > 0 ? 'partial' : 'failed');
        await BBQ.finishSync({ syncRunId, status, errorText: errors.slice(0, 5).join('; ') || null });
        await setSyncState({
            running: false, mode: 'deep-crawl', leverancierId, syncRunId,
            done: true, pagesScanned, productsSeen, errors,
            currentUrl: tab.url, startedAt: (await getSyncState())?.startedAt,
            queueSize: queue.length,
        });
        return { ok: true, pagesScanned, productsSeen, errors, queueRemaining: queue.length };
    } catch (e) {
        await BBQ.finishSync({ syncRunId, status: 'failed', errorText: String(e?.message || e) }).catch(() => {});
        await setSyncState({
            running: false, error: String(e?.message || e), syncRunId,
            pagesScanned, productsSeen,
        });
        throw e;
    }
}

/**
 * Single-page scan: één pagina scrapen, batch sturen, klaar.
 *
 * Flow (vision-first):
 *   1. Humanize de pagina (scroll/jitter) → triggert lazy-load
 *   2. Adapter probeer (snel, gratis) — alleen als bekend portaal
 *   3. Vision-mode: multi-screenshot → Haiku 4.5 vision in 1 call (combined dedupe)
 *   4. HTML-mode als allerlaatste redmiddel (gratis qua tokens, kan slecht zijn op SPA's)
 *   5. Diagnostiek terug naar popup — Sam ziet WAT gewerkt heeft
 */
async function scanCurrentPage({ leverancierId, useAi, tempo }) {
    const tab = await getActiveTab();
    if (!tab) throw new Error('Geen actief tabblad');

    const ping = await tabSend(tab.id, { type: 'BBQ_PING' });
    if (!ping?.ok) throw new Error('Kon content-script niet bereiken op deze pagina');

    /* Start sync-run */
    const start = await BBQ.startSync({
        leverancierId,
        mode: 'single-page',
        portalUrl: tab.url,
    });
    const syncRunId = start.syncRunId;
    const scope = start?.leverancier?.scope_filter || 'alles';
    const scopeKeywords = start?.leverancier?.scope_keywords || [];
    resetCancel(syncRunId);

    /* Diagnostic per scan-stap zodat Sam ziet WAT gewerkt heeft.
       Volgorde matched de 4-lagen pipeline: jsonld → platform → html-AI → vision-AI */
    const diag = { jsonld: 0, platform: 0, platformName: null, html: 0, vision: 0, screenshots: 0, methods: [] };

    /* Helper: update phase-text in popup zonder de hele state te overschrijven.
       Sam ziet zo live waar de scan is: "Pagina scrollen…" → "Screenshot 2/3…" → "Claude analyseert…" */
    const setPhase = async (phase) => {
        const cur = (await getSyncState()) || {};
        await setSyncState({ ...cur, phase });
    };

    await setSyncState({
        running: true, mode: 'single-page', leverancierId,
        syncRunId, startedAt: Date.now(),
        pagesScanned: 0, productsSeen: 0, errors: [],
        currentUrl: tab.url, diagnostic: diag, phase: 'Starten…',
    });

    let producten = [];
    let aiResult = null;
    try {
        /* STAP 1 — ALTIJD humanize: triggert scroll, lazy-load, "Toon meer"-knoppen.
           Direct via BBQ_HUMAN_SCROLL i.p.v. via humanizePage(tempo) — die laatste skip't
           bij tempo='normal' (scroll:false). Voor SPA's als Makro is scrollen verplicht
           anders zien we alleen 1ste viewport. */
        console.log('[BBQ scraper] STAP 1 — humanize page (scroll + load-more)');
        await setPhase('Pagina scrollen om alles te laden…');
        await tabSend(tab.id, { type: 'BBQ_HUMAN_SCROLL' }, 25000);
        if (isCancelled(syncRunId)) {
            await BBQ.finishSync({ syncRunId, status: 'cancelled' });
            await setSyncState({ running: false, done: true, cancelled: true, productsSeen: 0, diagnostic: diag });
            return { ok: true, cancelled: true, productsSeen: 0 };
        }

        /* STAP 2 — Auto-extract (laag 1 JSON-LD + laag 2 platform detect).
           Gratis, instant. Pakt ~80% van moderne shops zonder AI-call. */
        if (!useAi) {
            console.log('[BBQ scraper] STAP 2 — auto-extract (JSON-LD + platform)');
            await setPhase('Pagina lezen (JSON-LD + platform)…');
            const r = await tabSend(tab.id, { type: 'BBQ_AUTO_EXTRACT' }, 5000);
            if (r?.ok && Array.isArray(r.producten)) {
                diag.jsonld = r.debug?.jsonld || 0;
                diag.platform = r.debug?.platformCount || 0;
                diag.platformName = r.debug?.platform || null;
                console.log('[BBQ scraper] auto-extract: jsonld=' + diag.jsonld + ' platform=' + (diag.platformName || 'none') + '(' + diag.platform + ')');
                if (r.producten.length > 0) {
                    diag.methods.push(r.method || 'auto');
                    producten = r.producten;
                }
            } else if (r?.error) {
                console.warn('[BBQ scraper] auto-extract error:', r.error);
            }
        } else {
            console.log('[BBQ scraper] auto-extract overgeslagen — useAi=true');
        }

        /* STAP 3 — Claude HTML-mode (laag 3, ~€0.005/pag).
           Goedkoper dan vision; probeer dit eerst als auto-extract <20 vond. */
        if (!isCancelled(syncRunId) && producten.length < 20) {
            console.log('[BBQ scraper] STAP 3 — Claude HTML analyse');
            await setPhase('AI leest de HTML…');
            const html = await tabSend(tab.id, { type: 'BBQ_GET_HTML' }, 8000);
            if (html?.ok && html.html) {
                try {
                    aiResult = await BBQ.aiDetect({
                        html: html.html, pageUrl: tab.url, scope, scopeKeywords,
                        signal: getScanSignal(),
                    });
                    if (isCancelled(syncRunId)) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
                    const htmlList = dedupeProducten(Array.isArray(aiResult?.producten) ? aiResult.producten : []);
                    diag.html = htmlList.length;
                    console.log('[BBQ scraper] html returned: ' + htmlList.length + ' producten');
                    if (htmlList.length > producten.length) {
                        diag.methods.push('html');
                        producten = htmlList;
                    }
                } catch (e) {
                    if (e?.name === 'AbortError' || isCancelled(syncRunId)) {
                        await BBQ.finishSync({ syncRunId, status: 'cancelled' }).catch(() => {});
                        await setSyncState({ running: false, done: true, cancelled: true, productsSeen: 0, diagnostic: diag });
                        return { ok: true, cancelled: true, productsSeen: 0 };
                    }
                    diag.htmlError = String(e?.message || e).slice(0, 120);
                    console.warn('[BBQ scraper] html call failed:', e?.message || e);
                }
            }
        } else if (producten.length >= 20) {
            console.log('[BBQ scraper] html-AI overgeslagen — auto-extract al ' + producten.length + ' producten');
        }

        /* STAP 4 — Vision-mode (laag 4, ~€0.05/pag).
           Laatste redmiddel voor heavy-JS / weird DOM sites die laag 1-3 niet pakte. */
        if (!isCancelled(syncRunId) && producten.length < 10) {
            console.log('[BBQ scraper] STAP 4 — vision capture (max 3 shots)');
            await setPhase('Screenshots maken (1/3)…');
            const shots = await captureMultiScreenshot(tab.id, tab.windowId, syncRunId, 3, setPhase);
            diag.screenshots = shots.length;
            console.log('[BBQ scraper] captured ' + shots.length + ' screenshots, calling Claude vision...');
            if (shots.length > 0 && !isCancelled(syncRunId)) {
                try {
                    await setPhase(`Claude analyseert ${shots.length} screenshot${shots.length > 1 ? 's' : ''}…`);
                    aiResult = await BBQ.aiDetect({
                        images: shots.map(s => ({ base64: s.base64, mimeType: s.mimeType })),
                        pageUrl: tab.url, scope, scopeKeywords,
                        signal: getScanSignal(),
                    });
                    if (isCancelled(syncRunId)) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
                    const visionList = dedupeProducten(Array.isArray(aiResult?.producten) ? aiResult.producten : []);
                    diag.vision = visionList.length;
                    console.log('[BBQ scraper] vision returned: ' + visionList.length + ' producten');
                    if (visionList.length > producten.length) {
                        diag.methods.push('vision');
                        producten = visionList;
                    }
                } catch (e) {
                    if (e?.name === 'AbortError' || isCancelled(syncRunId)) {
                        await BBQ.finishSync({ syncRunId, status: 'cancelled' }).catch(() => {});
                        await setSyncState({ running: false, done: true, cancelled: true, productsSeen: 0, diagnostic: diag });
                        return { ok: true, cancelled: true, productsSeen: 0 };
                    }
                    diag.visionError = String(e?.message || e).slice(0, 120);
                    console.warn('[BBQ scraper] vision call failed:', e?.message || e);
                }
            } else if (shots.length === 0) {
                diag.visionError = 'geen screenshots — captureVisibleTab faalde (windowId issue?)';
                console.warn('[BBQ scraper] 0 screenshots — vision overgeslagen');
            }
        } else if (producten.length >= 10) {
            console.log('[BBQ scraper] vision overgeslagen — html/auto al ' + producten.length + ' producten');
        }
        console.log('[BBQ scraper] FINAL diagnostic:', JSON.stringify(diag), '→', producten.length, 'producten');
        await setPhase('Verwerken…');

        /* SUCCESS — producten gevonden, batches sturen */
        if (producten.length > 0) {
            for (let i = 0; i < producten.length; i += BATCH_SIZE) {
                const batch = producten.slice(i, i + BATCH_SIZE);
                await BBQ.sendBatch({
                    syncRunId, leverancierId,
                    pageUrl: tab.url,
                    pagesScanned: i === 0 ? 1 : 0,
                    producten: batch,
                });
            }
            await BBQ.finishSync({ syncRunId, status: 'completed' });
            await setSyncState({
                running: false, mode: 'single-page', leverancierId, syncRunId,
                startedAt: Date.now(), pagesScanned: 1, productsSeen: producten.length,
                done: true, currentUrl: tab.url, diagnostic: diag,
            });
            return { ok: true, productsSeen: producten.length, diagnostic: diag };
        }

        /* AUTO-FALLBACK: 0 producten maar wel sub-categorieën gevonden door AI?
           Pagina is een index → automatisch deep-crawl. */
        let categoryLinks = Array.isArray(aiResult?.category_links) ? aiResult.category_links : [];
        if (categoryLinks.length === 0) {
            const linkRes = await tabSend(tab.id, { type: 'BBQ_GET_LINKS' }, 5000);
            if (linkRes?.ok && Array.isArray(linkRes.links) && linkRes.links.length > 0) {
                categoryLinks = linkRes.links;
            }
        }

        if (categoryLinks.length > 0) {
            await BBQ.finishSync({ syncRunId, status: 'completed', errorText: `0 producten op index — auto-fallback naar deep-crawl voor ${categoryLinks.length} sub-pagina's` });
            await setSyncState({
                running: true, mode: 'deep-crawl-fallback', leverancierId, syncRunId,
                startedAt: Date.now(), pagesScanned: 0, productsSeen: 0, errors: [],
                currentUrl: tab.url, queueSize: categoryLinks.length, diagnostic: diag,
                hint: `Geen producten op deze pagina — automatisch deep-crawl over ${categoryLinks.length} sub-pagina's gestart…`,
            });
            return await deepCrawlSite({ leverancierId, tempo: tempo || 'cautious', maxPages: 200 });
        }

        /* GEEN PRODUCTEN + GEEN LINKS → diagnostiek aan Sam */
        const diagBits = [
            `jsonld:${diag.jsonld}`,
            `platform${diag.platformName ? '(' + diag.platformName + ')' : ''}:${diag.platform}`,
            `html:${diag.html}`,
            `vision(${diag.screenshots}×):${diag.vision}`,
        ];
        const hint = `Niets gevonden. Probeer: stuur 'm naar een productlijst-pagina (geen homepage), of log eerst in. Pagina kan ook anti-bot of login-screen tonen.`;
        await BBQ.finishSync({ syncRunId, status: 'completed', errorText: diagBits.join(' · ') });
        await setSyncState({
            running: false, mode: 'single-page', leverancierId, syncRunId,
            startedAt: Date.now(), pagesScanned: 1, productsSeen: 0,
            done: true, currentUrl: tab.url, diagnostic: diag, hint,
        });
        return { ok: true, productsSeen: 0, diagnostic: diag };
    } catch (e) {
        await BBQ.finishSync({ syncRunId, status: 'failed', errorText: String(e?.message || e) }).catch(() => {});
        await setSyncState({
            running: false, error: String(e?.message || e), syncRunId, diagnostic: diag,
        });
        throw e;
    }
}

/* ============================================================
   URL & paginering helpers (safe wrappers rond bestaande project-fns)
   ============================================================ */

function normalizeUrlLoose(url) {
    if (!url || typeof url !== 'string') return '';
    let s = url.trim();
    if (s.endsWith(':')) s = s.slice(0, -1);
    const hashIdx = s.indexOf('#');
    if (hashIdx >= 0) s = s.slice(0, hashIdx);
    return s;
}
function canonicalPageKey(url) {
    try {
        const u = new URL(normalizeUrlLoose(url));
        u.hash = '';
        const p = new URLSearchParams(u.search);
        const sorted = new URLSearchParams();
        [...p.keys()].sort().forEach((k) => p.getAll(k).forEach((v) => sorted.append(k, v)));
        u.search = sorted.toString() ? `?${sorted.toString()}` : '';
        return u.toString();
    } catch {
        return normalizeUrlLoose(url);
    }
}
function parsePageParamFlexible(v) {
    if (v == null) return null;
    const m = String(v).match(/\d+/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
}
function buildNextPageFallbackSafe(currentUrl) {
    try {
        if (typeof buildNextPageFallback === 'function') {
            const x = buildNextPageFallback(currentUrl);
            if (x) return normalizeUrlLoose(x);
        }
    } catch {}
    try {
        const u = new URL(normalizeUrlLoose(currentUrl));
        const params = new URLSearchParams(u.search);
        const pageRaw = params.get('page');
        const pageNum = parsePageParamFlexible(pageRaw);
        if (pageNum == null) params.set('page', '2');
        else params.set('page', String(pageNum + 1));
        u.search = params.toString();
        return u.toString();
    } catch {
        return null;
    }
}

function dedupeProductList(list) {
    if (!Array.isArray(list)) return [];
    try {
        if (typeof dedupeProducten === 'function') return dedupeProducten(list);
    } catch {}
    const seen = new Set();
    const out = [];
    for (const p of list) {
        const key =
            (p?.sku && `sku:${p.sku}`) ||
            (p?.id && `id:${p.id}`) ||
            (p?.product_url && `url:${p.product_url}`) ||
            (p?.naam && p?.eenheid && `nameunit:${p.naam}|${p.eenheid}`) ||
            (p?.naam && `name:${p.naam}`) ||
            JSON.stringify(p);
        if (!seen.has(key)) { seen.add(key); out.push(p); }
    }
    return out;
}
function getTempoDelaySafe(tempo) {
    try {
        if (typeof tempoDelay === 'function') {
            const d = Number(tempoDelay(tempo));
            return Number.isFinite(d) && d >= 0 ? d : 0;
        }
    } catch {}
    return 0;
}
function isCancelledSafe(syncRunId) {
    try { if (typeof isCancelled === 'function') return !!isCancelled(syncRunId); }
    catch {}
    return false;
}
function getScanSignalSafe() {
    try { if (typeof getScanSignal === 'function') return getScanSignal(); }
    catch {}
    return undefined;
}

/* ============================================================
   SELECTOR CACHE — per hostname onthouden welke selectors Claude
   ons gaf, zodat herhaalde scans op zelfde domein gratis worden.
   Storage: chrome.storage.local key 'bbq_selector_cache'.
   Schema:
     { [hostname]: {
         selectors: { productCard, naam, prijs, url, eenheid },
         learnedAt: ISO,
         lastCount: number,        // count van learn-run
         successCount: number,     // hoeveel cache-hits sindsdien
         failCount: number,        // hoeveel cache-misses sindsdien
       }
     }
   ============================================================ */

const CACHE_STORAGE_KEY = 'bbq_selector_cache';
const CACHE_MAX_FAILS = 3;       /* na 3 fails purge cache voor host */
const CACHE_MIN_COUNT = 5;       /* < dit aantal producten → cache-miss */

function hostnameOf(url) {
    try { return new URL(url).hostname; }
    catch { return null; }
}

async function loadHostCache(hostname) {
    if (!hostname) return null;
    try {
        const all = await chrome.storage.local.get(CACHE_STORAGE_KEY);
        const cache = all[CACHE_STORAGE_KEY] || {};
        return cache[hostname] || null;
    } catch (e) {
        awWarn(null, 'loadHostCache failed', toErrorMessage(e));
        return null;
    }
}

async function saveHostCache(hostname, data) {
    if (!hostname || !data) return;
    try {
        const all = await chrome.storage.local.get(CACHE_STORAGE_KEY);
        const cache = all[CACHE_STORAGE_KEY] || {};
        cache[hostname] = { ...data, learnedAt: new Date().toISOString() };
        await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: cache });
        awLog(null, 'cache saved', { hostname, selectors: data.selectors });
    } catch (e) {
        awWarn(null, 'saveHostCache failed', toErrorMessage(e));
    }
}

async function clearHostCache(hostname) {
    if (!hostname) return;
    try {
        const all = await chrome.storage.local.get(CACHE_STORAGE_KEY);
        const cache = all[CACHE_STORAGE_KEY] || {};
        delete cache[hostname];
        await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: cache });
        awLog(null, 'cache cleared', { hostname });
    } catch (e) {
        awWarn(null, 'clearHostCache failed', toErrorMessage(e));
    }
}

async function recordCacheHit(hostname) {
    const cur = await loadHostCache(hostname);
    if (!cur) return;
    cur.successCount = (cur.successCount || 0) + 1;
    cur.failCount = 0;  /* reset fail counter bij success */
    await saveHostCache(hostname, cur);
}

async function recordCacheMiss(hostname) {
    const cur = await loadHostCache(hostname);
    if (!cur) return;
    cur.failCount = (cur.failCount || 0) + 1;
    if (cur.failCount >= CACHE_MAX_FAILS) {
        awWarn(null, `cache purged: ${CACHE_MAX_FAILS} fails in a row`, { hostname });
        await clearHostCache(hostname);
    } else {
        await saveHostCache(hostname, cur);
    }
}

function hasValidSelectors(sel) {
    return !!(sel && typeof sel === 'object' && sel.productCard && sel.naam && sel.prijs);
}

/* ============================================================
   extractCatalogPage — één pagina extraheren met richer debug.
   Volgorde: CACHED-SELECTORS → auto-extract → HTML+AI fallback.
   ============================================================ */
async function extractCatalogPage({
    tabId,
    pageUrl,
    tempo,
    useAi = false,
    scope,
    scopeKeywords,
    syncRunId,
}) {
    const debug = {
        pageUrl,
        cache: { tried: false, ok: false, count: 0, error: null },
        autoExtract: { ok: false, count: 0, nextUrl: null, error: null, rawDebug: null },
        html: { ok: false, length: 0, error: null, rawDebug: null },
        ai: { ok: false, count: 0, nextUrl: null, error: null, cachedSelectors: false },
        steps: [],
    };

    let producten = [];
    let foundNext = null;

    debug.steps.push('humanize:start');
    await humanizePage(tabId, tempo, syncRunId, { noLoadMore: true });
    debug.steps.push('humanize:done');

    /* LAAG 0 — cached selectors van eerdere AI-call. Gratis, instant.
       Bij <5 producten → cache miss → record fail, fallback naar auto/AI. */
    const hostname = hostnameOf(pageUrl);
    const cached = !useAi ? await loadHostCache(hostname) : null;
    if (cached && hasValidSelectors(cached.selectors)) {
        debug.cache.tried = true;
        debug.steps.push('cache:start');
        try {
            const r = await withStepTimeout('BBQ_EXTRACT_BY_SELECTORS', 5000, async () => {
                return await tabSend(tabId, {
                    type: 'BBQ_EXTRACT_BY_SELECTORS',
                    selectors: cached.selectors,
                }, 4000, { syncRunId, retries: 1, pingBeforeHeavy: true, retryInject: true });
            });
            const list = Array.isArray(r?.producten) ? dedupeProductList(r.producten) : [];
            debug.cache.count = list.length;
            if (r?.ok && list.length >= CACHE_MIN_COUNT) {
                producten = list;
                foundNext = r.nextUrl || null;
                debug.cache.ok = true;
                debug.steps.push('cache:hit');
                await recordCacheHit(hostname);
                /* Cache hit — geen AI nodig. Skip auto-extract en HTML-AI. */
                awLog(syncRunId, 'cache HIT', { hostname, count: list.length });
                return {
                    producten,
                    nextUrl: foundNext ? normalizeUrlLoose(foundNext) : null,
                    debug,
                };
            } else {
                debug.cache.error = `count ${list.length} < ${CACHE_MIN_COUNT}`;
                debug.steps.push('cache:miss');
                await recordCacheMiss(hostname);
                awLog(syncRunId, 'cache MISS', { hostname, count: list.length, threshold: CACHE_MIN_COUNT });
            }
        } catch (e) {
            debug.cache.error = toErrorMessage(e);
            debug.steps.push('cache:error');
            await recordCacheMiss(hostname);
        }
    }

    if (!useAi) {
        debug.steps.push('auto:start');
        try {
            const r = await withStepTimeout('BBQ_AUTO_EXTRACT', 7000, async () => {
                return await tabSend(tabId, { type: 'BBQ_AUTO_EXTRACT' }, 5000, {
                    syncRunId, retries: 2, pingBeforeHeavy: true, retryInject: true,
                });
            });
            debug.autoExtract.rawDebug = r?.debug || null;
            if (r?.ok) {
                const list = Array.isArray(r.producten) ? r.producten : [];
                producten = dedupeProductList(list);
                foundNext = r.nextUrl || null;
                debug.autoExtract.ok = true;
                debug.autoExtract.count = producten.length;
                debug.autoExtract.nextUrl = foundNext;
            } else {
                debug.autoExtract.error = r?.error || 'AUTO_EXTRACT !ok';
            }
        } catch (e) {
            debug.autoExtract.error = toErrorMessage(e);
        }
        debug.steps.push('auto:done');
    }

    if (producten.length < 5 || useAi) {
        debug.steps.push('html:start');
        let htmlRes = null;
        try {
            htmlRes = await withStepTimeout('BBQ_GET_HTML', 10000, async () => {
                return await tabSend(tabId, { type: 'BBQ_GET_HTML' }, 8000, {
                    syncRunId, retries: 2, pingBeforeHeavy: true, retryInject: true,
                });
            });
            debug.html.rawDebug = htmlRes?.debug || null;
            if (htmlRes?.ok && htmlRes.html) {
                debug.html.ok = true;
                debug.html.length = String(htmlRes.html).length;
            } else {
                debug.html.error = htmlRes?.error || 'GET_HTML !ok/empty';
            }
        } catch (e) {
            debug.html.error = toErrorMessage(e);
        }
        debug.steps.push('html:done');

        if (htmlRes?.ok && htmlRes.html) {
            debug.steps.push('ai:start');
            try {
                const ai = await withStepTimeout('AI_DETECT', 90000, async () => {
                    return await BBQ.aiDetect({
                        html: htmlRes.html,
                        pageUrl,
                        scope,
                        scopeKeywords,
                        signal: getScanSignalSafe(),
                    });
                });
                const aiList = dedupeProductList(ai?.producten || []);
                if (aiList.length > producten.length) producten = aiList;
                foundNext = foundNext || ai?.next_page_url || null;
                debug.ai.ok = true;
                debug.ai.count = aiList.length;
                debug.ai.nextUrl = ai?.next_page_url || null;

                /* Cache selectors als Claude ze meegaf én we genoeg producten kregen.
                   Volgende scan op zelfde host = client-side, gratis. */
                if (hasValidSelectors(ai?.selectors) && aiList.length >= CACHE_MIN_COUNT && hostname) {
                    debug.ai.cachedSelectors = true;
                    await saveHostCache(hostname, {
                        selectors: ai.selectors,
                        lastCount: aiList.length,
                        successCount: 0,
                        failCount: 0,
                    });
                    awLog(syncRunId, 'cache LEARNED', { hostname, selectors: ai.selectors, count: aiList.length });
                }
            } catch (e) {
                debug.ai.error = toErrorMessage(e);
            }
            debug.steps.push('ai:done');
        }
    }

    return {
        producten: dedupeProductList(producten),
        nextUrl: foundNext ? normalizeUrlLoose(foundNext) : null,
        debug,
    };
}

/* ============================================================
   autoWalkCatalogCore — pure loop, geen sync-state management.
   Caller geeft syncRunId mee. onProgress callback voor UI updates.
   ============================================================ */
async function autoWalkCatalogCore({
    leverancierId,
    maxPages = 50,
    tempo = 'normal',
    useAi = false,
    scope,
    scopeKeywords,
    syncRunId,
    startUrl,
    onProgress,
}) {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error('Geen actieve tab gevonden');

    const cap = Math.min(Math.max(1, Number(maxPages) || 50), 100);
    const visited = new Set();

    let pagesScanned = 0;
    let productsSeen = 0;
    let batchesSent = 0;
    let emptyPages = 0;
    let failures = 0;
    const errors = [];

    let nextUrl = normalizeUrlLoose(startUrl || tab.url || '');
    if (!nextUrl) throw new Error('Geen geldige start URL');

    awLog(syncRunId, 'START', { nextUrl, cap, tempo, useAi, leverancierId });

    while (nextUrl && pagesScanned < cap) {
        if (isCancelledSafe(syncRunId)) {
            awWarn(syncRunId, 'Cancelled, stop');
            break;
        }

        const key = canonicalPageKey(nextUrl);
        if (visited.has(key)) {
            awWarn(syncRunId, 'Loop detected, stop', { nextUrl });
            break;
        }
        visited.add(key);

        try {
            const realBefore = await getRealTabUrl(tab.id);
            if (canonicalPageKey(realBefore) !== canonicalPageKey(nextUrl)) {
                awLog(syncRunId, 'navigate', { from: realBefore, to: nextUrl });
                await withStepTimeout('navigateAndWait', 60000, async () => {
                    await navigateAndWait(tab.id, nextUrl, syncRunId);
                });
            }
        } catch (e) {
            failures++;
            errors.push(`navigate ${nextUrl}: ${toErrorMessage(e)}`);
            awWarn(syncRunId, 'navigateAndWait failed (continue)', toErrorMessage(e));
        }

        const currentUrl = normalizeUrlLoose((await getRealTabUrl(tab.id)) || nextUrl);
        awLog(syncRunId, `PAGE ${pagesScanned + 1}/${cap}`, { currentUrl });

        let pageResult;
        try {
            pageResult = await extractCatalogPage({
                tabId: tab.id,
                pageUrl: currentUrl,
                tempo, useAi, scope, scopeKeywords, syncRunId,
            });
        } catch (e) {
            failures++;
            errors.push(`extract ${currentUrl}: ${toErrorMessage(e)}`);
            awErr(syncRunId, 'extractCatalogPage crashed', toErrorMessage(e));
            pageResult = { producten: [], nextUrl: null, debug: { crash: toErrorMessage(e) } };
        }

        const pageProducten = dedupeProductList(pageResult.producten || []);
        const count = pageProducten.length;

        pagesScanned += 1;
        productsSeen += count;
        if (count === 0) emptyPages += 1;

        awLog(syncRunId, 'page result', {
            page: pagesScanned, count,
            extractNext: pageResult.nextUrl || null,
            debug: pageResult.debug,
        });

        if (count > 0) {
            try {
                await withStepTimeout('sendBatch', 30000, async () => {
                    for (let i = 0; i < pageProducten.length; i += BATCH_SIZE) {
                        const batch = pageProducten.slice(i, i + BATCH_SIZE);
                        await BBQ.sendBatch({
                            syncRunId, leverancierId, pageUrl: currentUrl,
                            pagesScanned: i === 0 ? 1 : 0, producten: batch,
                        });
                    }
                });
                batchesSent += 1;
            } catch (e) {
                failures++;
                errors.push(`batch page ${pagesScanned}: ${toErrorMessage(e)}`);
                awErr(syncRunId, 'sendBatch failed', toErrorMessage(e));
            }
        }

        if (typeof onProgress === 'function') {
            try {
                await onProgress({ pagesScanned, productsSeen, currentUrl, errors: errors.slice(-5) });
            } catch (e) {
                awWarn(syncRunId, 'onProgress failed (continue)', toErrorMessage(e));
            }
        }

        /* IMPORTANT: fallback ALTIJD, ook bij 0 producten — sommige pagina's
           tussen ?page=1..N hebben tijdelijke 0 (lazy-load fail) maar de
           volgende heeft weer producten. */
        let foundNext = normalizeUrlLoose(pageResult.nextUrl || '');
        if (!foundNext) {
            foundNext = buildNextPageFallbackSafe(currentUrl);
            awLog(syncRunId, 'next fallback', { from: currentUrl, to: foundNext });
        }

        /* Stop-conditie: 3 lege pagina's achter elkaar = einde categorie */
        if (emptyPages >= 3) {
            awLog(syncRunId, 'stop: 3 empty pages in a row');
            break;
        }
        if (!foundNext) {
            awLog(syncRunId, 'No next page -> stop');
            break;
        }
        if (visited.has(canonicalPageKey(foundNext))) {
            awWarn(syncRunId, 'Next already visited -> stop', { foundNext });
            break;
        }

        nextUrl = foundNext;

        const delay = getTempoDelaySafe(tempo);
        if (delay > 0 && !isCancelledSafe(syncRunId)) {
            await cancellableSleep(delay, syncRunId);
        }
    }

    const result = {
        ok: true,
        pagesScanned, productsSeen, batchesSent, emptyPages, failures,
        errors,
        stoppedByCap: pagesScanned >= cap,
    };
    awLog(syncRunId, 'DONE', result);
    return result;
}

/* ============================================================
   autoWalkCatalog — wrapper: BBQ.startSync/finishSync/setSyncState
   omheen autoWalkCatalogCore. Behoud van bestaande popup-UI.
   ============================================================ */
async function autoWalkCatalog({ leverancierId, maxPages, delayMs, useAi, tempo }) {
    const tab = await getActiveTab();
    if (!tab) throw new Error('Geen actief tabblad');

    const start = await BBQ.startSync({
        leverancierId, mode: 'full', portalUrl: tab.url,
    });
    const syncRunId = start.syncRunId;
    const scope = start?.leverancier?.scope_filter || 'alles';
    const scopeKeywords = start?.leverancier?.scope_keywords || [];

    resetCancel(syncRunId);

    await setSyncState({
        running: true, mode: 'full', leverancierId, syncRunId,
        startedAt: Date.now(), pagesScanned: 0, productsSeen: 0, errors: [],
        currentUrl: tab.url,
    });

    try {
        const result = await autoWalkCatalogCore({
            leverancierId,
            maxPages: maxPages || 50,
            tempo,
            useAi,
            scope, scopeKeywords,
            syncRunId,
            startUrl: tab.url,
            onProgress: async ({ pagesScanned, productsSeen, currentUrl, errors }) => {
                await setSyncState({
                    running: true, mode: 'full', leverancierId, syncRunId,
                    startedAt: (await getSyncState())?.startedAt || Date.now(),
                    pagesScanned, productsSeen,
                    errors: errors || [],
                    currentUrl: currentUrl || tab.url,
                });
            },
        });

        if (isCancelled(syncRunId)) {
            await BBQ.finishSync({ syncRunId, status: 'cancelled', errorText: 'door gebruiker geannuleerd' }).catch(() => {});
            await setSyncState({
                running: false, mode: 'full', leverancierId, syncRunId,
                done: true, cancelled: true,
                pagesScanned: result.pagesScanned, productsSeen: result.productsSeen,
                currentUrl: (await getRealTabUrl(tab.id)) || tab.url,
            });
            return { ok: true, cancelled: true, productsSeen: result.productsSeen };
        }

        const status = result.failures > 0
            ? (result.productsSeen > 0 ? 'partial' : 'failed')
            : 'completed';
        const errorText = result.errors?.length ? result.errors.slice(0, 5).join('; ') : null;

        await BBQ.finishSync({ syncRunId, status, errorText });
        await setSyncState({
            running: false, mode: 'full', leverancierId, syncRunId,
            done: true,
            pagesScanned: result.pagesScanned,
            productsSeen: result.productsSeen,
            errors: result.errors || [],
            currentUrl: (await getRealTabUrl(tab.id)) || tab.url,
            startedAt: (await getSyncState())?.startedAt,
        });
        return { ok: true, pagesScanned: result.pagesScanned, productsSeen: result.productsSeen, errors: result.errors };
    } catch (e) {
        await BBQ.finishSync({ syncRunId, status: 'failed', errorText: String(e?.message || e) }).catch(() => {});
        await setSyncState({
            running: false, error: String(e?.message || e), syncRunId,
        });
        throw e;
    }
}

/* ─── Message router ─── */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'BBQ_VERSION') {
        sendResponse({ version: BG_VERSION });
        return true;
    }
    if (msg.type === 'BBQ_GET_STATE') {
        getSyncState().then(state => sendResponse({ state }));
        return true;
    }
    if (msg.type === 'BBQ_CLEAR_STATE') {
        clearSyncState().then(() => sendResponse({ ok: true }));
        return true;
    }
    if (msg.type === 'BBQ_CANCEL_SYNC') {
        getSyncState().then(async state => {
            requestCancel(state?.syncRunId);
            if (state) await setSyncState({ ...state, cancelRequested: true, status: 'annuleren…' });
            sendResponse({ ok: true });
        });
        return true;
    }
    if (msg.type === 'BBQ_SCAN_PAGE') {
        scanCurrentPage(msg.options || {})
            .then(r => sendResponse({ ok: true, ...r }))
            .catch(e => sendResponse({ ok: false, error: String(e?.message || e) }));
        return true;
    }
    if (msg.type === 'BBQ_AUTO_WALK') {
        autoWalkCatalog(msg.options || {})
            .then(r => sendResponse({ ok: true, ...r }))
            .catch(e => sendResponse({ ok: false, error: String(e?.message || e) }));
        return true;
    }
    if (msg.type === 'BBQ_DEEP_CRAWL') {
        deepCrawlSite(msg.options || {})
            .then(r => sendResponse({ ok: true, ...r }))
            .catch(e => sendResponse({ ok: false, error: String(e?.message || e) }));
        return true;
    }
    return false;
});
