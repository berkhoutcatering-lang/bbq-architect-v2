/* supplierSync/observationSchema — strikte, dependency-vrije runtime-validator.
 *
 * Briefing §11 + §15: elke waarneming (van DOM-adapter én AI) gaat door ditzelfde
 * pad. Gedrag als een JSON-schema met `additionalProperties:false`: onbekende
 * top-level velden → reject. AI-output is onbetrouwbare input en wordt net zo
 * streng behandeld als adapter-output (geen los `JSON.parse` + spread meer).
 *
 * Dit is structuur-/typevalidatie + de "direct reject"-regels uit §15. De
 * waarde-anomalieën (prijsafwijking, verpakkingsconflict) zitten in anomaly.ts;
 * de deterministische prijsberekening in pricing.ts.
 */

import {
    type SupplierProductObservationInput,
    type SyncErrorCode,
    type TaxMode,
    type VatPct,
    type PriceBasis,
    type ContentUnit,
    type BaseUnit,
    type ExtractionMethod,
} from './types';

const TAX_MODES: TaxMode[] = ['ex_vat', 'inc_vat', 'unknown'];
const VAT_PCTS: VatPct[] = ['0', '9', '21'];
const PRICE_BASES: PriceBasis[] = ['package', 'kg', 'liter', 'piece', 'unknown'];
const CONTENT_UNITS: ContentUnit[] = ['g', 'kg', 'ml', 'liter', 'piece'];
const BASE_UNITS: BaseUnit[] = ['g', 'ml', 'piece'];
const EXTRACTION_METHODS: ExtractionMethod[] = ['supplier_api', 'json_ld', 'dom_adapter', 'ai_assisted'];

/** Exact toegestane top-level sleutels (additionalProperties:false). */
const ALLOWED_KEYS = new Set<string>([
    'supplierId', 'supplierAccountKey', 'supplierSku', 'ean', 'productName', 'description',
    'category', 'productUrl', 'currency', 'taxMode', 'vatPct', 'regularPriceExVat',
    'promoPriceExVat', 'promoValidFrom', 'promoValidUntil', 'priceBasis', 'packCount',
    'contentPerItemQuantity', 'contentPerItemUnit', 'totalBaseQuantity', 'baseUnit',
    'orderMultiple', 'variableWeight', 'packageDescriptionRaw', 'capturedAt',
    'extractionMethod', 'adapterKey', 'adapterVersion', 'sourceCursor', 'fieldConfidence',
    'rawRecord',
]);

/** Sleutels die NOOIT in rawRecord mogen — secret-lek-guard (briefing §18). */
const FORBIDDEN_RAW_KEYS = /^(cookie|set-cookie|authorization|x-csrf|csrf|token|bearer|password|wachtwoord|session|klantnummer|customer_number|iban|bsn)/i;

/* Limieten (briefing §15: payload groter dan limiet → reject). */
export const LIMITS = {
    productNameMax: 400,
    stringMax: 2000,
    rawRecordBytesMax: 16_384,
    fieldConfidenceMax: 64,
    priceCentsMax: 9_999_900, // €99.999,00 absolute bovengrens
    maxObservationsPerCheckpoint: 200,
};

export interface ObservationValidationResult {
    ok: boolean;
    /** Structureel geldig maar mogelijk nog te quarantainen door anomaly.ts. */
    codes: SyncErrorCode[];
    errors: string[];
    value: SupplierProductObservationInput | null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNumericString(v: unknown): boolean {
    if (typeof v !== 'string' || v.trim() === '') return false;
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n);
}

function isHttpUrl(v: unknown): boolean {
    if (typeof v !== 'string' || !v) return false;
    try {
        const u = new URL(v);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Valideer één ruwe waarneming. `ok:false` → observation krijgt status `rejected`
 * en wordt niet gepersisteerd als bruikbaar product (wél als afgekeurde
 * observation voor reconciliatie). `codes` bevat machineleesbare redenen.
 */
export function validateObservation(raw: unknown): ObservationValidationResult {
    const codes: SyncErrorCode[] = [];
    const errors: string[] = [];
    const reject = (code: SyncErrorCode, msg: string): ObservationValidationResult => {
        codes.push(code);
        errors.push(msg);
        return { ok: false, codes, errors, value: null };
    };

    if (!isPlainObject(raw)) return reject('INVALID_OBSERVATION', 'Waarneming is geen object.');

    // additionalProperties:false — onbekende sleutels weigeren.
    const unknownKeys = Object.keys(raw).filter((k) => !ALLOWED_KEYS.has(k));
    if (unknownKeys.length > 0) {
        return reject('INVALID_OBSERVATION', `Onbekende velden: ${unknownKeys.join(', ')}`);
    }

    // supplierId
    if (typeof raw.supplierId !== 'number' || !Number.isInteger(raw.supplierId) || raw.supplierId <= 0) {
        return reject('INVALID_OBSERVATION', 'supplierId ontbreekt of is ongeldig.');
    }
    // supplierAccountKey
    if (typeof raw.supplierAccountKey !== 'string' || raw.supplierAccountKey.trim() === '') {
        return reject('INVALID_OBSERVATION', 'supplierAccountKey ontbreekt.');
    }

    // productName (§15 direct reject)
    if (typeof raw.productName !== 'string' || raw.productName.trim() === '') {
        return reject('MISSING_PRODUCT_NAME', 'productName ontbreekt.');
    }
    if (raw.productName.length > LIMITS.productNameMax) {
        return reject('PAYLOAD_TOO_LARGE', 'productName te lang.');
    }

    // Nullable strings
    for (const key of ['supplierSku', 'ean', 'description', 'category', 'packageDescriptionRaw', 'sourceCursor'] as const) {
        const val = raw[key];
        if (val !== null && typeof val !== 'string') {
            return reject('INVALID_OBSERVATION', `${key} moet string of null zijn.`);
        }
        if (typeof val === 'string' && val.length > LIMITS.stringMax) {
            return reject('PAYLOAD_TOO_LARGE', `${key} te lang.`);
        }
    }

    // productUrl (§15: malformed URL → reject)
    if (!isHttpUrl(raw.productUrl)) {
        return reject('MALFORMED_URL', 'productUrl is geen geldige http(s)-URL.');
    }

    // Stabiele identiteit vereist (§15): minstens SKU, EAN of geldige URL.
    const hasSku = typeof raw.supplierSku === 'string' && raw.supplierSku.trim() !== '';
    const hasEan = typeof raw.ean === 'string' && raw.ean.trim() !== '';
    if (!hasSku && !hasEan && !isHttpUrl(raw.productUrl)) {
        return reject('MISSING_STABLE_IDENTITY', 'Geen SKU, EAN of geldige URL.');
    }

    // currency
    if (raw.currency !== 'EUR') return reject('INVALID_CURRENCY', 'Alleen EUR ondersteund.');

    // enums
    if (!TAX_MODES.includes(raw.taxMode as TaxMode)) return reject('INVALID_OBSERVATION', 'taxMode ongeldig.');
    if (raw.vatPct !== null && !VAT_PCTS.includes(raw.vatPct as VatPct)) {
        return reject('INVALID_OBSERVATION', 'vatPct ongeldig.');
    }
    if (!PRICE_BASES.includes(raw.priceBasis as PriceBasis)) return reject('INVALID_OBSERVATION', 'priceBasis ongeldig.');
    if (raw.contentPerItemUnit !== null && !CONTENT_UNITS.includes(raw.contentPerItemUnit as ContentUnit)) {
        return reject('INVALID_OBSERVATION', 'contentPerItemUnit ongeldig.');
    }
    if (raw.baseUnit !== null && !BASE_UNITS.includes(raw.baseUnit as BaseUnit)) {
        return reject('INVALID_OBSERVATION', 'baseUnit ongeldig.');
    }
    if (!EXTRACTION_METHODS.includes(raw.extractionMethod as ExtractionMethod)) {
        return reject('INVALID_OBSERVATION', 'extractionMethod ongeldig.');
    }

    // Numerieke strings (§15: ongeldige getallen → reject)
    for (const key of ['regularPriceExVat', 'promoPriceExVat', 'packCount', 'contentPerItemQuantity', 'totalBaseQuantity', 'orderMultiple'] as const) {
        const val = raw[key];
        if (val !== null && !isNumericString(val)) {
            return reject('INVALID_NUMBER', `${key} is geen geldig getal.`);
        }
    }

    // Datums (nullable ISO)
    for (const key of ['promoValidFrom', 'promoValidUntil', 'capturedAt'] as const) {
        const val = raw[key];
        const required = key === 'capturedAt';
        if (val === null) {
            if (required) return reject('INVALID_OBSERVATION', 'capturedAt ontbreekt.');
            continue;
        }
        if (typeof val !== 'string' || Number.isNaN(Date.parse(val))) {
            return reject('INVALID_OBSERVATION', `${key} is geen geldige datum.`);
        }
    }

    // variableWeight
    if (typeof raw.variableWeight !== 'boolean') return reject('INVALID_OBSERVATION', 'variableWeight moet boolean zijn.');

    // adapter-herkomst (§15: adapterversie ontbreekt → reject)
    if (typeof raw.adapterKey !== 'string' || raw.adapterKey.trim() === '') {
        return reject('INVALID_OBSERVATION', 'adapterKey ontbreekt.');
    }
    if (typeof raw.adapterVersion !== 'string' || raw.adapterVersion.trim() === '') {
        return reject('MISSING_ADAPTER_VERSION', 'adapterVersion ontbreekt.');
    }

    // fieldConfidence
    if (!isPlainObject(raw.fieldConfidence)) return reject('INVALID_OBSERVATION', 'fieldConfidence moet object zijn.');
    const fcKeys = Object.keys(raw.fieldConfidence);
    if (fcKeys.length > LIMITS.fieldConfidenceMax) return reject('PAYLOAD_TOO_LARGE', 'fieldConfidence te groot.');
    for (const k of fcKeys) {
        const n = (raw.fieldConfidence as Record<string, unknown>)[k];
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1) {
            return reject('INVALID_OBSERVATION', `fieldConfidence.${k} buiten [0,1].`);
        }
    }

    // rawRecord — whitelist-object, geen secrets, begrensde grootte (§18).
    if (!isPlainObject(raw.rawRecord)) return reject('INVALID_OBSERVATION', 'rawRecord moet object zijn.');
    for (const k of Object.keys(raw.rawRecord)) {
        if (FORBIDDEN_RAW_KEYS.test(k)) return reject('INVALID_OBSERVATION', `rawRecord bevat verboden sleutel: ${k}`);
    }
    let rawBytes = 0;
    try {
        rawBytes = JSON.stringify(raw.rawRecord).length;
    } catch {
        return reject('INVALID_OBSERVATION', 'rawRecord niet serialiseerbaar.');
    }
    if (rawBytes > LIMITS.rawRecordBytesMax) return reject('PAYLOAD_TOO_LARGE', 'rawRecord te groot.');

    // Structureel geldig → normaliseer (trim) tot een getypeerde waarde.
    const value: SupplierProductObservationInput = {
        supplierId: raw.supplierId,
        supplierAccountKey: (raw.supplierAccountKey as string).trim(),
        supplierSku: hasSku ? (raw.supplierSku as string).trim() : null,
        ean: hasEan ? (raw.ean as string).trim() : null,
        productName: (raw.productName as string).trim(),
        description: (raw.description as string | null)?.trim() ?? null,
        category: (raw.category as string | null)?.trim() ?? null,
        productUrl: (raw.productUrl as string).trim(),
        currency: 'EUR',
        taxMode: raw.taxMode as TaxMode,
        vatPct: (raw.vatPct as VatPct | null) ?? null,
        regularPriceExVat: (raw.regularPriceExVat as string | null) ?? null,
        promoPriceExVat: (raw.promoPriceExVat as string | null) ?? null,
        promoValidFrom: (raw.promoValidFrom as string | null) ?? null,
        promoValidUntil: (raw.promoValidUntil as string | null) ?? null,
        priceBasis: raw.priceBasis as PriceBasis,
        packCount: (raw.packCount as string | null) ?? null,
        contentPerItemQuantity: (raw.contentPerItemQuantity as string | null) ?? null,
        contentPerItemUnit: (raw.contentPerItemUnit as ContentUnit | null) ?? null,
        totalBaseQuantity: (raw.totalBaseQuantity as string | null) ?? null,
        baseUnit: (raw.baseUnit as BaseUnit | null) ?? null,
        orderMultiple: (raw.orderMultiple as string | null) ?? null,
        variableWeight: raw.variableWeight as boolean,
        packageDescriptionRaw: (raw.packageDescriptionRaw as string | null)?.trim() ?? null,
        capturedAt: raw.capturedAt as string,
        extractionMethod: raw.extractionMethod as ExtractionMethod,
        adapterKey: (raw.adapterKey as string).trim(),
        adapterVersion: (raw.adapterVersion as string).trim(),
        sourceCursor: (raw.sourceCursor as string | null) ?? null,
        fieldConfidence: raw.fieldConfidence as Record<string, number>,
        rawRecord: raw.rawRecord as Record<string, unknown>,
    };

    return { ok: true, codes, errors, value };
}
