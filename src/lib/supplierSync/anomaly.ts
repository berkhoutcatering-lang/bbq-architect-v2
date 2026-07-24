/* supplierSync/anomaly — de "review before trust"-beslismotor (briefing §15, ADR-6).
 *
 * Neemt een structureel gevalideerde waarneming + het deterministische
 * prijsresultaat + optionele context (laatst goedgekeurde prijs, eerdere
 * verpakking bij deze SKU/EAN) en bepaalt: accepted | quarantined | rejected.
 *
 * Liever een zichtbare reviewtaak dan een onzichtbaar verkeerde receptmarge.
 */

import type { SupplierProductObservationInput, ValidationStatus, SyncErrorCode } from './types';
import type { PricingResult } from './pricing';

export interface AnomalyConfig {
    /** Prijsverschil t.o.v. laatst goedgekeurde vergelijkbare prijs → quarantaine. */
    priceDiffQuarantinePct: number; // default 20
    /** Sterke daling die extra verdacht is → quarantaine. */
    strongDropPct: number; // default 40
    /** Veldconfidence-drempel; eronder → quarantaine. */
    confidenceThreshold: number; // default 0.6
    /** Absolute bovengrens in centen; erboven → reject. */
    absoluteMaxCents: number; // default 9_999_900
}

export const DEFAULT_ANOMALY_CONFIG: AnomalyConfig = {
    priceDiffQuarantinePct: 20,
    strongDropPct: 40,
    confidenceThreshold: 0.6,
    absoluteMaxCents: 9_999_900,
};

export interface AnomalyContext {
    /** Vergelijkbare laatst goedgekeurde effectieve prijs (centen), zelfde
     *  eenheidsbasis, voor prijsafwijkingsdetectie. */
    previousApprovedEffectiveCents?: number | null;
    /** Verpakkingsvariant-sleutel die eerder aan deze SKU hing (conflict-detectie). */
    previousPackVariantKey?: string | null;
    currentPackVariantKey?: string | null;
    /** Productnaam die eerder aan deze EAN hing. */
    previousEanName?: string | null;
    /** Adapter bekend én actieve versie? (health-gate) */
    adapterKnownActive?: boolean;
    /** Fuzzy (niet-ondubbelzinnige) koppeling naar een master_product voorgesteld? */
    fuzzyMasterMatch?: boolean;
    config?: Partial<AnomalyConfig>;
}

export interface AnomalyDecision {
    status: ValidationStatus;
    codes: SyncErrorCode[];
    /** Waarom precies (NL, voor de review-UI). */
    reasons: string[];
}

function minFieldConfidence(fc: Record<string, number>): number {
    const vals = Object.values(fc);
    if (vals.length === 0) return 1;
    return Math.min(...vals);
}

/**
 * De centrale beslissing. Volgorde: harde rejects → quarantaine-signalen →
 * anders accepted (mits alle auto-accept-voorwaarden gelden).
 */
export function decideValidation(
    obs: SupplierProductObservationInput,
    pricing: PricingResult,
    ctx: AnomalyContext = {},
): AnomalyDecision {
    const cfg = { ...DEFAULT_ANOMALY_CONFIG, ...(ctx.config ?? {}) };
    const codes: SyncErrorCode[] = [];
    const reasons: string[] = [];

    /* ── Harde reject ─────────────────────────────────────────────────────── */
    // Geen bruikbare prijs / prijs <= 0.
    if (pricing.codes.includes('PRICE_NONPOSITIVE') || pricing.effectivePriceCents === null) {
        return reject('PRICE_NONPOSITIVE', 'Geen geldige prijs (<= 0 of op aanvraag).');
    }
    // Onrealistisch hoog → reject.
    if (pricing.effectivePriceCents > cfg.absoluteMaxCents) {
        return reject('PRICE_OUT_OF_RANGE', 'Prijs boven absolute bovengrens.');
    }

    /* ── Quarantaine-signalen (verzamelen; één is genoeg) ─────────────────── */
    const q = (code: SyncErrorCode, reason: string) => {
        if (!codes.includes(code)) codes.push(code);
        reasons.push(reason);
    };

    if (obs.taxMode === 'unknown') q('UNKNOWN_TAX_MODE', 'BTW-modus onbekend — prijs niet automatisch activeren.');

    if (!pricing.ok) {
        // priceBasis/verpakking onbekend maar prijs wél aanwezig.
        if (pricing.codes.includes('AMBIGUOUS_PACKAGE')) q('AMBIGUOUS_PACKAGE', 'Verpakking niet eenduidig.');
        if (pricing.codes.includes('UNKNOWN_PRICE_BASIS')) q('AMBIGUOUS_PACKAGE', 'Prijsbasis onbekend.');
    }
    if (pricing.codes.includes('PROMO_GT_REGULAR')) q('PRICE_ANOMALY', 'Actieprijs hoger dan reguliere prijs.');

    // Prijsafwijking t.o.v. laatst goedgekeurde vergelijkbare prijs.
    if (ctx.previousApprovedEffectiveCents && ctx.previousApprovedEffectiveCents > 0 && pricing.effectivePriceCents) {
        const prev = ctx.previousApprovedEffectiveCents;
        const diffPct = ((pricing.effectivePriceCents - prev) / prev) * 100;
        if (Math.abs(diffPct) > cfg.priceDiffQuarantinePct) {
            q('PRICE_ANOMALY', `Prijs wijkt ${diffPct.toFixed(1)}% af van laatst goedgekeurd.`);
        }
        if (diffPct < -cfg.strongDropPct) {
            q('PRICE_ANOMALY', `Sterke prijsdaling (${diffPct.toFixed(1)}%).`);
        }
    }

    // SKU met conflicterende verpakking.
    if (ctx.previousPackVariantKey && ctx.currentPackVariantKey &&
        ctx.previousPackVariantKey !== ctx.currentPackVariantKey) {
        q('SKU_PACKAGE_CONFLICT', 'Zelfde SKU, andere verpakking dan eerder.');
    }
    // EAN gekoppeld aan andere naam.
    if (ctx.previousEanName && obs.ean && ctx.previousEanName.toLowerCase() !== obs.productName.toLowerCase()) {
        q('EAN_NAME_CONFLICT', 'EAN eerder aan andere productnaam gekoppeld.');
    }
    // Lage veldconfidence.
    if (minFieldConfidence(obs.fieldConfidence) < cfg.confidenceThreshold) {
        q('LOW_CONFIDENCE', 'Veldconfidence onder drempel.');
    }
    // Fuzzy master-koppeling.
    if (ctx.fuzzyMasterMatch) q('FUZZY_MASTER_MATCH', 'Onzekere koppeling naar generiek product.');

    // AI-afgeleide waarneming is per definitie review-waardig tenzij later bevestigd.
    if (obs.extractionMethod === 'ai_assisted') q('LOW_CONFIDENCE', 'AI-afgeleide waarneming — eerst beoordelen.');

    if (codes.length > 0) {
        return { status: 'quarantined', codes, reasons };
    }

    /* ── Auto-accept alleen als álle voorwaarden gelden ───────────────────── */
    const autoOk =
        pricing.ok &&
        (ctx.adapterKnownActive ?? true) &&
        (obs.supplierSku || obs.ean) &&
        obs.taxMode !== 'unknown' &&
        obs.extractionMethod !== 'ai_assisted';

    if (!autoOk) {
        return { status: 'quarantined', codes: ['AMBIGUOUS_PACKAGE'], reasons: ['Voldoet niet aan auto-accept-voorwaarden.'] };
    }

    return { status: 'accepted', codes: [], reasons: [] };

    function reject(code: SyncErrorCode, reason: string): AnomalyDecision {
        return { status: 'rejected', codes: [code], reasons: [reason] };
    }
}
