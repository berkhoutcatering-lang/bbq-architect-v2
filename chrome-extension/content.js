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

    function getCleanHtml() {
        /* Snapshot alleen de "main"-container indien aanwezig, anders body. */
        const root =
            document.querySelector('main') ||
            document.querySelector('#main') ||
            document.querySelector('.main-content') ||
            document.body;
        const clone = root.cloneNode(true);
        clone.querySelectorAll('script, style, svg, iframe, noscript').forEach(n => n.remove());
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
       Triggert Shopify/React/Vue lazy-load + infinite-scroll patterns.    */
    async function humanScroll() {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const viewportHeight = window.innerHeight;
        const MAX_PASSES = 12;            // hard cap
        const STABLE_REQUIRED = 2;        // 2× achter elkaar zelfde height = klaar
        let lastHeight = 0;
        let stableCount = 0;

        for (let pass = 0; pass < MAX_PASSES; pass++) {
            /* Klik "Toon meer" / "Load more" / "Show more" knoppen */
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
                        try { btn.click(); } catch { /* ignore */ }
                    }
                });
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

    /* Loaded eagerly in content scripts */
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        try {
            if (msg.type === 'BBQ_PING') {
                sendResponse({ ok: true, hostname: window.location.hostname, url: window.location.href });
                return true;
            }
            if (msg.type === 'BBQ_EXTRACT_ADAPTER') {
                const adapter = msg.adapter;
                if (!adapter) return sendResponse({ ok: false, error: 'no adapter' });
                const out = extractWithAdapter(adapter);
                sendResponse({ ok: true, ...out });
                return true;
            }
            if (msg.type === 'BBQ_GET_HTML') {
                sendResponse({ ok: true, html: getCleanHtml(), url: window.location.href });
                return true;
            }
            if (msg.type === 'BBQ_GET_LINKS') {
                sendResponse({ ok: true, links: extractCandidateLinks(), url: window.location.href });
                return true;
            }
            if (msg.type === 'BBQ_HUMAN_SCROLL') {
                humanScroll().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: String(e) }));
                return true;
            }
            if (msg.type === 'BBQ_JITTER') {
                for (let i = 0; i < (msg.count || 3); i++) jitterMouse();
                sendResponse({ ok: true });
                return true;
            }
            if (msg.type === 'BBQ_NAVIGATE') {
                window.location.href = msg.url;
                sendResponse({ ok: true });
                return true;
            }
        } catch (e) {
            sendResponse({ ok: false, error: String(e?.message || e) });
            return true;
        }
        return false;
    });
})();
