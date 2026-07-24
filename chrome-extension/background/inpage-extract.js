/* background/inpage-extract — leest producten uit een LIVE, gerenderde tab.
 *
 * Voor sites die prijzen client-side (JavaScript) renderen (bv. Bidfood/ATG),
 * kan de achtergrond-fetch + offscreen-parser ze niet zien (geen JS). Deze
 * functie draait via chrome.scripting.executeScript IN de ingelogde pagina,
 * waar alles al gerenderd is, en geeft alleen gesanitiseerde productvelden terug.
 *
 * BELANGRIJK: deze functie moet ZELFSTANDIG zijn (geen imports/closures) —
 * executeScript serialiseert alleen de functiebron.
 */

export function inPageExtract(cfg) {
    const c = cfg || {};

    /* Zichtbaar? display:none / visibility:hidden / geen render-box → NIET zichtbaar.
       Cruciaal: sites renderen vaak een verborgen alternatieve prijs (bv. een
       "Doos 10"-optie naast het zichtbare "Doosje"), die we moeten negeren. */
    function isVisible(el) {
        if (!el || el.nodeType !== 1) return false;
        if (el.getClientRects && el.getClientRects().length === 0) return false;
        const cs = (el.ownerDocument.defaultView || window).getComputedStyle(el);
        if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
        return true;
    }

    /* Tekst van alleen ZICHTBARE nodes (verborgen deelbomen worden overgeslagen),
       zodat textContent geen verborgen prijzen meesmokkelt. */
    function visibleText(el) {
        let out = '';
        const kids = el.childNodes;
        for (let i = 0; i < kids.length; i++) {
            const n = kids[i];
            if (n.nodeType === 3) out += n.nodeValue;               // tekstnode
            else if (n.nodeType === 1 && isVisible(n)) out += ' ' + visibleText(n);
        }
        return out;
    }

    function moneyIn(el) {
        if (!el || !isVisible(el)) return null;
        const t = visibleText(el).replace(/\s+/g, ' ');
        // NL-geld: "20,51" of "1.234,56" (punt=duizendtal, komma=decimaal) of "20.51".
        // GEEN spatie als duizendtal (dat plakte losse getallen aan elkaar).
        const re = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})\s*(?:\/\s*(kilo|kg|stuk|st|liter|ltr|l)\b)?/gi;
        let m;
        while ((m = re.exec(t)) !== null) {
            const val = Number(m[1].replace(/\./g, '').replace(',', '.'));
            // Sanity: negeer absurde bedragen (parse-artefacten).
            if (Number.isFinite(val) && val > 0 && val < 100000) {
                return { text: m[1], unit: (m[2] || '').toLowerCase() };
            }
        }
        return null;
    }

    const anchorSel = c.cardAnchor || '.mux-list-item__title';
    const priceSel = c.priceSel || '[class*="price" i], .text-right';
    const anchors = Array.prototype.slice.call(document.querySelectorAll(anchorSel));
    const records = [];
    const seen = new Set();

    for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        const nameA = a.querySelector('a') || a;
        const name = (nameA.textContent || '').trim();
        if (!name) continue;

        // Klim naar een container die OOK een prijs bevat.
        let box = a, hops = 0, price = null;
        while (box && hops < 7) {
            // Zichtbare prijs-elementen eerst (scoped) — sla verborgen alternatieven
            // (bv. een niet-getoonde "Doos 10"-prijs) over.
            const cands = Array.prototype.slice.call(box.querySelectorAll(priceSel));
            for (let k = 0; k < cands.length; k++) {
                const p = moneyIn(cands[k]);
                if (p) { price = p; break; }
            }
            if (price) break;
            // Laatste redmiddel: zichtbare tekst van de box zelf (niet op het anker,
            // om niet per ongeluk de hele lijst te pakken).
            if (box !== a) { const p2 = moneyIn(box); if (p2) { price = p2; break; } }
            box = box.parentElement; hops++;
        }
        const scope = box || document;
        if (box) { if (seen.has(box)) continue; seen.add(box); }

        const skuEl = scope.querySelector('[data-sku2],[data-sku-id],[data-product-id]');
        const sku = skuEl
            ? (skuEl.getAttribute('data-sku2') || skuEl.getAttribute('data-sku-id') || skuEl.getAttribute('data-product-id'))
            : null;

        let href = nameA.getAttribute('href') || null;
        if (href) href = href.split(';jsessionid')[0];

        records.push({
            name,
            url: href,
            sku,
            priceText: price ? price.text : null,
            priceUnit: price ? price.unit : null,
        });
    }

    // "2016 resultaten" → totaal in deze categorie (stop-conditie bij doorbladeren).
    let total = null;
    try {
        const bt = (document.body && document.body.textContent) || '';
        const tm = bt.match(/([\d.]+)\s*resultaten/i);
        if (tm) { const n = parseInt(tm[1].replace(/\./g, ''), 10); if (Number.isFinite(n)) total = n; }
    } catch (e) { /* geen totaal gevonden → niet erg */ }

    return { records, count: records.length, total };
}
