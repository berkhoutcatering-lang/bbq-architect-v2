/**
 * Content-script: draait in elke pagina, luistert naar messages van background/popup,
 * extracteert producten via adapter-selectors of stuurt page-HTML naar AI-detect.
 *
 * Geen state — pure RPC. Background houdt sync-status bij.
 */

(function () {
    /* parsePrice: NL formaat naar number. "€ 19,75" → 19.75 */
    function parsePrice(text) {
        if (!text) return null;
        const m = String(text).replace(/\s+/g, '').match(/(-?\d+(?:[.,]\d+)?)/);
        if (!m) return null;
        const n = parseFloat(m[1].replace('.', '').replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    }

    function textOf(el, sel) {
        if (!el) return null;
        if (!sel) return el.innerText?.trim() || null;
        const sub = el.querySelector(sel);
        return sub?.innerText?.trim() || null;
    }

    function extractWithAdapter(adapter) {
        const cards = document.querySelectorAll(adapter.selectors.productCard);
        const producten = [];
        cards.forEach(card => {
            const naam = textOf(card, adapter.selectors.naam);
            const prijsRaw = textOf(card, adapter.selectors.prijs);
            const eenheid = textOf(card, adapter.selectors.eenheid);
            const prijs = parsePrice(prijsRaw);
            if (naam && prijs && prijs > 0) {
                producten.push({
                    naam: naam.slice(0, 200),
                    prijs,
                    eenheid: eenheid ? eenheid.slice(0, 40) : 'stuks',
                    confidence: 0.95,
                });
            }
        });
        const nextLink = adapter.next ? document.querySelector(adapter.next) : null;
        return {
            producten,
            nextUrl: nextLink ? nextLink.href : null,
            pageUrl: window.location.href,
        };
    }

    /* Strip noise uit HTML zodat Claude alleen de echte productlijst krijgt.
       Verwijdert layout-elementen (header/nav/footer/aside) én alle "ruis"-blokken
       (recommendations, recently-viewed, cross-sell, sidebar, hero, cookie-banner,
       newsletter, breadcrumbs, ads). Voorkomt dat featured / aanbevolen items als
       producten worden meegerekend. */
    function stripHtmlNoise(root) {
        /* Pass 1: harde tags */
        root.querySelectorAll('script, style, svg, iframe, noscript, link, meta').forEach(n => n.remove());

        /* Pass 2: layout chrome */
        root.querySelectorAll('header, nav, footer, aside').forEach(n => n.remove());

        /* Pass 3: noise via class/id/aria. Case-insensitive partial match.
           Sortering: meest voorkomende patronen eerst voor performance. */
        const NOISE_SELECTORS = [
            '[class*="recommend" i]', '[class*="related" i]', '[class*="cross-sell" i]',
            '[class*="upsell" i]', '[class*="recently" i]', '[class*="recent-view" i]',
            '[class*="suggest" i]', '[class*="popular" i]', '[class*="featured" i]',
            '[class*="carousel" i]', '[class*="slider" i]',
            '[class*="sidebar" i]', '[class*="rail" i]',
            '[class*="breadcrumb" i]', '[class*="hero-banner" i]', '[class*="hero__" i]',
            '[class*="promo-banner" i]', '[class*="advert" i]', '[class*="banner-top" i]',
            '[class*="cookie" i]', '[class*="newsletter" i]', '[class*="signup" i]',
            '[class*="filter-bar" i]', '[class*="sort-bar" i]',
            '[id*="recommend" i]', '[id*="related" i]', '[id*="sidebar" i]',
            '[id*="carousel" i]', '[id*="newsletter" i]', '[id*="cookie" i]',
            '[aria-label*="aanbevol" i]', '[aria-label*="gerelateerd" i]',
            '[aria-label*="recently" i]', '[aria-label*="recommend" i]',
            '[role="banner"]', '[role="complementary"]', '[role="navigation"]',
            '[role="contentinfo"]',
        ];
        NOISE_SELECTORS.forEach(sel => {
            try {
                root.querySelectorAll(sel).forEach(n => n.remove());
            } catch { /* invalid selector — skip */ }
        });

        /* Pass 4: lege containers wegpoetsen die na strip overblijven */
        root.querySelectorAll('div, section').forEach(el => {
            if (!el.children.length && !(el.textContent || '').trim()) el.remove();
        });
    }

    /* Probeer de PRIMARY productgrid te vinden — element met de meeste herhaalde
       directe children van dezelfde tag. Spaart Claude veel input-tokens en
       sluit suggestie-grids uit (die hebben meestal <8 items). */
    function findProductGrid(root) {
        const candidates = root.querySelectorAll('div, ul, ol, section');
        let best = null;
        let bestScore = 0;
        candidates.forEach(c => {
            const n = c.children.length;
            if (n < 8) return;
            const tags = {};
            for (const child of c.children) {
                tags[child.tagName] = (tags[child.tagName] || 0) + 1;
            }
            const top = Math.max(...Object.values(tags));
            /* >75% homogeen + minimaal 8 items */
            if (top / n >= 0.75 && top > bestScore) {
                bestScore = top;
                best = c;
            }
        });
        return best;
    }

    function getCleanHtml() {
        const root =
            document.querySelector('main') ||
            document.querySelector('#main') ||
            document.querySelector('.main-content') ||
            document.querySelector('[role="main"]') ||
            document.body;
        const clone = root.cloneNode(true);

        stripHtmlNoise(clone);

        /* Als we een duidelijke productgrid kunnen vinden: gebruik die, behoud
           wel de paginering die meestal eronder of erboven staat */
        const grid = findProductGrid(clone);
        if (grid) {
            const wrapper = document.createElement('div');
            wrapper.setAttribute('data-bbq-grid', '1');
            wrapper.appendChild(grid.cloneNode(true));
            /* Paginatie context erbij: zoek <nav> of element met "pagination" class */
            const pag = clone.querySelector('[class*="pagination" i], [class*="paging" i], [aria-label*="pagina" i], [aria-label*="page" i]');
            if (pag) wrapper.appendChild(pag.cloneNode(true));
            return wrapper.outerHTML.slice(0, 200000);
        }
        return clone.outerHTML.slice(0, 200000);
    }

    /** Fallback link-extractor: pak ALLE same-origin <a href> die naar product/categorie kunnen wijzen.
     *  Filtert duidelijke non-product URLs (login, contact, blog, social etc.).
     *  Returnt unique URLs, max 80. Wordt gebruikt als AI-detect 0 category_links returnt. */
    function extractCandidateLinks() {
        const SKIP = /\/(login|account|register|aanmelden|cart|winkelwagen|checkout|wishlist|favorieten|contact|over|about|privacy|terms|voorwaarden|leveringsvoorwaarden|garantie|retour|cookies|sitemap|blog|nieuws|inspiratie|werken-bij|pers)(\/|$|\?)/i;
        const SOCIAL = /(facebook|instagram|youtube|linkedin|twitter|x\.com|tiktok|pinterest|whatsapp|mailto:|tel:)/i;
        const ext = /\.(pdf|jpg|jpeg|png|gif|svg|webp|mp4|mp3|zip)(\?|$)/i;
        const origin = window.location.origin;
        const seen = new Set();
        const out = [];
        for (const a of document.querySelectorAll('a[href]')) {
            try {
                const u = new URL(a.getAttribute('href'), window.location.href);
                if (u.origin !== origin) continue;
                u.hash = '';
                const href = u.toString();
                if (seen.has(href)) continue;
                if (SKIP.test(u.pathname)) continue;
                if (SOCIAL.test(href)) continue;
                if (ext.test(href)) continue;
                if (href === window.location.href) continue;
                seen.add(href);
                out.push(href);
                if (out.length >= 80) break;
            } catch { /* ignore */ }
        }
        return out;
    }

    /* Human-like scroll met lazy-load detectie:
       Scroll in passes tot DOM stabiliseert. Klik ook "Toon meer"-knoppen.
       Triggert Shopify/React/Vue lazy-load + infinite-scroll patterns.

       opts.noLoadMore: skip load-more clicks. Gebruikt door auto-walk omdat
       die zelf via ?page=N+1 navigeert — dubbele paginering verstoort de scan. */
    async function humanScroll(opts) {
        opts = opts || {};
        const skipLoadMore = !!opts.noLoadMore;
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const viewportHeight = window.innerHeight;
        const MAX_PASSES = 12;            // hard cap
        const STABLE_REQUIRED = 2;        // 2× achter elkaar zelfde height = klaar
        let lastHeight = 0;
        let stableCount = 0;

        /* Tekst-patronen voor load-more knoppen — werkt op sites met hashed
           classes (Sligro, Makro) waar class-based detectie faalt. Strikt zodat
           we geen random nav-items (zoals "Volgende stap" in een checkout) klikken. */
        const LOAD_MORE_TEXT = [
            /^volgende\s+producten\s*$/i,
            /^volgende\s+(items|artikelen|resultaten)\s*$/i,
            /^toon\s+meer\s*(producten|items|resultaten)?\s*$/i,
            /^meer\s+(laden|producten|items|tonen)\s*$/i,
            /^laad\s+meer\s*$/i,
            /^load\s+more\s*(products|items|results)?\s*$/i,
            /^show\s+more\s*(products|items|results)?\s*$/i,
            /^next\s+(products|items|results)\s*$/i,
        ];
        const matchesLoadMore = (txt) => {
            const t = (txt || '').trim();
            if (!t || t.length > 50) return false;
            return LOAD_MORE_TEXT.some(re => re.test(t));
        };

        /* Stop met load-more klikken als 't een page-navigation triggert
           (sommige sites zoals Sligro vervangen DOM ipv stapelen) */
        let stopLoadMore = false;

        for (let pass = 0; pass < MAX_PASSES; pass++) {
            /* URL snapshot vóór click-pass — zien we navigation, dan was de
               "load-more" knop eigenlijk een page-link en moeten we stoppen. */
            const urlBeforeClicks = window.location.href;
            let clickedAny = false;

            if (!stopLoadMore && !skipLoadMore) {
                /* Pas 1: class-based detectie */
                const loadMoreSelectors = [
                    'button[class*="load-more" i]',
                    'a[class*="load-more" i]',
                    'button[class*="show-more" i]',
                    'a[class*="show-more" i]',
                    'button[class*="toon-meer" i]',
                    'button[class*="meer-laden" i]',
                    'button[data-action*="load" i]',
                    '[class*="pagination__load" i]',
                ];
                for (const sel of loadMoreSelectors) {
                    const btns = document.querySelectorAll(sel);
                    btns.forEach(btn => {
                        const txt = (btn.innerText || '').toLowerCase();
                        if (/meer|more|load|toon|volgende/.test(txt)) {
                            try { btn.click(); clickedAny = true; } catch { /* ignore */ }
                        }
                    });
                }
                /* Pas 2: tekst-based (voor hashed classes) */
                const clickables = document.querySelectorAll(
                    'button, a[role="button"], [role="button"], a.button, .btn, [class*="button" i]'
                );
                clickables.forEach(btn => {
                    if (matchesLoadMore(btn.innerText || btn.textContent)) {
                        try { btn.click(); clickedAny = true; } catch { /* ignore */ }
                    }
                });

                /* Korte wachttijd zodat eventuele navigation/append trigger */
                if (clickedAny) {
                    await sleep(700);
                    if (window.location.href !== urlBeforeClicks) {
                        /* De load-more knop was een page-navigation — stop met
                           klikken anders gaan we paginas vooruit zonder iets te
                           pakken. Auto-walk pakt deze site beter. */
                        console.warn('[BBQ scraper] load-more triggert URL-navigation → stop met klikken, gebruik auto-walk paginering voor deze site');
                        stopLoadMore = true;
                    }
                }
            }

            /* Scroll naar bottom in step-vorm */
            const fullHeight = document.documentElement.scrollHeight;
            const targetY = fullHeight - viewportHeight;
            let scrollTo = window.scrollY;
            const step = Math.floor(viewportHeight * 0.6);
            while (scrollTo < targetY) {
                scrollTo = Math.min(scrollTo + step, targetY);
                window.scrollTo({ top: scrollTo, behavior: 'smooth' });
                await sleep(250 + Math.random() * 250);
            }

            /* Wacht extra voor lazy-load + AJAX */
            await sleep(800 + Math.random() * 600);

            /* Check of DOM is gegroeid */
            const newHeight = document.documentElement.scrollHeight;
            if (newHeight === lastHeight) {
                stableCount++;
                if (stableCount >= STABLE_REQUIRED) break;
            } else {
                stableCount = 0;
                lastHeight = newHeight;
            }
        }

        /* Scroll terug naar top zodat AI-detect's snapshot consistent is */
        window.scrollTo({ top: 0, behavior: 'auto' });
        await sleep(300);
    }

    /* Random mouse-move events (anti-bot mitigatie) */
    function jitterMouse() {
        const evt = new MouseEvent('mousemove', {
            bubbles: true, cancelable: true,
            clientX: Math.floor(Math.random() * window.innerWidth),
            clientY: Math.floor(Math.random() * window.innerHeight),
        });
        document.dispatchEvent(evt);
    }

    /* ────────────────────────────────────────────────────────────────────
       Message listener — uitgebreid met debug-events, per-handler timing,
       en richer responses. Wraps de in deze IIFE-scope gedefinieerde
       humanScroll / getCleanHtml / jitterMouse / extractCandidateLinks.

       Guard via __BBQ_CONTENT_LISTENER_INSTALLED__ voorkomt dat we bij
       auto-re-injection van het content script een tweede listener krijgen.
       Debug-log per call leesbaar via:
         window.__BBQ_CONTENT_EVENT_LOG__
         OR  tabSend({ type: 'BBQ_DEBUG_DUMP' })
       ──────────────────────────────────────────────────────────────────── */
    (() => {
        if (window.__BBQ_CONTENT_LISTENER_INSTALLED__) {
            console.log('[BBQ content] listener already installed');
            return;
        }
        window.__BBQ_CONTENT_LISTENER_INSTALLED__ = true;

        const DEBUG = true;
        const MAX_EVENT_LOG = 200;
        window.__BBQ_CONTENT_EVENT_LOG__ = window.__BBQ_CONTENT_EVENT_LOG__ || [];

        function dlog(...args) {
            if (DEBUG) console.log('[BBQ content]', ...args);
        }

        function toErrorMessage(err) {
            if (!err) return 'unknown error';
            if (typeof err === 'string') return err;
            return err.message || String(err);
        }

        function pushEvent(type, payload = {}) {
            const item = {
                ts: Date.now(),
                iso: new Date().toISOString(),
                type,
                url: location.href,
                ...payload,
            };
            window.__BBQ_CONTENT_EVENT_LOG__.push(item);
            if (window.__BBQ_CONTENT_EVENT_LOG__.length > MAX_EVENT_LOG) {
                window.__BBQ_CONTENT_EVENT_LOG__.splice(
                    0,
                    window.__BBQ_CONTENT_EVENT_LOG__.length - MAX_EVENT_LOG
                );
            }
        }

        function pageMeta() {
            const cardsGuess = document.querySelectorAll(
                '[data-product-id], .product, .product-tile, .product-card, li[class*="product"], article[class*="product"]'
            ).length;

            const nextEl =
                document.querySelector('a[rel="next"]') ||
                [...document.querySelectorAll('a,button')].find((el) =>
                    /volgende producten|volgende|next/i.test((el.textContent || '').trim())
                );

            return {
                href: location.href,
                title: document.title,
                readyState: document.readyState,
                scrollY: window.scrollY,
                viewport: { w: window.innerWidth, h: window.innerHeight },
                docHeight: Math.max(
                    document.body?.scrollHeight || 0,
                    document.documentElement?.scrollHeight || 0
                ),
                cardsGuess,
                hasNextGuess: !!nextEl,
            };
        }

        function withTimeoutLocal(label, ms, fn) {
            return Promise.race([
                fn(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Timeout in ${label} (${ms}ms)`)), ms)
                ),
            ]);
        }

        /* humanScroll / getCleanHtml / jitterMouse / extractCandidateLinks
           leven in dezelfde IIFE-closure — direct aanroepbaar. */
        async function callHumanScroll(noLoadMore) {
            return await humanScroll({ noLoadMore: !!noLoadMore });
        }
        async function callGetCleanHtml() {
            return getCleanHtml();
        }
        async function callAutoExtract() {
            if (window.BBQ_AutoExtractor && typeof window.BBQ_AutoExtractor.run === 'function') {
                return await window.BBQ_AutoExtractor.run();
            }
            return { ok: false, producten: [], nextUrl: null, reason: 'BBQ_AutoExtractor niet geladen' };
        }
        async function callJitter(count = 4) {
            const c = Math.max(1, Math.min(20, Number(count) || 4));
            for (let i = 0; i < c; i++) {
                jitterMouse();
                await new Promise((r) => setTimeout(r, 60 + Math.floor(Math.random() * 140)));
            }
            return { ok: true, count: c };
        }

        function normalizeAutoExtractResult(raw) {
            const producten = Array.isArray(raw?.producten)
                ? raw.producten
                : Array.isArray(raw?.products)
                ? raw.products
                : [];
            const nextUrl =
                raw?.nextUrl ||
                raw?.next_url ||
                raw?.nextPageUrl ||
                raw?.next_page_url ||
                null;
            return { ok: raw?.ok !== false, producten, nextUrl, raw };
        }

        async function handleMessage(message) {
            const type = message?.type;
            const started = performance.now();
            const before = pageMeta();

            pushEvent('message:received', { type, before });

            if (type === 'BBQ_PING') {
                return {
                    ok: true,
                    pong: true,
                    ts: Date.now(),
                    hostname: location.hostname,
                    url: location.href,
                    meta: before,
                };
            }

            if (type === 'BBQ_HUMAN_SCROLL') {
                const noLoadMore = !!message?.noLoadMore;
                try {
                    const data = await withTimeoutLocal('HUMAN_SCROLL', 30000, async () =>
                        await callHumanScroll(noLoadMore)
                    );
                    const response = {
                        ok: true,
                        data: data || null,
                        noLoadMore,
                        debug: {
                            durationMs: Math.round(performance.now() - started),
                            before,
                            after: pageMeta(),
                        },
                    };
                    pushEvent('message:response', { type, ok: true, durationMs: response.debug.durationMs });
                    return response;
                } catch (err) {
                    const response = {
                        ok: false,
                        error: toErrorMessage(err),
                        noLoadMore,
                        debug: {
                            durationMs: Math.round(performance.now() - started),
                            before,
                            after: pageMeta(),
                        },
                    };
                    pushEvent('message:error', { type, error: response.error });
                    return response;
                }
            }

            if (type === 'BBQ_EXTRACT_BY_SELECTORS') {
                try {
                    if (!window.BBQ_AutoExtractor || typeof window.BBQ_AutoExtractor.extractBySelectors !== 'function') {
                        return {
                            ok: false,
                            error: 'BBQ_AutoExtractor.extractBySelectors niet geladen',
                            producten: [],
                        };
                    }
                    const raw = window.BBQ_AutoExtractor.extractBySelectors(message?.selectors || {});
                    const list = Array.isArray(raw) ? raw : [];
                    const nextLink = document.querySelector('a[rel="next"], link[rel="next"]');
                    const response = {
                        ok: list.length > 0,
                        producten: list,
                        method: 'cache:selectors',
                        nextUrl: nextLink ? (nextLink.href || nextLink.getAttribute('href')) : null,
                        pageUrl: location.href,
                        debug: {
                            durationMs: Math.round(performance.now() - started),
                            count: list.length,
                            cardCount: (() => {
                                try {
                                    return message?.selectors?.productCard
                                        ? document.querySelectorAll(message.selectors.productCard).length
                                        : 0;
                                } catch { return -1; }
                            })(),
                            meta: pageMeta(),
                        },
                    };
                    pushEvent('message:response', { type, ok: response.ok, count: list.length });
                    return response;
                } catch (err) {
                    pushEvent('message:error', { type, error: toErrorMessage(err) });
                    return { ok: false, producten: [], error: toErrorMessage(err) };
                }
            }

            if (type === 'BBQ_AUTO_EXTRACT') {
                try {
                    const raw = await withTimeoutLocal('AUTO_EXTRACT', 7000, async () => callAutoExtract());
                    const n = normalizeAutoExtractResult(raw);
                    /* DOM-based nextUrl fallback (a[rel=next] / link[rel=next]) */
                    if (!n.nextUrl) {
                        const nextLink = document.querySelector('a[rel="next"], link[rel="next"]');
                        if (nextLink) n.nextUrl = nextLink.href || nextLink.getAttribute('href');
                    }
                    const response = {
                        ok: n.ok,
                        producten: n.producten,
                        method: raw?.method || null,
                        nextUrl: n.nextUrl,
                        pageUrl: location.href,
                        debug: {
                            durationMs: Math.round(performance.now() - started),
                            count: n.producten.length,
                            meta: pageMeta(),
                            rawKeys: raw && typeof raw === 'object' ? Object.keys(raw).slice(0, 30) : [],
                            reason: raw?.reason || null,
                            extractorDebug: raw?.debug || null,
                        },
                    };
                    pushEvent('message:response', {
                        type, ok: response.ok, count: response.producten.length, nextUrl: response.nextUrl,
                    });
                    return response;
                } catch (err) {
                    const response = {
                        ok: false,
                        producten: [],
                        nextUrl: null,
                        error: toErrorMessage(err),
                        debug: {
                            durationMs: Math.round(performance.now() - started),
                            meta: pageMeta(),
                        },
                    };
                    pushEvent('message:error', { type, error: response.error });
                    return response;
                }
            }

            if (type === 'BBQ_GET_HTML') {
                try {
                    const html = await withTimeoutLocal('GET_HTML', 10000, async () => callGetCleanHtml());
                    const htmlStr = typeof html === 'string' ? html : String(html || '');
                    const response = {
                        ok: !!htmlStr,
                        html: htmlStr,
                        url: location.href,
                        debug: {
                            durationMs: Math.round(performance.now() - started),
                            htmlLength: htmlStr.length,
                            meta: pageMeta(),
                        },
                    };
                    pushEvent('message:response', { type, ok: response.ok, htmlLength: response.debug.htmlLength });
                    return response;
                } catch (err) {
                    const response = {
                        ok: false,
                        html: '',
                        error: toErrorMessage(err),
                        debug: {
                            durationMs: Math.round(performance.now() - started),
                            meta: pageMeta(),
                        },
                    };
                    pushEvent('message:error', { type, error: response.error });
                    return response;
                }
            }

            if (type === 'BBQ_GET_LINKS') {
                try {
                    const links = extractCandidateLinks();
                    pushEvent('message:response', { type, ok: true, count: links.length });
                    return { ok: true, links, url: location.href };
                } catch (err) {
                    pushEvent('message:error', { type, error: toErrorMessage(err) });
                    return { ok: false, error: toErrorMessage(err) };
                }
            }

            if (type === 'BBQ_JITTER') {
                try {
                    const data = await withTimeoutLocal('JITTER', 5000, async () => callJitter(message?.count ?? 4));
                    return {
                        ok: true,
                        data,
                        debug: { durationMs: Math.round(performance.now() - started), meta: pageMeta() },
                    };
                } catch (err) {
                    return { ok: false, error: toErrorMessage(err) };
                }
            }

            if (type === 'BBQ_GET_DIMENSIONS') {
                return {
                    ok: true,
                    scrollHeight: document.documentElement.scrollHeight,
                    viewportHeight: window.innerHeight,
                    viewportWidth: window.innerWidth,
                    scrollY: window.scrollY,
                    devicePixelRatio: window.devicePixelRatio || 1,
                };
            }

            if (type === 'BBQ_SCROLL_TO') {
                const y = Math.max(0, Math.floor(message?.y || 0));
                window.scrollTo({ top: y, behavior: 'auto' });
                return { ok: true, scrollY: window.scrollY };
            }

            if (type === 'BBQ_DEBUG_DUMP') {
                return {
                    ok: true,
                    events: window.__BBQ_CONTENT_EVENT_LOG__.slice(-100),
                    meta: pageMeta(),
                };
            }

            return {
                ok: false,
                error: `Unknown message type: ${String(type)}`,
                debug: {
                    durationMs: Math.round(performance.now() - started),
                    meta: pageMeta(),
                },
            };
        }

        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            (async () => {
                try {
                    const result = await handleMessage(message || {});
                    sendResponse(result);
                } catch (err) {
                    sendResponse({
                        ok: false,
                        fatal: true,
                        error: toErrorMessage(err),
                        meta: pageMeta(),
                    });
                }
            })();
            return true; // async
        });

        dlog('listener installed', { href: location.href, readyState: document.readyState });
    })();
})();
