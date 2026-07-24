/* offscreen.js — draait in een offscreen-document MET DOM. Parseert leverancier-
 * HTML met de door de adapter aangeleverde selector-spec en geeft alleen
 * gesanitiseerde productvelden terug (nooit ruwe HTML/cookies/headers).
 *
 * Selector-spec (generiek, per adapter):
 *   { productCard, name, link, priceHost, priceAttr, priceText, skuHost, skuAttr, next }
 * Retourneert { records:[{name,priceText,url,sku}], next: <href|null> }.
 */

function textOf(el) { return el && el.textContent ? el.textContent.trim() : null; }

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.target !== 'offscreen') return;
    if (msg.type === 'PARSE_HTML') {
        try {
            const doc = new DOMParser().parseFromString(String(msg.html || ''), 'text/html');
            const sel = msg.selectors || {};
            const cards = doc.querySelectorAll(sel.productCard || '.product-item');
            const records = [];
            cards.forEach((card) => {
                const nameEl = card.querySelector(sel.name || '.product-item-link');
                const name = textOf(nameEl);
                if (!name) return;

                const linkEl = card.querySelector(sel.link || 'a[href]') || nameEl;
                const url = linkEl ? linkEl.getAttribute('href') : null;

                // Prijs: exact attribuut (bv. data-price-amount) op finalPrice/oldPrice,
                // anders zichtbare tekst. finalPrice = huidig, oldPrice = regulier (actie).
                let priceText = null, regularPriceText = null;
                const attr = sel.priceAttr || 'data-price-amount';
                if (sel.priceFinal) {
                    const fe = card.querySelector(sel.priceFinal);
                    if (fe) priceText = fe.getAttribute(attr);
                }
                if (sel.priceOld) {
                    const oe = card.querySelector(sel.priceOld);
                    if (oe) regularPriceText = oe.getAttribute(attr);
                }
                if (!priceText && sel.priceHost) {
                    const ph = card.querySelector(sel.priceHost);
                    if (ph) priceText = ph.getAttribute(attr);
                }
                if (!priceText) priceText = textOf(card.querySelector(sel.priceText || '.price'));

                // SKU: attribuut op een element in de kaart, of data-sku op de kaart zelf.
                let sku = null;
                if (sel.skuHost && sel.skuAttr) {
                    const sh = card.querySelector(sel.skuHost);
                    if (sh) sku = sh.getAttribute(sel.skuAttr);
                }
                if (!sku) sku = card.getAttribute('data-sku');

                records.push({ name, priceText, regularPriceText, url, sku });
            });

            const nextEl = doc.querySelector(sel.next || 'a.next, [rel="next"]');
            const next = nextEl ? nextEl.getAttribute('href') : null;

            sendResponse({ records, next });
        } catch (e) {
            sendResponse({ records: [], next: null, error: String(e) });
        }
    }
    return true;
});
