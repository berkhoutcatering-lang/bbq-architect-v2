/* adapters/synthetic — deterministische test-/dev-adapter (geen netwerk).
 *
 * Gebruikt voor crash-/hervattests en lokale ontwikkeling: een vaste, gepagineerde
 * catalogus zonder Math.random, zodat runs reproduceerbaar zijn. Pagineert via een
 * echte "volgende cursor" (page_info), nooit via gefabriceerde ?page=N.
 */

import { buildObservation } from './lib/observation.js';

const ORIGIN = 'https://synthetic.local';
const PAGE_SIZE = 5;

/* Deterministische catalogus: 12 producten, 4 verpakkingstypen. */
function catalog() {
    const items = [];
    const kinds = [
        { pkg: 'Zak 2,5 kg', price: '22.50' },
        { pkg: '24 × 330 ml', price: '18.96' },
        { pkg: '12 stuks', price: '5.04' },
        { pkg: 'per kg (vanggewicht)', price: '8.95' },
    ];
    for (let i = 1; i <= 12; i++) {
        const k = kinds[(i - 1) % kinds.length];
        items.push({
            sku: `SYN-${String(i).padStart(4, '0')}`,
            name: `Synthetisch product ${i}`,
            url: `${ORIGIN}/product/${i}`,
            packageText: k.pkg,
            priceText: k.price,
            category: 'Test',
        });
    }
    return items;
}

function pageOf(n) {
    const all = catalog();
    const start = (n - 1) * PAGE_SIZE;
    const items = all.slice(start, start + PAGE_SIZE);
    const totalPages = Math.ceil(all.length / PAGE_SIZE);
    return { items, currentPage: n, totalPages };
}

export const syntheticAdapter = {
    key: 'synthetic',
    version: '1.0.0',
    displayName: 'Synthetische testleverancier',
    origins: [ORIGIN],

    matches(url) {
        try { return new URL(url).origin === ORIGIN; } catch { return false; }
    },

    async preflight(ctx) {
        const first = pageOf(1);
        const sample = first.items.slice(0, 5).flatMap((rec) => this.normalize(rec, ctx));
        return {
            ok: true, origin: ORIGIN, loggedIn: true, personalPricesVisible: true,
            currency: 'EUR', taxMode: ctx.taxMode || 'ex_vat', accountKeyMasked: 'SYN••••',
            adapterVersion: this.version, sample,
        };
    },

    async discover() {
        // Start met alleen pagina 1; fetchTask ontdekt de rest via page_info.
        return [{ idempotencyKey: 'syn|cat|1', taskType: 'category_page', sourceCursor: '1', sourceUrl: `${ORIGIN}/c/test?page=1`, priority: 100 }];
    },

    async fetchTask(ctx, task) {
        const page = Number(task.sourceCursor || '1');
        const { items, currentPage, totalPages } = pageOf(page);
        const nextTasks = currentPage < totalPages
            ? [{ idempotencyKey: `syn|cat|${currentPage + 1}`, taskType: 'category_page', sourceCursor: String(currentPage + 1), sourceUrl: `${ORIGIN}/c/test?page=${currentPage + 1}`, priority: 100 }]
            : [];
        return { records: items, nextTasks, diagnostics: { durationMs: 1, httpStatus: 200 } };
    },

    normalize(rec, ctx) {
        return [buildObservation({
            productName: rec.name,
            supplierSku: rec.sku,
            ean: null,
            productUrl: rec.url,
            category: rec.category,
            packageText: rec.packageText,
            regularPriceText: rec.priceText,
            sourceCursor: rec.sourceCursor || null,
            rawRecord: { sku: rec.sku, title: rec.name, priceText: rec.priceText, packageText: rec.packageText },
        }, ctx)];
    },
};
