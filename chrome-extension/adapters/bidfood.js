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

/* Config voor de LIVE-tab-lezing (Bidfood rendert prijzen via JavaScript, dus
   we lezen de gerenderde pagina i.p.v. een achtergrond-fetch). De "/Kilo"-
   aanduiding in de lijst geeft direct de prijsbasis. */
const BIDFOOD_TAB = {
    cardAnchor: '.mux-list-item__title',
    priceSel: '[class*="price" i], .col-4.text-right, .text-right',
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
        if (!ctx.readTab) {
            return { ok: false, code: ADAPTER_ERROR.PARSE_FAILED, origin: ORIGIN, adapterVersion: this.version, sample: [] };
        }
        try {
            const parsed = await ctx.readTab(BIDFOOD_TAB);
            const records = (parsed && parsed.records) || [];
            if (!records.length) {
                // Geen producten gelezen → sta je wel op een categorie-/lijstpagina?
                return { ok: false, code: ADAPTER_ERROR.PARSE_FAILED, origin: ORIGIN, loggedIn: true, adapterVersion: this.version, sample: [] };
            }
            const withPrice = records.filter((r) => r.priceText && String(r.priceText).trim() !== '');
            if (withPrice.length === 0) {
                return { ok: false, code: ADAPTER_ERROR.PERSONAL_PRICE_NOT_VISIBLE, origin: ORIGIN, loggedIn: false, adapterVersion: this.version, sample: [] };
            }
            const sample = withPrice.slice(0, 5).flatMap((rec) => this.normalize(rec, ctx));
            return {
                ok: true, code: null, origin: ORIGIN, loggedIn: true, personalPricesVisible: true,
                currency: 'EUR', taxMode: 'ex_vat', accountKeyMasked: maskAccount(ctx.supplierAccountKey),
                adapterVersion: this.version, sample,
            };
        } catch (e) {
            return { ok: false, code: ADAPTER_ERROR.TIMEOUT, origin: ORIGIN, adapterVersion: this.version, sample: [], error: String(e && e.message || e) };
        }
    },

    async discover(ctx) {
        // Per-pagina-model (zoals Baktotaal): één taak per categoriepagina, elk een
        // eigen checkpoint. Bidfood pagineert via de URL (?No=<offset>&Nrpp=<n>), dus
        // fetchTask navigeert de live tab naar die pagina en registreert de volgende.
        // We starten bij de categorie waar de gebruiker nu op staat.
        let base = `${ORIGIN}/webshop`;
        try { if (ctx.getTabUrl) { const u = await ctx.getTabUrl(); if (u) base = stripBidfoodPaging(u); } } catch (e) { /* val terug op webshop */ }
        return [{
            idempotencyKey: `bidfood|page|0`,
            taskType: 'category_page',
            sourceUrl: bidfoodPageUrl(base, 0, 96),
            sourceCursor: JSON.stringify({ No: 0, Nrpp: 96, base }),
            priority: 100,
        }];
    },

    async fetchTask(ctx, task) {
        if (!ctx.readPage && !ctx.readTab) {
            return { records: [], nextTasks: [], diagnostics: {}, errorCode: ADAPTER_ERROR.PARSE_FAILED };
        }
        const cur = safeParse(task && task.sourceCursor) || {};
        const No = Number.isFinite(cur.No) ? cur.No : 0;
        const Nrpp = Number.isFinite(cur.Nrpp) ? cur.Nrpp : 96;
        let base = cur.base;
        if (!base) {
            try { if (ctx.getTabUrl) { const u = await ctx.getTabUrl(); base = u ? stripBidfoodPaging(u) : null; } } catch (e) { /* val terug */ }
        }
        base = base || `${ORIGIN}/webshop`;

        try {
            // Navigeer naar déze pagina en lees 'm (één pagina = één checkpoint).
            const url = bidfoodPageUrl(base, No, Nrpp);
            const res = ctx.readPage ? await ctx.readPage(BIDFOOD_TAB, url) : await ctx.readTab(BIDFOOD_TAB);
            const records = (res && res.records) || [];
            const total = res && typeof res.total === 'number' ? res.total : null;

            // Volgende pagina alleen als deze producten had én we nog niet klaar zijn.
            // Stap met het WERKELIJK getoonde aantal (robuust of Nrpp nu wel/niet telt).
            const nextNo = No + records.length;
            const cap = total != null ? total : 20000;   // sanity als totaal onbekend
            const nextTasks = (records.length > 0 && nextNo < cap)
                ? [{
                    idempotencyKey: `bidfood|page|${nextNo}`,
                    taskType: 'category_page',
                    sourceUrl: bidfoodPageUrl(base, nextNo, Nrpp),
                    sourceCursor: JSON.stringify({ No: nextNo, Nrpp, base }),
                    priority: 100,
                }]
                : [];

            return { records, nextTasks, diagnostics: { method: 'url-page', No, count: records.length, total } };
        } catch {
            return { records: [], nextTasks: [], diagnostics: {}, errorCode: ADAPTER_ERROR.TIMEOUT };
        }
    },

    /** PUUR: live-tab-record {name, url, sku, priceText, priceUnit} → observation. */
    normalize(rec, ctx) {
        const name = rec.name || rec.productName;
        if (!name) return [];

        // "/Kilo|/Stuk|/Liter"-aanduiding uit de lijst → directe prijsbasis.
        const unit = (rec.priceUnit || '').toLowerCase();
        let priceBasisHint;
        if (unit === 'kilo' || unit === 'kg') priceBasisHint = 'kg';
        else if (unit === 'liter' || unit === 'ltr' || unit === 'l') priceBasisHint = 'liter';
        else if (unit === 'stuk' || unit === 'st') priceBasisHint = 'piece';

        const raw = {
            productName: name,
            supplierSku: rec.sku || rec.supplierSku || null,   // data-sku2 / data-product-id
            ean: null,
            productUrl: stripSession(resolveUrl(rec.url)) || ORIGIN,
            category: rec.category || null,
            // Per-eenheid (/Kilo etc.) → basis staat vast; anders pak → verpakking uit
            // de naam ("N stuks + M per stuk" → N×M). Onduidelijk → 'unknown' → review.
            packageText: priceBasisHint ? name : bidfoodPackText(name),
            priceBasisHint,
            regularPriceExVat: null,
            promoPriceExVat: null,
            regularPriceText: rec.priceText || null,           // gerenderde prijs (ex BTW)
            vatPct: null,
            sourceCursor: rec.sourceCursor || null,
            rawRecord: { sku: rec.sku, title: name, priceText: rec.priceText, priceUnit: rec.priceUnit },
        };
        return [buildObservation(raw, ctx)];
    },
};

/* ── Helpers ─────────────────────────────────────────────────────────────────*/

/** Bouw een categorie-pagina-URL: zet Endeca-offset (No) + aantal per pagina
 *  (Nrpp) op de basis-URL. currentPage weg (No is leidend). Faalt veilig terug
 *  op de basis-URL. */
function bidfoodPageUrl(baseUrl, offset, pageSize) {
    try {
        const u = new URL(baseUrl);
        u.searchParams.set('No', String(offset));
        u.searchParams.set('Nrpp', String(pageSize));
        u.searchParams.delete('currentPage');
        return u.toString();
    } catch (e) {
        return baseUrl;
    }
}

/** Haal de pagineer-parameters van een URL af → schone categorie-basis-URL. */
function stripBidfoodPaging(u) {
    try {
        const url = new URL(u);
        ['No', 'Nrpp', 'currentPage'].forEach((p) => url.searchParams.delete(p));
        return url.toString();
    } catch (e) {
        return u;
    }
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

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
