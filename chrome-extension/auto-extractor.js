/**
 * Auto-extractor: client-side, gratis, instant.
 *
 * Probeert achter elkaar:
 *   1. JSON-LD lezen (Schema.org Product / ItemList) — pakt moderne shops
 *      die hun product-data structureel publiceren. Sligro, bol.com, Coolblue,
 *      Albert Heijn, en ~60% van shops doen dit.
 *   2. Platform-vingerafdruk + bekende selectors voor Shopify, Magento,
 *      WooCommerce, Lightspeed, BigCommerce, CCV Shop. Nog ~20% van shops.
 *
 * Als beide leeg returnen: background.js valt terug op Claude HTML-mode of
 * vision-mode (kost geld).
 *
 * Geen externe deps. Draait in content-script context.
 */

(function () {
    'use strict';

    /* NL prijs-parser: "€ 1.250,95" → 1250.95, "1,95" → 1.95 */
    function parsePrice(val) {
        if (val == null) return null;
        if (typeof val === 'number') return Number.isFinite(val) && val > 0 ? val : null;
        const cleaned = String(val).replace(/\s+/g, '');
        /* Eerste numerieke chunk, mag ., en , bevatten */
        const m = cleaned.match(/(-?\d{1,3}(?:[.,]?\d{3})*(?:[.,]\d{1,2})?)/);
        if (!m) return null;
        let s = m[1];
        /* Heuristiek: als zowel . als , in string staan → laatste = decimaal */
        const lastDot = s.lastIndexOf('.');
        const lastComma = s.lastIndexOf(',');
        if (lastDot >= 0 && lastComma >= 0) {
            if (lastComma > lastDot) {
                /* NL: "1.250,95" — punt = thousands, komma = decimaal */
                s = s.replace(/\./g, '').replace(',', '.');
            } else {
                /* EN: "1,250.95" — komma = thousands, punt = decimaal */
                s = s.replace(/,/g, '');
            }
        } else if (lastComma >= 0) {
            /* Alleen komma — NL decimaal */
            s = s.replace(',', '.');
        }
        const n = parseFloat(s);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    function txt(el, selector) {
        if (!el) return null;
        if (!selector) return (el.innerText || el.textContent || '').trim() || null;
        const sub = el.querySelector(selector);
        return sub ? (sub.innerText || sub.textContent || '').trim() || null : null;
    }

    function absUrl(href) {
        if (!href) return null;
        try {
            return new URL(href, window.location.href).toString();
        } catch {
            return null;
        }
    }

    /* ─────────────────────────────────────────────────────────────────────
       LAAG 1 — JSON-LD (Schema.org)
       ───────────────────────────────────────────────────────────────────── */

    function isProductType(typeField) {
        if (!typeField) return false;
        const types = Array.isArray(typeField) ? typeField : [typeField];
        return types.some(t => typeof t === 'string' && /Product|IndividualProduct|ProductGroup/i.test(t));
    }

    function parseJsonLdProduct(node) {
        if (!node || typeof node !== 'object') return null;

        const naam = (node.name || '').toString().trim();
        if (!naam) return null;

        /* offers kan object of array zijn */
        let offer = null;
        if (node.offers) {
            offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
            /* AggregateOffer: pak lowPrice */
            if (offer && offer['@type'] === 'AggregateOffer' && offer.lowPrice != null) {
                offer = { price: offer.lowPrice, priceCurrency: offer.priceCurrency, url: offer.url };
            }
        }
        const priceRaw = offer?.price ?? offer?.lowPrice ?? node.price;
        const prijs = parsePrice(priceRaw);
        if (!prijs) return null;

        const url = absUrl(node.url || offer?.url);

        return {
            naam: naam.slice(0, 200),
            prijs,
            eenheid: 'stuks',
            sku: (node.sku || node.mpn || node.gtin || node.productID || '').toString().slice(0, 80) || null,
            product_url: url,
            confidence: 0.98,
        };
    }

    function walkJsonLd(node, out) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            node.forEach(n => walkJsonLd(n, out));
            return;
        }
        if (isProductType(node['@type'])) {
            const p = parseJsonLdProduct(node);
            if (p) out.push(p);
        }
        /* ItemList → recurse op itemListElement */
        if (node['@type'] === 'ItemList' && Array.isArray(node.itemListElement)) {
            node.itemListElement.forEach(li => {
                walkJsonLd(li.item || li, out);
            });
        }
        /* @graph notation */
        if (Array.isArray(node['@graph'])) {
            node['@graph'].forEach(n => walkJsonLd(n, out));
        }
    }

    function extractJsonLd() {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        const out = [];
        scripts.forEach(s => {
            try {
                const raw = (s.textContent || '').trim();
                if (!raw) return;
                const data = JSON.parse(raw);
                walkJsonLd(data, out);
            } catch {
                /* invalid JSON — skip */
            }
        });
        return out;
    }

    /* ─────────────────────────────────────────────────────────────────────
       LAAG 2 — Platform vingerafdruk + bekende selectors
       ───────────────────────────────────────────────────────────────────── */

    function detectPlatform() {
        const html = document.documentElement;
        const body = document.body || html;
        const bodyClass = body.className || '';
        const generator = document.querySelector('meta[name="generator"]')?.getAttribute('content') || '';

        /* Shopify */
        if (window.Shopify ||
            document.querySelector('script[src*="cdn.shopify.com"]') ||
            /shopify/i.test(generator)) {
            return 'shopify';
        }
        /* Magento (Adobe Commerce) */
        if (window.checkout ||
            document.querySelector('script[src*="/static/version"][src*="/mage/"]') ||
            /\bcatalog-(category|product)/.test(bodyClass) ||
            /magento/i.test(generator)) {
            return 'magento';
        }
        /* WooCommerce (WordPress) */
        if (/\bwoocommerce\b/i.test(bodyClass) ||
            document.querySelector('link[href*="/plugins/woocommerce/"]') ||
            document.querySelector('.woocommerce-loop-product__title')) {
            return 'woocommerce';
        }
        /* Lightspeed eCom (formerly SEOshop / WebshopApp) */
        if (/lightspeed/i.test(generator) ||
            document.querySelector('script[src*="webshopapp"]') ||
            document.querySelector('script[src*="lightspeedhq"]')) {
            return 'lightspeed';
        }
        /* CCV Shop */
        if (/ccv/i.test(generator) ||
            document.querySelector('link[href*="ccvshop.nl"]')) {
            return 'ccv';
        }
        /* BigCommerce */
        if (window.BCData ||
            document.querySelector('script[src*="bigcommerce.com"]') ||
            document.querySelector('script[src*=".bigcommerce.com/"]')) {
            return 'bigcommerce';
        }
        /* PrestaShop */
        if (window.prestashop ||
            /\bprestashop\b/i.test(bodyClass) ||
            /prestashop/i.test(generator)) {
            return 'prestashop';
        }
        /* Mijnwebwinkel / MyOnlineStore */
        if (/myonlinestore|mijnwebwinkel/i.test(generator)) {
            return 'myonlinestore';
        }
        return null;
    }

    /* Bekende selectors per platform.
       Per platform meerdere candidaten met fallback — sommige themes wijken af. */
    const PLATFORM_SELECTORS = {
        shopify: {
            productCard: '.product-card, .grid-product, .product-item, .grid__item .product, [data-product-id], product-card',
            naam: '.product-card__title, .grid-product__title, .product-item__title, .card__heading, h3.product-title, .product-title',
            prijs: '.price, .product-price, .price__regular, .product-card__price, .grid-product__price, .price-item',
            productLink: 'a[href*="/products/"]',
            useSelfAsLink: false,
        },
        magento: {
            productCard: '.product-item, .item.product, [data-product-id], li.product',
            naam: '.product-item-name, .product-name, .product.name, h2.product-name a',
            prijs: '.price, .price-wrapper [data-price-amount], .product-price, .normal-price',
            productLink: 'a.product-item-link, a.product.photo',
            useSelfAsLink: false,
        },
        woocommerce: {
            productCard: 'li.product, .woocommerce-loop-product, .product.type-product',
            naam: '.woocommerce-loop-product__title, h2.woocommerce-loop-product__title, h3, .product-title',
            prijs: '.price, .woocommerce-Price-amount, ins .woocommerce-Price-amount',
            productLink: 'a.woocommerce-loop-product__link, a.woocommerce-LoopProduct-link, a[href*="/product/"]',
            useSelfAsLink: false,
        },
        lightspeed: {
            productCard: '.product, .grid-item, article.product, .product-grid-item, li.product',
            naam: '.product-title, h3.title, .name, h2.product-name',
            prijs: '.price, .product-price, .price-current',
            productLink: 'a[href*="/products/"], a.product-link, a.product-image',
            useSelfAsLink: false,
        },
        bigcommerce: {
            productCard: 'article.card, .productGrid li, li.product, .product-grid-item',
            naam: '.card-title, .card-title a, h4 a, h4.card-title',
            prijs: '.price--withTax, .price--withoutTax, .price-section .price, .price',
            productLink: 'a.card-figure__link, .card-title a',
            useSelfAsLink: false,
        },
        prestashop: {
            productCard: '.product-miniature, article.product-miniature, .js-product-miniature',
            naam: '.product-title, .product-title a, h3.product-title, h2.product-title',
            prijs: '.price, .product-price-and-shipping .price',
            productLink: '.product-title a, a.thumbnail',
            useSelfAsLink: false,
        },
        ccv: {
            productCard: '.product, .product-listing__item, article.product',
            naam: '.product-name, .product__name, h3, h2',
            prijs: '.product-price, .price',
            productLink: 'a.product-link, a[href*="/a-"]',
            useSelfAsLink: false,
        },
        myonlinestore: {
            productCard: '.product, .product-tile, article.product',
            naam: '.product-name, .product-title, h3',
            prijs: '.product-price, .price',
            productLink: 'a.product-link, a[href*=".html"]',
            useSelfAsLink: false,
        },
    };

    /* ─────────────────────────────────────────────────────────────────────
       LAAG 0 — Cached selectors (van eerdere AI-detect call).
       Werkt zoals platform extraction maar met door Claude geleerde selectors.
       Caller geeft een { productCard, naam, prijs, url, eenheid } object mee.
       ───────────────────────────────────────────────────────────────────── */

    function extractBySelectors(selectors) {
        if (!selectors || typeof selectors !== 'object') return [];
        if (!selectors.productCard) return [];

        let cards;
        try {
            cards = document.querySelectorAll(selectors.productCard);
        } catch (e) {
            return [];  /* invalid selector — fallback to AI */
        }
        if (cards.length === 0) return [];

        const out = [];
        cards.forEach(card => {
            try {
                const naam = selectors.naam ? txt(card, selectors.naam) : null;
                const prijsRaw = selectors.prijs ? txt(card, selectors.prijs) : null;
                const prijs = parsePrice(prijsRaw);
                if (!naam || !prijs) return;

                let url = null;
                if (selectors.url) {
                    /* lege string in url-selector betekent: pak href van de card zelf */
                    const target = selectors.url
                        ? card.querySelector(selectors.url)
                        : null;
                    if (target && target.tagName === 'A') {
                        url = absUrl(target.getAttribute('href'));
                    } else if (target && target.href) {
                        url = absUrl(target.href);
                    }
                }
                /* fallback: als card zelf een <a> is */
                if (!url && card.tagName === 'A') {
                    url = absUrl(card.getAttribute('href'));
                }

                const eenheidRaw = selectors.eenheid ? txt(card, selectors.eenheid) : null;

                out.push({
                    naam: naam.slice(0, 200),
                    prijs,
                    eenheid: eenheidRaw ? eenheidRaw.slice(0, 40) : 'stuks',
                    product_url: url,
                    confidence: 0.92,
                });
            } catch { /* skip bad card */ }
        });
        return out;
    }

    function extractByPlatform(platform) {
        const sel = PLATFORM_SELECTORS[platform];
        if (!sel) return [];

        const cards = document.querySelectorAll(sel.productCard);
        const out = [];
        cards.forEach(card => {
            try {
                const naam = txt(card, sel.naam);
                const prijsRaw = txt(card, sel.prijs);
                const prijs = parsePrice(prijsRaw);
                if (!naam || !prijs) return;

                let url = null;
                if (sel.useSelfAsLink && card.tagName === 'A') {
                    url = absUrl(card.getAttribute('href'));
                } else if (sel.productLink) {
                    const a = card.querySelector(sel.productLink) || card.closest('a');
                    url = absUrl(a?.getAttribute('href'));
                }

                out.push({
                    naam: naam.slice(0, 200),
                    prijs,
                    eenheid: 'stuks',
                    product_url: url,
                    confidence: 0.9,
                });
            } catch {
                /* skip bad card */
            }
        });
        return out;
    }

    /* ─────────────────────────────────────────────────────────────────────
       Dedup binnen één pagina (op naam+prijs of url)
       ───────────────────────────────────────────────────────────────────── */

    function dedupe(items) {
        const seen = new Map();
        for (const p of items) {
            const key = (p.product_url || '') + '|' + (p.naam || '').toLowerCase() + '|' + p.prijs;
            if (!seen.has(key)) seen.set(key, p);
        }
        return Array.from(seen.values());
    }

    /* ─────────────────────────────────────────────────────────────────────
       Orchestrator: probeer beide lagen, return resultaat + method
       ───────────────────────────────────────────────────────────────────── */

    async function runAutoExtractor() {
        /* Laag 1: JSON-LD */
        const fromJsonLd = dedupe(extractJsonLd());
        if (fromJsonLd.length > 0) {
            return {
                producten: fromJsonLd,
                method: 'jsonld',
                debug: { jsonld: fromJsonLd.length, platform: null, platformCount: 0 },
            };
        }

        /* Laag 2: Platform detection */
        const platform = detectPlatform();
        if (platform) {
            const fromPlatform = dedupe(extractByPlatform(platform));
            return {
                producten: fromPlatform,
                method: fromPlatform.length > 0 ? ('platform:' + platform) : null,
                debug: { jsonld: 0, platform, platformCount: fromPlatform.length },
            };
        }

        /* Beide leeg — caller valt terug op AI */
        return {
            producten: [],
            method: null,
            debug: { jsonld: 0, platform: null, platformCount: 0 },
        };
    }

    /* Expose op window én op een namespaced global zodat content.js erbij kan */
    window.BBQ_AutoExtractor = {
        run: runAutoExtractor,
        extractJsonLd,
        detectPlatform,
        extractByPlatform,
        extractBySelectors,
        parsePrice,
    };
})();
