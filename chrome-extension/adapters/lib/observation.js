/* adapters/lib/observation — bouwt een volledig, schema-conform observation-object
 * uit de losse bronvelden die een adapter uitleest. Puur en fixture-testbaar.
 *
 * De adapter leest tekst; deze helper zet er de gestructureerde velden van
 * (verpakking via parsePackaging, prijzen via toDecimalString) en vult de
 * verplichte meta-velden. GEEN euroberekening — dat doet de server.
 */

import { toDecimalString, parsePackaging } from './parse.js';

/**
 * @param {object} raw   bronvelden uit de adapter
 * @param {object} ctx   { supplierId, supplierAccountKey, adapterKey, adapterVersion, extractionMethod, taxMode, vatPct, currency, capturedAt }
 * @returns {object} SupplierProductObservationInput
 */
export function buildObservation(raw, ctx) {
    const pack = parsePackaging(raw.packageText ?? raw.packageDescriptionRaw ?? null);

    // Adapter mag priceBasis expliciet overschrijven (bv. JSON zegt "per kg").
    const priceBasis = raw.priceBasisHint || pack.priceBasis;

    const regular = raw.regularPriceExVat != null
        ? String(raw.regularPriceExVat)
        : toDecimalString(raw.regularPriceText ?? null);
    const promo = raw.promoPriceExVat != null
        ? String(raw.promoPriceExVat)
        : toDecimalString(raw.promoPriceText ?? null);

    const confidence = raw.fieldConfidence || {};

    return {
        supplierId: ctx.supplierId,
        supplierAccountKey: ctx.supplierAccountKey,
        supplierSku: nonEmpty(raw.supplierSku),
        ean: nonEmpty(raw.ean),
        productName: String(raw.productName || '').trim(),
        description: nonEmpty(raw.description),
        category: nonEmpty(raw.category),
        productUrl: String(raw.productUrl || '').trim(),
        currency: ctx.currency || 'EUR',
        taxMode: ctx.taxMode || 'unknown',
        vatPct: raw.vatPct != null ? String(raw.vatPct) : (ctx.vatPct != null ? String(ctx.vatPct) : null),
        regularPriceExVat: regular,
        promoPriceExVat: promo,
        promoValidFrom: raw.promoValidFrom || null,
        promoValidUntil: raw.promoValidUntil || null,
        priceBasis,
        packCount: pack.packCount,
        contentPerItemQuantity: pack.contentPerItemQuantity,
        contentPerItemUnit: pack.contentPerItemUnit,
        totalBaseQuantity: raw.totalBaseQuantity != null ? String(raw.totalBaseQuantity) : null,
        baseUnit: raw.baseUnit || null,
        orderMultiple: raw.orderMultiple != null ? String(raw.orderMultiple) : null,
        variableWeight: pack.variableWeight || Boolean(raw.variableWeight),
        packageDescriptionRaw: pack.packageDescriptionRaw,
        capturedAt: ctx.capturedAt || new Date().toISOString(),
        extractionMethod: ctx.extractionMethod || 'dom_adapter',
        adapterKey: ctx.adapterKey,
        adapterVersion: ctx.adapterVersion,
        sourceCursor: raw.sourceCursor || null,
        fieldConfidence: confidence,
        // rawRecord: ALLEEN whitelisted productvelden (nooit cookies/headers/HTML).
        rawRecord: sanitizeRaw(raw.rawRecord || {}),
    };
}

function nonEmpty(v) {
    if (v == null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
}

/** Whitelist voor rawRecord: alleen korte, herkenbare productvelden. */
const RAW_WHITELIST = new Set(['sku', 'id', 'title', 'name', 'priceText', 'unitText', 'packageText', 'ean', 'gtin', 'category', 'url']);
function sanitizeRaw(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (!RAW_WHITELIST.has(k)) continue;
        if (typeof v === 'string') out[k] = v.slice(0, 300);
        else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    }
    return out;
}
