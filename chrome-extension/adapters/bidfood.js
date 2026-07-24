/* adapters/bidfood — tweede leverancieradapter (Bidfood NL, voorheen DeliXL).
 *
 * Platform: Oracle ATG/Endeca, server-rendered (geen JSON-product-API; bevestigd
 * via netwerk-inspectie). DOM-route, net als Baktotaal maar met een andere
 * kaartstructuur:
 *   • Kaart: los blok met naam (a.typ-product), merk (p.typ-brand) en een
 *     apart prijsblok .price-amount-controls[data-sku-id]. Daarom een ANKER
 *     ([data-sku-id]) + cardBoundary (closest) i.p.v. één kaart-selector.
 *   • SKU: data-sku-id ("125163DJ"); prijs in het VALUE-attribuut van
 *     .list-price-value-<sku> (leeg wanneer niet ingelogd → login-gated).
 *   • URLs bevatten ;jsessionid=<token> → ALTIJD strippen (nooit opslaan).
 *   • Paginering: Endeca ?No=<offset>&Nrpp=<n>.
 *
 * ┌─ TE BEVESTIGEN LIVE MET MATHIJS ───────────────────────────────────────────┐
 * │ Ingelogde prijs-value + exacte pagineerlengte. Onduidelijke verpakking gaat │
 * │ veilig naar review (nooit een gegokte per-kg prijs).                         │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import { buildObservation } from './lib/observation.js';
import { ADAPTER_ERROR } from './types.js';

const ORIGIN = 'https://www.bidfood.nl';
const DEFAULT_CATEGORIES = ['/webshop/assortiment/vlees-en-vleesvervangers/_/N-8o7'];
const NO_CAP = 3000; // veiligheidsplafond tegen doorloop-paginering

const BIDFOOD_DOM = {
    productCard: '.price-amount-controls[data-sku-id]', // anker: één per product
    cardBoundary: '.d-flex.flex-column',                // echte kaart = closest hiervan
    name: 'a.typ-product',
    link: 'a.typ-product',
    priceHost: '[class*="list-price-value-"]',          // regulier; VALUE-attribuut
    priceAttr: 'value',
    skuHost: '[data-sku-id]',
    skuAttr: 'data-sku-id',
};

export const bidfoodAdapter = {
    key: 'bidfood',
    version: '1.0.0',
    displayName: 'Bidfood',
    origins: [ORIGIN, 'https://bidfood.nl'],

    matches(url) {
        try { return /(^|\.)bidfood\.nl$/i.test(new URL(url).hostname); } catch { return false; }
    },

    async preflight(ctx) {
        if (!ctx.fetchText || !ctx.parseHtml) {
            return { ok: false, code: ADAPTER_ERROR.PARSE_FAILED, origin: ORIGIN, adapterVersion: this.version, sample: [] };
        }
        try {
            const html = await ctx.fetchText(pageUrl(DEFAULT_CATEGORIES[0], 0), { credentials: 'include' });
            const parsed = await ctx.parseHtml(html, BIDFOOD_DOM);
            const records = (parsed && parsed.records) || [];
            if (!records.length) {
                return { ok: false, code: ADAPTER_ERROR.PARSE_FAILED, origin: ORIGIN, loggedIn: false, adapterVersion: this.version, sample: [] };
            }
            const withPrice = records.filter((r) => r.priceText && String(r.priceText).trim() !== '');
            if (withPrice.length === 0) {
                // Producten zichtbaar maar geen prijzen → niet ingelogd / geen persoonlijke prijs.
                return { ok: false, code: ADAPTER_ERROR.PERSONAL_PRICE_NOT_VISIBLE, origin: ORIGIN, loggedIn: false, adapterVersion: this.version, sample: [] };
            }
            const sample = withPrice.slice(0, 5).flatMap((rec) => this.normalize(rec, ctx));
            return {
                ok: true, code: null, origin: ORIGIN, loggedIn: true, personalPricesVisible: true,
                currency: 'EUR', taxMode: 'ex_vat', accountKeyMasked: maskAccount(ctx.supplierAccountKey),
                adapterVersion: this.version, sample,
            };
        } catch {
            return { ok: false, code: ADAPTER_ERROR.TIMEOUT, origin: ORIGIN, adapterVersion: this.version, sample: [] };
        }
    },

    async discover(ctx) {
        const cats = (ctx.categories && ctx.categories.length) ? ctx.categories : DEFAULT_CATEGORIES;
        return cats.map((c) => {
            const base = categoryBase(c);
            return {
                idempotencyKey: `bidfood|cat|${base}|0`,
                taskType: 'category_page',
                sourceUrl: pageUrl(base, 0),
                sourceCursor: JSON.stringify({ base, No: 0 }),
                priority: 100,
            };
        });
    },

    async fetchTask(ctx, task) {
        if (!ctx.fetchText || !ctx.parseHtml) {
            return { records: [], nextTasks: [], diagnostics: {}, errorCode: ADAPTER_ERROR.PARSE_FAILED };
        }
        const cursor = safeParse(task.sourceCursor) || { base: DEFAULT_CATEGORIES[0], No: 0 };
        try {
            const html = await ctx.fetchText(pageUrl(cursor.base, cursor.No), { credentials: 'include' });
            const parsed = await ctx.parseHtml(html, BIDFOOD_DOM);
            const records = (parsed && parsed.records) || [];
            // Paginering: schuif offset op met het aantal gevonden producten; stop
            // bij een lege pagina of het veiligheidsplafond (Endeca ?No=offset).
            const nextNo = cursor.No + records.length;
            const nextTasks = (records.length > 0 && nextNo < NO_CAP)
                ? [{
                    idempotencyKey: `bidfood|cat|${cursor.base}|${nextNo}`,
                    taskType: 'category_page',
                    sourceUrl: pageUrl(cursor.base, nextNo),
                    sourceCursor: JSON.stringify({ base: cursor.base, No: nextNo }),
                    priority: 100,
                }]
                : [];
            return { records, nextTasks, diagnostics: { httpStatus: 200, method: 'dom' } };
        } catch {
            return { records: [], nextTasks: [], diagnostics: {}, errorCode: ADAPTER_ERROR.TIMEOUT };
        }
    },

    /** PUUR: DOM-record {name, priceText, url, sku} → observation. */
    normalize(rec, ctx) {
        const name = rec.name || rec.productName;
        if (!name) return [];
        const raw = {
            productName: name,
            supplierSku: rec.sku || rec.supplierSku || null,   // data-sku-id
            ean: null,
            productUrl: stripSession(resolveUrl(rec.url)) || ORIGIN,
            category: rec.category || null,
            // Bidfood zet verpakking in de naam; herformatteer bekende patronen naar
            // "N × M unit" zodat de geteste parsePackaging het oppakt. Anders → naam
            // (onduidelijk → parsePackaging 'unknown' → review, nooit gegokt).
            packageText: bidfoodPackText(name),
            regularPriceExVat: null,
            promoPriceExVat: null,
            regularPriceText: rec.priceText || null,           // list-price VALUE-attribuut (ex BTW)
            vatPct: null,
            sourceCursor: rec.sourceCursor || null,
            rawRecord: { sku: rec.sku, title: name, priceText: rec.priceText },
        };
        return [buildObservation(raw, ctx)];
    },
};

/* ── Helpers ─────────────────────────────────────────────────────────────────*/

/** Herken "M gr/g/kg/ml/l per stuk" + "(doosje) N stuks" → "N × M unit". */
function bidfoodPackText(name) {
    const t = String(name || '').toLowerCase();
    const per = t.match(/([\d.,]+)\s*(kg|kilo|kilogram|gram|gr|g|ml|liter|ltr|l)\s*(?:per|\/)\s*stuk/);
    const cnt = t.match(/(?:doos(?:je)?|tray|pak|zak|colli)?\s*(\d+)\s*stuks?\b/);
    if (per && cnt) {
        const unit = per[2] === 'gr' ? 'g' : per[2]; // "gr" → g
        return `${parseInt(cnt[1], 10)} × ${per[1]} ${unit}`;
    }
    return name; // laat de generieke parsePackaging z'n best doen
}

function pageUrl(base, No) {
    const b = base.startsWith('http') ? base : `${ORIGIN}${base.startsWith('/') ? '' : '/'}${base}`;
    return No && No > 0 ? `${b}?No=${No}` : b;
}
/** Categorie-URL → schone basis (zonder query, jsessionid, of /categoryId-suffix). */
function categoryBase(input) {
    let s = stripSession(String(input || ''));
    s = s.split('?')[0].split('/categoryId')[0];
    if (s.startsWith('http')) { try { s = new URL(s).pathname; } catch { /* houd s */ } }
    return s.replace(/\/+$/, '');
}
function stripSession(u) {
    if (!u) return u;
    return String(u).split(';jsessionid')[0];
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
