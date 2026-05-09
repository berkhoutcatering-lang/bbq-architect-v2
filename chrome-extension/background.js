/**
 * Service worker: orchestreert sync-runs, batchen + posten naar BBQ Architect.
 *
 * State: sync-state in chrome.storage.session zodat popup ook na sluiten/openen
 * de progress kan blijven tonen.
 */

importScripts('api.js', 'adapters.js');

const BG_VERSION = '0.3.3';   // bump bij elke release; popup checkt mismatch
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

/** tabSend met timeout (default 12s). Voorkomt hangen als content-script crash of pagina geen reply geeft. */
async function tabSend(tabId, msg, timeoutMs = 12000) {
    return new Promise(resolve => {
        let done = false;
        const finish = (v) => { if (!done) { done = true; resolve(v); } };
        const timer = setTimeout(() => finish({ ok: false, error: `tabSend timeout na ${Math.round(timeoutMs/1000)}s` }), timeoutMs);
        try {
            chrome.tabs.sendMessage(tabId, msg, response => {
                clearTimeout(timer);
                /* chrome.runtime.lastError als content-script niet bestaat */
                if (chrome.runtime.lastError) {
                    finish({ ok: false, error: chrome.runtime.lastError.message });
                    return;
                }
                finish(response || null);
            });
        } catch (e) {
            clearTimeout(timer);
            finish({ ok: false, error: String(e?.message || e) });
        }
    });
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
 *  Hard timeout 25s. Onderbreekbaar via cancel-flag. */
async function humanizePage(tabId, tempo, syncRunId) {
    const flags = tempoFlags(tempo);
    if (flags.scroll) {
        const scrollPromise = tabSend(tabId, { type: 'BBQ_HUMAN_SCROLL' }, 25000);
        const cancelGuard = (async () => {
            while (!isCancelled(syncRunId)) await new Promise(r => setTimeout(r, 200));
            return { ok: false, cancelled: true };
        })();
        await Promise.race([scrollPromise, cancelGuard]);
    }
    if (flags.jitter && !isCancelled(syncRunId)) {
        await tabSend(tabId, { type: 'BBQ_JITTER', count: 4 }, 3000);
    }
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
                    await humanizePage(tab.id, tempoChoice, syncRunId);
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

    /* Diagnostic per scan-stap zodat Sam ziet WAT gewerkt heeft */
    const diag = { adapter: 0, vision: 0, html: 0, screenshots: 0, methods: [] };

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

        /* STAP 2 — Adapter (snel pad voor bekende portalen) */
        console.log('[BBQ scraper] STAP 2 — adapter scan');
        await setPhase('Snel-pad proberen…');
        const adapter = BBQ_detectAdapter(new URL(tab.url).hostname);
        if (adapter && !useAi) {
            const r = await tabSend(tab.id, { type: 'BBQ_EXTRACT_ADAPTER', adapter }, 5000);
            if (r?.ok && Array.isArray(r.producten)) {
                diag.adapter = r.producten.length;
                console.log('[BBQ scraper] adapter (' + adapter.naam + '): ' + r.producten.length + ' producten');
                if (r.producten.length > 0) {
                    diag.methods.push('adapter');
                    producten = r.producten;
                }
            }
        } else {
            console.log('[BBQ scraper] adapter overgeslagen — geen adapter of useAi=true');
        }

        /* STAP 3 — Vision-mode: ALTIJD proberen tenzij adapter al >20 producten gaf
           (in dat geval is adapter goed genoeg; vision zou alleen kosten toevoegen) */
        if (!isCancelled(syncRunId) && producten.length < 20) {
            console.log('[BBQ scraper] STAP 3 — vision capture (max 3 shots)');
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
                        signal: getScanSignal(),  /* kan AbortError gooien bij cancel */
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
                        /* User-cancel — netjes afsluiten zonder fallback */
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
        } else {
            console.log('[BBQ scraper] vision overgeslagen — adapter al ' + producten.length + ' producten');
        }

        /* STAP 4 — HTML-mode allerlaatst (vaak slecht op SPA's maar kost geen extra image-tokens) */
        if (!isCancelled(syncRunId) && producten.length === 0) {
            console.log('[BBQ scraper] STAP 4 — HTML fallback');
            await setPhase('HTML-fallback proberen…');
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
                    if (htmlList.length > 0) {
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
            `adapter:${diag.adapter}`,
            `vision(${diag.screenshots}×):${diag.vision}`,
            `html:${diag.html}`,
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

/**
 * Auto-walk: loop door pagina's via adapter "next"-link of AI-detect's next_page_url.
 * Stop bij: geen next, max-pages-cap (50), of user-cancel.
 */
async function autoWalkCatalog({ leverancierId, maxPages, delayMs, useAi, tempo }) {
    const tab = await getActiveTab();
    if (!tab) throw new Error('Geen actief tabblad');

    const start = await BBQ.startSync({
        leverancierId, mode: 'full', portalUrl: tab.url,
    });
    const syncRunId = start.syncRunId;
    const scope = start?.leverancier?.scope_filter || 'alles';
    const scopeKeywords = start?.leverancier?.scope_keywords || [];
    const adapter = BBQ_detectAdapter(new URL(tab.url).hostname);

    resetCancel(syncRunId);

    await setSyncState({
        running: true, mode: 'full', leverancierId, syncRunId,
        startedAt: Date.now(), pagesScanned: 0, productsSeen: 0, errors: [],
        currentUrl: tab.url,
    });

    let pagesScanned = 0;
    let productsSeen = 0;
    let nextUrl = tab.url;
    const cap = Math.min(Math.max(1, maxPages || 50), 100);
    const errors = [];
    /* tempo wint over delayMs als gezet */
    const useTempo = tempo && TEMPO_PRESETS[tempo];
    const baseWait = useTempo ? null : Math.max(500, delayMs || PAGE_DELAY_MS_DEFAULT);
    const wait = () => useTempo ? tempoDelay(tempo) : baseWait;

    async function checkCancelAW() {
        if (!isCancelled(syncRunId)) return false;
        try { await BBQ.finishSync({ syncRunId, status: 'cancelled', errorText: 'door gebruiker geannuleerd' }); } catch { /* ignore */ }
        await setSyncState({
            running: false, mode: 'full', leverancierId, syncRunId,
            done: true, cancelled: true, pagesScanned, productsSeen, errors,
            currentUrl: tab.url,
        });
        return true;
    }

    /* Per-pagina hard timeout — voorkomt dat 1 trage pagina alles vastlegt */
    const PAGE_HARD_TIMEOUT_MS = 120000;

    try {
        while (nextUrl && pagesScanned < cap) {
            if (await checkCancelAW()) return { ok: true, cancelled: true, productsSeen };

            let pageProducten = [];
            let foundNext = null;
            try {
                await withTimeout(`pagina ${(nextUrl||'').slice(0, 80)}`, (async () => {
                    /* Navigate als nodig */
                    if (tab.url !== nextUrl) {
                        await navigateAndWait(tab.id, nextUrl, syncRunId);
                        if (isCancelled(syncRunId)) return;
                    }
                    tab.url = nextUrl;

                    /* Humanize bij hogere tempos */
                    if (useTempo) await humanizePage(tab.id, tempo, syncRunId);
                    if (isCancelled(syncRunId)) return;

                    /* Extract via adapter eerst */
                    if (adapter && !useAi) {
                        const r = await tabSend(tab.id, { type: 'BBQ_EXTRACT_ADAPTER', adapter }, 5000);
                        if (r?.ok) {
                            pageProducten = r.producten || [];
                            foundNext = r.nextUrl;
                        }
                    }
                    /* Fallback OR forced AI-detect */
                    if (pageProducten.length === 0 || useAi) {
                        const html = await tabSend(tab.id, { type: 'BBQ_GET_HTML' }, 8000);
                        if (html?.ok) {
                            if (isCancelled(syncRunId)) return;
                            const ai = await BBQ.aiDetect({ html: html.html, pageUrl: tab.url, scope, scopeKeywords });
                            pageProducten = ai.producten || [];
                            foundNext = foundNext || ai.next_page_url;
                        }
                    }
                }), PAGE_HARD_TIMEOUT_MS);
            } catch (e) {
                errors.push(`${nextUrl}: ${e.message}`);
                /* Skip pagina + door; geen retry */
            }
            if (await checkCancelAW()) return { ok: true, cancelled: true, productsSeen };

            if (pageProducten.length > 0) {
                for (let i = 0; i < pageProducten.length; i += BATCH_SIZE) {
                    const batch = pageProducten.slice(i, i + BATCH_SIZE);
                    try {
                        await BBQ.sendBatch({
                            syncRunId, leverancierId, pageUrl: tab.url,
                            pagesScanned: i === 0 ? 1 : 0, producten: batch,
                        });
                    } catch (e) {
                        errors.push(`page ${pagesScanned + 1}: ${e.message}`);
                    }
                }
            }

            pagesScanned++;
            productsSeen += pageProducten.length;

            await setSyncState({
                running: true, mode: 'full', leverancierId, syncRunId,
                startedAt: (await getSyncState())?.startedAt || Date.now(),
                pagesScanned, productsSeen, errors,
                currentUrl: tab.url,
            });

            /* Fallback paginering: als geen foundNext maar wel producten,
               probeer ?page=N+1 zelf (voor SPA-stores zonder klassieke pagination link) */
            if (!foundNext && pageProducten.length > 0) {
                foundNext = buildNextPageFallback(tab.url);
            }

            nextUrl = foundNext;
            if (nextUrl) {
                await cancellableSleep(wait(), syncRunId);
                if (await checkCancelAW()) return { ok: true, cancelled: true, productsSeen };
            }
        }

        const status = errors.length === 0 ? 'completed' : (productsSeen > 0 ? 'partial' : 'failed');
        await BBQ.finishSync({ syncRunId, status, errorText: errors.slice(0, 5).join('; ') || null });
        await setSyncState({
            running: false, mode: 'full', leverancierId, syncRunId,
            done: true, pagesScanned, productsSeen, errors,
            currentUrl: tab.url, startedAt: (await getSyncState())?.startedAt,
        });
        return { ok: true, pagesScanned, productsSeen, errors };
    } catch (e) {
        await BBQ.finishSync({ syncRunId, status: 'failed', errorText: String(e?.message || e) }).catch(() => {});
        await setSyncState({
            running: false, error: String(e?.message || e), syncRunId,
            pagesScanned, productsSeen,
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
