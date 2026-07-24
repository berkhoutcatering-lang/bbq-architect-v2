/* supplierSync/checkpoint — bouwt de beslissings-payload voor de atomaire
 * checkpoint-RPC (extension_v2_apply_checkpoint). Dit is de serverzijdige canon:
 * ruwe waarnemingen → validatie → deterministische prijs → accepted/quarantined/
 * rejected → precies de snake_case rijen die de SQL-RPC persisteert.
 *
 * Puur en testbaar — geen DB, geen netwerk. De API-route levert de prior-price
 * context aan (indexed point lookups) en roept daarna één RPC aan.
 */

import { validateObservation } from './observationSchema';
import { computePricing, type PricingInput } from './pricing';
import { decideValidation, type AnomalyContext } from './anomaly';
import { productIdentity, packVariantKey, rawHash, sha256Hex } from './identity';
import type { SupplierProductObservationInput, ValidationStatus, SyncErrorCode } from './types';

/** Context die de run vaststelt (staat vast bij start). */
export interface CheckpointScope {
    organizationId: string;
    supplierId: number;
    supplierAccountKey: string;
    adapterKnownActive?: boolean;
}

/** Per-identiteit opgezochte historie voor anomaliedetectie (uit DB). */
export interface PriorInfo {
    effectiveCents?: number | null;
    packVariantKey?: string | null;
    eanName?: string | null;
}

/** Eén beslissing zoals de RPC hem verwacht (snake_case observation + price). */
export interface CheckpointDecision {
    raw_hash: string;
    validation_status: ValidationStatus;
    validation_codes: SyncErrorCode[];
    reasons: string[];
    identity_key: string | null;
    pack_variant_key: string;
    observation: Record<string, unknown>;
    price: Record<string, unknown> | null;
    review_payload: Record<string, unknown>;
}

export interface CheckpointBuildResult {
    decisions: CheckpointDecision[];
    summary: { accepted: number; quarantined: number; rejected: number; invalid: number };
}

function centsFromEuro(euro: number | null): number | null {
    if (euro === null || !Number.isFinite(euro)) return null;
    return Math.round(euro * 100);
}

/** Bepaal het canonieke leveranciers-price_cents + display-unit voor Catalogus B. */
function catalogBFields(pr: ReturnType<typeof computePricing>): { effective_price_cents: number | null; unit: string } {
    if (pr.priceBasis === 'kg') return { effective_price_cents: centsFromEuro(pr.pricePerKg), unit: 'kg' };
    if (pr.priceBasis === 'liter') return { effective_price_cents: centsFromEuro(pr.pricePerLiter), unit: 'liter' };
    if (pr.priceBasis === 'piece') return { effective_price_cents: centsFromEuro(pr.pricePerPiece), unit: 'stuk' };
    // package: price_cents = pakprijs; display-unit natuurlijk per basis-eenheid
    const unit = pr.baseUnit === 'ml' ? 'liter' : pr.baseUnit === 'piece' ? 'stuk' : 'kg';
    return { effective_price_cents: pr.effectivePriceCents, unit };
}

function toSnakeObservation(o: SupplierProductObservationInput): Record<string, unknown> {
    return {
        supplier_id: o.supplierId,
        supplier_account_key: o.supplierAccountKey,
        supplier_sku: o.supplierSku,
        ean: o.ean,
        product_name: o.productName,
        description: o.description,
        category: o.category,
        product_url: o.productUrl,
        currency: o.currency,
        tax_mode: o.taxMode,
        vat_pct: o.vatPct,
        regular_price_ex_vat: o.regularPriceExVat,
        promo_price_ex_vat: o.promoPriceExVat,
        promo_valid_from: o.promoValidFrom,
        promo_valid_until: o.promoValidUntil,
        price_basis: o.priceBasis,
        pack_count: o.packCount,
        content_per_item_quantity: o.contentPerItemQuantity,
        content_per_item_unit: o.contentPerItemUnit,
        total_base_quantity: o.totalBaseQuantity,
        base_unit: o.baseUnit,
        order_multiple: o.orderMultiple,
        variable_weight: o.variableWeight,
        package_description_raw: o.packageDescriptionRaw,
        captured_at: o.capturedAt,
        extraction_method: o.extractionMethod,
        adapter_key: o.adapterKey,
        adapter_version: o.adapterVersion,
        source_cursor: o.sourceCursor,
        field_confidence: o.fieldConfidence,
        raw_record: o.rawRecord,
        source: o.extractionMethod === 'supplier_api' ? 'supplier_api' : 'extension',
    };
}

function pricingInputFrom(o: SupplierProductObservationInput): PricingInput {
    return {
        priceBasis: o.priceBasis,
        packCount: o.packCount,
        contentPerItemQuantity: o.contentPerItemQuantity,
        contentPerItemUnit: o.contentPerItemUnit,
        totalBaseQuantity: o.totalBaseQuantity,
        baseUnit: o.baseUnit,
        regularPriceExVat: o.regularPriceExVat,
        promoPriceExVat: o.promoPriceExVat,
        variableWeight: o.variableWeight,
    };
}

/** Scope-gebonden identiteit als 64-hex hash (matcht supplier_products.identity_key). */
function identityKeyFor(scope: CheckpointScope, o: SupplierProductObservationInput): string | null {
    const id = productIdentity(o);
    if (!id.key) return null;
    return sha256Hex([scope.organizationId, String(scope.supplierId), scope.supplierAccountKey, id.key].join(' '));
}

/**
 * Lichte eerste pass: alleen identity_keys van geldige waarnemingen. De API-route
 * gebruikt dit om vóór de RPC gericht (indexed point lookup) de laatst
 * goedgekeurde prijzen op te halen — géén volledige catalogustabel per batch.
 */
export function extractIdentityKeys(rawObservations: unknown[], scope: CheckpointScope): string[] {
    const keys = new Set<string>();
    for (const raw of rawObservations) {
        const v = validateObservation(raw);
        if (!v.ok || !v.value) continue;
        const k = identityKeyFor(scope, v.value);
        if (k) keys.add(k);
    }
    return [...keys];
}

/**
 * Zet ruwe waarnemingen om in checkpoint-beslissingen. `priorByIdentity` bevat
 * per identity_key de laatst goedgekeurde prijs/verpakking voor anomaliedetectie.
 */
export function buildCheckpointDecisions(
    rawObservations: unknown[],
    scope: CheckpointScope,
    priorByIdentity: Map<string, PriorInfo> = new Map(),
): CheckpointBuildResult {
    const decisions: CheckpointDecision[] = [];
    const summary = { accepted: 0, quarantined: 0, rejected: 0, invalid: 0 };

    for (const raw of rawObservations) {
        const validated = validateObservation(raw);
        if (!validated.ok || !validated.value) {
            // Structureel ongeldig → rejected, met de validatiecodes. Geen prijs/product.
            summary.rejected += 1;
            summary.invalid += 1;
            decisions.push({
                raw_hash: sha256Hex(JSON.stringify(raw ?? null)),
                validation_status: 'rejected',
                validation_codes: validated.codes,
                reasons: validated.errors,
                identity_key: null,
                pack_variant_key: 'pack:unknown',
                observation: invalidObservationStub(raw),
                price: null,
                review_payload: {},
            });
            continue;
        }

        const obs = validated.value;
        const pricing = computePricing(pricingInputFrom(obs));
        const idKey = identityKeyFor(scope, obs);
        const pvk = packVariantKey(obs);
        const prior = idKey ? priorByIdentity.get(idKey) : undefined;

        const anomalyCtx: AnomalyContext = {
            previousApprovedEffectiveCents: prior?.effectiveCents ?? null,
            previousPackVariantKey: prior?.packVariantKey ?? null,
            currentPackVariantKey: pvk,
            previousEanName: prior?.eanName ?? null,
            adapterKnownActive: scope.adapterKnownActive ?? true,
        };
        const decision = decideValidation(obs, pricing, anomalyCtx);

        if (decision.status === 'accepted') summary.accepted += 1;
        else if (decision.status === 'quarantined') summary.quarantined += 1;
        else summary.rejected += 1;

        let price: Record<string, unknown> | null = null;
        if (decision.status === 'accepted' && pricing.ok) {
            const cb = catalogBFields(pricing);
            price = {
                effective_price_ex_vat: (pricing.effectivePriceCents! / 100).toFixed(2),
                effective_price_cents: cb.effective_price_cents,
                unit: cb.unit,
                total_base_quantity: pricing.totalBaseQuantity,   // berekend (bv. 2500 g)
                base_unit: pricing.baseUnit,                       // 'g' | 'ml' | 'piece'
                price_basis: pricing.priceBasis,
                regular_price_ex_vat: pricing.regularPriceCents !== null ? (pricing.regularPriceCents / 100).toFixed(2) : null,
                promo_price_ex_vat: pricing.promoPriceCents !== null ? (pricing.promoPriceCents / 100).toFixed(2) : null,
                price_per_kg_ex_vat: pricing.pricePerKg,
                price_per_liter_ex_vat: pricing.pricePerLiter,
                price_per_piece_ex_vat: pricing.pricePerPiece,
            };
        }

        decisions.push({
            raw_hash: rawHash(obs),
            validation_status: decision.status,
            validation_codes: decision.codes,
            reasons: decision.reasons,
            identity_key: idKey,
            pack_variant_key: pvk,
            observation: toSnakeObservation(obs),
            price,
            review_payload: decision.status === 'quarantined'
                ? { productName: obs.productName, priceBasis: obs.priceBasis, packageDescriptionRaw: obs.packageDescriptionRaw }
                : {},
        });
    }

    return { decisions, summary };
}

/** Minimale, veilige observation-stub voor structureel ongeldige input (voor de
 *  rejected-observation-rij; nooit gebruikte velden verzinnen). */
function invalidObservationStub(raw: unknown): Record<string, unknown> {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
        supplier_id: typeof r.supplierId === 'number' ? r.supplierId : null,
        supplier_account_key: typeof r.supplierAccountKey === 'string' ? r.supplierAccountKey : null,
        product_name: typeof r.productName === 'string' && r.productName.trim() ? r.productName.slice(0, 200) : '(ongeldig)',
        product_url: typeof r.productUrl === 'string' ? r.productUrl.slice(0, 500) : null,
        price_basis: 'unknown',
        tax_mode: 'unknown',
        currency: 'EUR',
        extraction_method: (['supplier_api', 'json_ld', 'dom_adapter', 'ai_assisted'] as const).includes(r.extractionMethod as never)
            ? (r.extractionMethod as string)
            : 'dom_adapter',
        adapter_key: typeof r.adapterKey === 'string' ? r.adapterKey : 'unknown',
        adapter_version: typeof r.adapterVersion === 'string' ? r.adapterVersion : '0',
        field_confidence: {},
        raw_record: {},
        variable_weight: false,
    };
}
