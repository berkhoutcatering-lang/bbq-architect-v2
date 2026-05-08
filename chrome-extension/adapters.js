/**
 * Site-hints voor bekende leveranciers-portals.
 *
 * Elke adapter bepaalt:
 *   - hint: portal_hint matched against leveranciers.portal_hint
 *   - hostMatch: regex op window.location.hostname
 *   - selectors: hoe je producten op een pagina vindt
 *   - paginate: hoe je naar de volgende pagina gaat
 *
 * Onbekende portals vallen terug op generic AI-detect (zie content.js + ai-detect endpoint).
 */

const ADAPTERS = [
    {
        hint: 'sligro',
        naam: 'Sligro',
        hostMatch: /(^|\.)sligro\.nl$/i,
        selectors: {
            productCard: '[data-testid="product-card"], article.product, .product-tile',
            naam: '[data-testid="product-name"], .product-name, h2, h3',
            prijs: '[data-testid="price-value"], .price, .product-price',
            eenheid: '[data-testid="price-unit"], .price-unit, .unit',
        },
        next: 'a[rel="next"], .pagination__next, [data-testid="pagination-next"]',
        notes: 'Sligro heeft anti-bot — beperk tempo (default 2s tussen pagina-loads).',
    },
    {
        hint: 'makro',
        naam: 'Makro',
        hostMatch: /(^|\.)makro\.nl$/i,
        selectors: {
            productCard: '.mk-product-tile, article.product-tile, [data-product-id]',
            naam: '.mk-product-name, .product-title, h2',
            prijs: '.mk-product-price, .price-value',
            eenheid: '.mk-product-unit, .unit-text',
        },
        next: 'a.mk-pagination__next, [data-test="next-page"]',
        notes: 'Makro vereist login + soms 2FA. Login zelf in het tabblad voor je scan start.',
    },
    {
        hint: 'baktotaal',
        naam: 'Baktotaal',
        hostMatch: /(^|\.)baktotaal\.nl$/i,
        selectors: {
            productCard: '.product-item, article.product, .ProductCard',
            naam: '.product-name, h2, h3.title',
            prijs: '.price, .product-price, [itemprop="price"]',
            eenheid: '.unit, .price-per',
        },
        next: 'a.next, .pagination .next a',
    },
    {
        hint: 'vuurenrook',
        naam: 'Vuur & Rook',
        hostMatch: /(^|\.)vuurenrook\.nl$/i,
        selectors: {
            productCard: '.product-item, .product, article[class*="product"]',
            naam: '.product-name, h2.product-title, h3',
            prijs: '.price, .price-current, .product-price',
            eenheid: '.unit, .price-per',
        },
        next: 'a.next, .pagination__next, [rel="next"]',
        notes: 'Open webshop — geen login nodig.',
    },
    {
        hint: 'hanos',
        naam: 'Hanos',
        hostMatch: /(^|\.)hanos\.nl$/i,
        selectors: {
            productCard: '.product-tile, article.product, [data-product-id]',
            naam: '.product-name, h2',
            prijs: '.price, .product-price',
            eenheid: '.unit, .price-per',
        },
        next: 'a[rel="next"], .pagination .next',
    },
    {
        hint: 'bidfood',
        naam: 'Bidfood',
        hostMatch: /(^|\.)bidfood\.nl$/i,
        selectors: {
            productCard: '.product-card, article.product',
            naam: '.product-name, h2',
            prijs: '.price-value, .product-price',
            eenheid: '.unit, .price-per',
        },
        next: 'a[rel="next"], .pagination__next',
    },
];

function detectAdapter(hostname) {
    return ADAPTERS.find(a => a.hostMatch.test(hostname)) || null;
}

if (typeof window !== 'undefined') {
    window.BBQ_ADAPTERS = ADAPTERS;
    window.BBQ_detectAdapter = detectAdapter;
}
if (typeof self !== 'undefined') {
    self.BBQ_ADAPTERS = ADAPTERS;
    self.BBQ_detectAdapter = detectAdapter;
}
