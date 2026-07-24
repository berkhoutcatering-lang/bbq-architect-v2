/* supplierSync/types — het canonieke leveranciersproduct-waarnemingsmodel.
 *
 * Dit is HET contract tussen de browser-extensie (adapter → observation) en de
 * server (validatie → normalisatie → supplier_products/prijshistorie).
 *
 * Ontwerpregels (briefing §11, ADR-3/ADR-4):
 *   • Geldwaarden reizen als decimale STRINGS ("22.50"), nooit als losse floats.
 *   • De extensie levert bronvelden + ruwe tekst; de SERVER rekent deterministisch
 *     de eenheidsprijs uit (nooit AI, nooit de extensie).
 *   • rawRecord is een whitelist van productvelden — nooit cookies/headers/HTML.
 *   • Alles wat onzeker is (taxMode/verpakking) mag niet stilzwijgend actief worden.
 */

export type Currency = 'EUR';
export type TaxMode = 'ex_vat' | 'inc_vat' | 'unknown';
export type VatPct = '0' | '9' | '21';
export type PriceBasis = 'package' | 'kg' | 'liter' | 'piece' | 'unknown';
export type ContentUnit = 'g' | 'kg' | 'ml' | 'liter' | 'piece';
export type BaseUnit = 'g' | 'ml' | 'piece';
export type ExtractionMethod = 'supplier_api' | 'json_ld' | 'dom_adapter' | 'ai_assisted';

/**
 * Precies het object dat elke extractor (adapter of AI) moet opleveren.
 * De runtime-validator (observationSchema.ts) dwingt dit strikt af met
 * `additionalProperties:false`-gedrag: onbekende velden → reject.
 */
export interface SupplierProductObservationInput {
    supplierId: number;
    /** Gepseudonimiseerde, stabiele sleutel voor prijsniveau/account (geen klantnummer). */
    supplierAccountKey: string;

    supplierSku: string | null;
    ean: string | null;
    productName: string;
    description: string | null;
    category: string | null;
    productUrl: string;

    currency: Currency;
    taxMode: TaxMode;
    vatPct: VatPct | null;

    /** Decimale strings, ex BTW. Bv. "22.50". null = niet zichtbaar. */
    regularPriceExVat: string | null;
    promoPriceExVat: string | null;
    promoValidFrom: string | null;
    promoValidUntil: string | null;
    priceBasis: PriceBasis;

    packCount: string | null;
    contentPerItemQuantity: string | null;
    contentPerItemUnit: ContentUnit | null;
    totalBaseQuantity: string | null;
    baseUnit: BaseUnit | null;
    orderMultiple: string | null;
    variableWeight: boolean;
    packageDescriptionRaw: string | null;

    capturedAt: string;
    extractionMethod: ExtractionMethod;
    adapterKey: string;
    adapterVersion: string;
    sourceCursor: string | null;
    fieldConfidence: Record<string, number>;
    rawRecord: Record<string, unknown>;
}

/** Machineleesbare foutcodes (briefing §19). Gedeeld door validator, anomaly-engine en API. */
export const SYNC_ERROR_CODES = [
    'WRONG_ORIGIN',
    'HOST_PERMISSION_REQUIRED',
    'LOGIN_REQUIRED',
    'PERSONAL_PRICE_NOT_VISIBLE',
    'SUPPLIER_RATE_LIMITED',
    'SUPPLIER_BLOCKED',
    'SUPPLIER_TIMEOUT',
    'ADAPTER_RESPONSE_CHANGED',
    'ADAPTER_PARSE_FAILED',
    'INVALID_OBSERVATION',
    'AMBIGUOUS_PACKAGE',
    'UNKNOWN_TAX_MODE',
    'PRICE_ANOMALY',
    'CHECKPOINT_REPLAY',
    'CHECKPOINT_CONFLICT',
    'RUN_NOT_RESUMABLE',
    'RUN_INCOMPLETE',
    /* fijnmazige validatie-codes (intern, naast de bovenstaande hoofdcodes) */
    'MISSING_PRODUCT_NAME',
    'MISSING_STABLE_IDENTITY',
    'PRICE_NONPOSITIVE',
    'PRICE_OUT_OF_RANGE',
    'INVALID_CURRENCY',
    'INVALID_NUMBER',
    'MALFORMED_URL',
    'MISSING_ADAPTER_VERSION',
    'PROMO_GT_REGULAR',
    'UNKNOWN_PRICE_BASIS',
    'PAYLOAD_TOO_LARGE',
    'SKU_PACKAGE_CONFLICT',
    'EAN_NAME_CONFLICT',
    'LOW_CONFIDENCE',
    'FUZZY_MASTER_MATCH',
] as const;

export type SyncErrorCode = (typeof SYNC_ERROR_CODES)[number];

export type ValidationStatus = 'accepted' | 'quarantined' | 'rejected';
