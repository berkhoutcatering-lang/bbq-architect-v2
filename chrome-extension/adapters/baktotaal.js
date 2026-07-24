/* adapters/baktotaal — eerste volledig ondersteunde leverancieradapter.
 *
 * Bevestigd via live-onderzoek (23-07-2026, ingelogd zakelijk-portaal):
 *   • Origin: https://zakelijk.baktotaal.nl (zakelijke groothandelsprijzen, EXCL. BTW)
 *   • GEEN interne JSON/product-API — server-rendered Magento (thema Epartment).
 *     → DOM-route: haal de categoriepagina-HTML op met de INGELOGDE sessie en
 *       parse de productkaarten (offscreen, want de SW heeft geen DOM).
 *   • Productkaart: .product-item ; naam+URL: a.product-item-link ;
 *     SKU: data-product-id op .product-item-info ; verpakking staat IN de naam
 *     ("… 1kg", "… (10 kg)") → parsePackaging leest dat uit.
 *   • Paginering: echte next-link, ?p=N (nooit gefabriceerd).
 *   • Prijzen alleen zichtbaar wanneer ingelogd ("… om prijzen te bekijken").
 *
 * ctx krijgt geïnjecteerde capabilities (fetchText/parseHtml) zodat de adapter
 * fixture-testbaar is zonder chrome.*.
 */

import { buildObservation } from './lib/observation.js';
import { ADAPTER_ERROR } from './types.js';

const ORIGIN = 'https://zakelijk.baktotaal.nl';

/* Startcategorieën voor een sync. Een volledige catalogus-sync loopt de
 * categorieboom af; hier zit een bevestigde seed. De side panel/scope kan
 * eigen categorie-paden meegeven via ctx.categories. */
const DEFAULT_CATEGORIES = ['grondstoffen-en-ingredienten/bloem-en-meel'];

/* Bevestigde DOM-selectors (offscreen past deze toe). Live geverifieerd:
 *   <span data-price-amount="13.2" data-price-type="finalPrice" data-label="Excl. BTW">
 * → data-price-amount is de EX-BTW prijs; finalPrice = huidig, oldPrice = regulier. */
const BAKTOTAAL_DOM = {
    productCard: '.product-item',
    name: 'a.product-item-link',
    link: 'a.product-item-link',
    priceFinal: '[data-price-type="finalPrice"]',  // huidige (mogelijk actie-)prijs, ex BTW
    priceOld: '[data-price-type="oldPrice"]',       // doorgestreepte reguliere prijs, ex BTW
    priceAttr: 'data-price-amount',
    priceText: '.price',                            // fallback: zichtbare tekst
    skuHost: '[data-product-id]',
    skuAttr: 'data-product-id',
    next: 'a.next, .pages a.next, li.pages-item-next a, [rel="next"]',
};

/* "Niet ingelogd / geen persoonlijke prijs"-signaal in de HTML. */
const NOT_LOGGED_IN = /om (je )?prijzen te (bekijken|zien)/i;

function categoryUrl(slug, page) {
    const base = `${ORIGIN}/${String(slug).replace(/^\/+/, '')}`;
    return page && page > 1 ? `${base}?p=${page}` : base;
}

export const baktotaalAdapter = {
    key: 'baktotaal',
    version: '1.1.0',
    displayName: 'Baktotaal (zakelijk)',
    origins: [ORIGIN, 'https://www.baktotaal.nl', 'https://baktotaal.nl'],

    matches(url) {
        try { return /(^|\.)baktotaal\.nl$/i.test(new URL(url).hostname); } catch { return false; }
    },

    async preflight(ctx) {
        // DOM-route (productie): categoriepagina ophalen + logincheck + sample.
        if (ctx.fetchText && ctx.parseHtml) {
            try {
                const html = await ctx.fetchText(categoryUrl(DEFAULT_CATEGORIES[0], 1), { credentials: 'include' });
                if (NOT_LOGGED_IN.test(html)) {
                    return { ok: false, code: ADAPTER_ERROR.LOGIN_REQUIRED, origin: ORIGIN, loggedIn: false, adapterVersion: this.version, sample: [] };
                }
                const parsed = await ctx.parseHtml(html, BAKTOTAAL_DOM);
                const records = (parsed && parsed.records) || [];
                if (!records.length) {
                    return { ok: false, code: ADAPTER_ERROR.PARSE_FAILED, origin: ORIGIN, loggedIn: true, adapterVersion: this.version, sample: [] };
                }
                const sample = records.slice(0, 5).flatMap((rec) => this.normalize(rec, ctx));
                return {
                    ok: true, code: null, origin: ORIGIN, loggedIn: true, personalPricesVisible: true,
                    currency: 'EUR', taxMode: 'ex_vat', accountKeyMasked: maskAccount(ctx.supplierAccountKey),
                    adapterVersion: this.version, sample,
                };
            } catch {
                return { ok: false, code: ADAPTER_ERROR.TIMEOUT, origin: ORIGIN, loggedIn: false, adapterVersion: this.version, sample: [] };
            }
        }
        // JSON-route (alleen voor tests / een toekomstige API).
        return preflightJson(this, ctx);
    },

    async discover(ctx) {
        const cats = (ctx.categories && ctx.categories.length) ? ctx.categories : DEFAULT_CATEGORIES;
        return cats.map((slug) => ({
            idempotencyKey: `baktotaal|cat|${slug}|1`,
            taskType: 'category_page',
            sourceUrl: categoryUrl(slug, 1),
            sourceCursor: JSON.stringify({ slug, page: 1 }),
            priority: 100,
        }));
    },

    async fetchTask(ctx, task) {
        const cursor = safeParse(task.sourceCursor) || { slug: DEFAULT_CATEGORIES[0], page: 1 };

        // DOM-eerst (Baktotaal is server-rendered).
        if (ctx.fetchText && ctx.parseHtml) {
            try {
                const html = await ctx.fetchText(categoryUrl(cursor.slug, cursor.page), { credentials: 'include' });
                if (NOT_LOGGED_IN.test(html)) {
                    return { records: [], nextTasks: [], diagnostics: {}, errorCode: ADAPTER_ERROR.LOGIN_REQUIRED };
                }
                const parsed = await ctx.parseHtml(html, BAKTOTAAL_DOM);
                const records = (parsed && parsed.records) || [];
                const nextTasks = (parsed && parsed.next)
                    ? [{
                        idempotencyKey: `baktotaal|cat|${cursor.slug}|${cursor.page + 1}`,
                        taskType: 'category_page',
                        sourceUrl: resolveUrl(parsed.next),
                        sourceCursor: JSON.stringify({ slug: cursor.slug, page: cursor.page + 1 }),
                        priority: 100,
                    }]
                    : [];
                return { records, nextTasks, diagnostics: { httpStatus: 200, method: 'dom' } };
            } catch {
                return { records: [], nextTasks: [], diagnostics: {}, errorCode: ADAPTER_ERROR.PARSE_FAILED };
            }
        }

        // JSON-route (tests / toekomstige API).
        return fetchTaskJson(cursor, ctx);
    },

    /** PUUR: DOM-record {name,priceText,regularPriceText,url,sku} óf JSON-record → observation. */
    normalize(rec, ctx) {
        if (!rec || (!rec.name && !rec.productName)) return [];
        const name = rec.name || rec.productName;

        const raw = {
            productName: name,
            supplierSku: rec.sku || rec.supplierSku || null,       // data-product-id
            ean: rec.ean || null,
            productUrl: resolveUrl(rec.url) || (rec.urlKey ? `${ORIGIN}/${rec.urlKey}` : (resolveUrl(rec.productUrl) || ORIGIN)),
            category: rec.category || null,
            // Verpakking staat in de naam bij Baktotaal → naam als fallback.
            packageText: rec.packaging || rec.packageText || name,
            vatPct: rec.vatRate != null ? rec.vatRate : null,
            sourceCursor: rec.sourceCursor || null,
            rawRecord: { sku: rec.sku, title: name, priceText: rec.priceText, packageText: rec.packaging || rec.packageText, ean: rec.ean, category: rec.category },
        };

        // Prijs: JSON-record (numeriek) heeft voorrang; anders DOM (final/old).
        const current = rec.priceExVat != null ? Number(rec.priceExVat) : null;
        const list = rec.listPriceExVat != null ? Number(rec.listPriceExVat) : null;
        if (current != null) {
            if (list != null && list > current) { raw.regularPriceExVat = list.toFixed(2); raw.promoPriceExVat = current.toFixed(2); }
            else { raw.regularPriceExVat = current.toFixed(2); raw.promoPriceExVat = null; }
        } else {
            // DOM: priceText = finalPrice (huidig), regularPriceText = oldPrice (regulier) of null.
            const finalT = rec.priceText != null ? String(rec.priceText) : null;
            const oldT = rec.regularPriceText != null ? String(rec.regularPriceText) : null;
            const fn = finalT != null ? Number(finalT.replace(',', '.')) : NaN;
            const on = oldT != null ? Number(oldT.replace(',', '.')) : NaN;
            if (oldT && Number.isFinite(fn) && Number.isFinite(on) && on > fn) {
                raw.regularPriceText = oldT;   // was-prijs
                raw.promoPriceText = finalT;   // actieprijs
            } else {
                raw.regularPriceText = finalT;
                raw.promoPriceText = null;
            }
        }
        return [buildObservation(raw, ctx)];
    },
};

/* ── JSON-route (gehouden voor tests + een eventuele toekomstige API) ────────*/
const BAKTOTAAL_JSON = {
    categoryEndpoint: (slug, page) => `${ORIGIN}/api/catalog/category?slug=${encodeURIComponent(slug)}&page=${page}`,
    items: (json) => json?.result?.products ?? [],
    pageInfo: (json) => json?.result?.pagination ?? null,
    isAuthError: (json, httpStatus) => httpStatus === 401 || httpStatus === 403 || json?.error?.code === 'AUTH_REQUIRED',
};

async function preflightJson(adapter, ctx) {
    let json, httpStatus = 0;
    try {
        const res = await ctx.fetchJson(BAKTOTAAL_JSON.categoryEndpoint('rookhout', 1), { credentials: 'include' });
        json = res?.json ?? res; httpStatus = res?.status ?? 200;
    } catch {
        return { ok: false, code: ADAPTER_ERROR.TIMEOUT, origin: ORIGIN, loggedIn: false, adapterVersion: adapter.version, sample: [] };
    }
    if (BAKTOTAAL_JSON.isAuthError(json, httpStatus)) {
        return { ok: false, code: ADAPTER_ERROR.LOGIN_REQUIRED, origin: ORIGIN, loggedIn: false, adapterVersion: adapter.version, sample: [] };
    }
    const items = BAKTOTAAL_JSON.items(json);
    if (!items.length) return { ok: false, code: ADAPTER_ERROR.PERSONAL_PRICE_NOT_VISIBLE, origin: ORIGIN, loggedIn: true, adapterVersion: adapter.version, sample: [] };
    const sample = items.slice(0, 5).flatMap((rec) => adapter.normalize(rec, ctx));
    return { ok: true, code: null, origin: ORIGIN, loggedIn: true, personalPricesVisible: true, currency: 'EUR', taxMode: ctx.taxMode || 'ex_vat', accountKeyMasked: maskAccount(ctx.supplierAccountKey), adapterVersion: adapter.version, sample };
}

async function fetchTaskJson(cursor, ctx) {
    const url = BAKTOTAAL_JSON.categoryEndpoint(cursor.slug, cursor.page);
    try {
        const res = await ctx.fetchJson(url, { credentials: 'include' });
        const json = res?.json ?? res; const httpStatus = res?.status ?? 200;
        if (BAKTOTAAL_JSON.isAuthError(json, httpStatus)) {
            return { records: [], nextTasks: [], diagnostics: { httpStatus }, errorCode: ADAPTER_ERROR.LOGIN_REQUIRED };
        }
        const items = BAKTOTAAL_JSON.items(json);
        const info = BAKTOTAAL_JSON.pageInfo(json);
        const nextTasks = [];
        if (info && info.page < info.pageCount) {
            const nextPage = info.page + 1;
            nextTasks.push({ idempotencyKey: `baktotaal|cat|${cursor.slug}|${nextPage}`, taskType: 'category_page', sourceUrl: BAKTOTAAL_JSON.categoryEndpoint(cursor.slug, nextPage), sourceCursor: JSON.stringify({ slug: cursor.slug, page: nextPage }), priority: 100 });
        }
        return { records: items, nextTasks, diagnostics: { httpStatus } };
    } catch {
        return { records: [], nextTasks: [], diagnostics: {}, errorCode: ADAPTER_ERROR.TIMEOUT };
    }
}

function resolveUrl(u) {
    if (!u) return null;
    const s = String(u).trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    return `${ORIGIN}${s.startsWith('/') ? '' : '/'}${s}`;
}
function maskAccount(key) {
    if (!key) return null;
    const s = String(key);
    return s.length <= 6 ? '••••' : `${s.slice(0, 6)}…`;
}
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
