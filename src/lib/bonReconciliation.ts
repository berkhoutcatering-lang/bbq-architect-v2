/**
 * Bon-reconciliation: vergelijkt som van item-totalen met het door AI gerapporteerd
 * totaal_bedrag. Vangt drie veelvoorkomende fouten op een Sligro/Hanos-factuur:
 *
 *   1. AI mist een regel — som items < totaal_bedrag → mismatch
 *   2. AI verzint regels — som items > totaal_bedrag → mismatch
 *   3. AI parsed subtotaal-regels als items — som klopt dubbel → mismatch
 *
 * Tolerantie €0.50 dekt afronding van BTW-berekeningen.
 *
 * Hard rule: dit is een VALIDATIE laag, geen correctie. We veranderen geen
 * waardes — we vlaggen alleen. Sam beslist of 'ie escalleert of handmatig fixt.
 */
import type { BonItemRow } from '@/types';

export type ReconciliationStatus =
    | 'ok'              // mismatch ≤ €0.10 — exacte match (afrondings-ruis)
    | 'minor_drift'     // mismatch ≤ €0.50 — acceptabel, BTW-afronding
    | 'mismatch'        // mismatch > €0.50 — flag voor review
    | 'no_total';       // AI heeft geen totaal_bedrag teruggegeven

export interface ReconciliationResult {
    status: ReconciliationStatus;
    sum_items_eur: number;
    claimed_total_eur: number | null;
    mismatch_eur: number;
    /** Aantal items met negatief totaal (korting/retour-regels). Sligro-bonnen
        kunnen deze hebben — een AI die ze als positief teruggeeft = mismatch. */
    negative_items_count: number;
    /** Voor UI-tekst: leesbare omschrijving van de mismatch. */
    explanation: string;
}

const TOLERANCE_EXACT_EUR = 0.10;
const TOLERANCE_DRIFT_EUR = 0.50;

/**
 * Reconcileer items met door-AI-gerapporteerd totaal.
 *
 * @param items genormaliseerde bon-items (na normalizeBonItem)
 * @param claimedTotal door AI geëxtraheerde totaal_bedrag (null als AI 'm niet vond)
 * @returns status + uitleg voor UI
 */
export function reconcileBon(
    items: BonItemRow[],
    claimedTotal: number | null,
): ReconciliationResult {
    const sumItems = items.reduce((acc, it) => {
        const t = it.totaal ?? it.aantal * it.prijs;
        return acc + (Number.isFinite(t) ? t : 0);
    }, 0);

    const sumRounded = Math.round(sumItems * 100) / 100;
    const negativeCount = items.filter(it => (it.totaal ?? it.aantal * it.prijs) < 0).length;

    if (claimedTotal == null || claimedTotal <= 0) {
        return {
            status: 'no_total',
            sum_items_eur: sumRounded,
            claimed_total_eur: null,
            mismatch_eur: 0,
            negative_items_count: negativeCount,
            explanation:
                items.length > 0
                    ? `AI kon geen totaal-bedrag lezen. Som van regels: €${sumRounded.toFixed(2)}.`
                    : 'Geen items en geen totaal — controleer of dit wel een bon is.',
        };
    }

    const mismatch = Math.abs(sumRounded - claimedTotal);
    const mismatchRounded = Math.round(mismatch * 100) / 100;

    let status: ReconciliationStatus;
    let explanation: string;

    if (mismatchRounded <= TOLERANCE_EXACT_EUR) {
        status = 'ok';
        explanation = 'Regels en totaal kloppen.';
    } else if (mismatchRounded <= TOLERANCE_DRIFT_EUR) {
        status = 'minor_drift';
        explanation = `Klein verschil €${mismatchRounded.toFixed(2)} — waarschijnlijk BTW-afronding.`;
    } else {
        status = 'mismatch';
        const diff = sumRounded - claimedTotal;
        if (diff > 0) {
            explanation = `Som van regels is €${mismatchRounded.toFixed(2)} hoger dan totaal — mogelijk dubbel-getelde subtotaal-regel.`;
        } else {
            explanation = `Som van regels is €${mismatchRounded.toFixed(2)} lager dan totaal — mogelijk gemiste regel.`;
        }
    }

    return {
        status,
        sum_items_eur: sumRounded,
        claimed_total_eur: Math.round(claimedTotal * 100) / 100,
        mismatch_eur: mismatchRounded,
        negative_items_count: negativeCount,
        explanation,
    };
}

/**
 * Beslissings-helper voor de escalatie-ladder. Triggers pass-2 (Sonnet) of
 * pass-3 (Opus) als de huidige pass te onzeker is OF de reconciliatie faalt.
 *
 * Heuristics:
 *   - confidence < 0.75               → te onzeker
 *   - items.length === 0              → niets uitgelezen
 *   - status === 'mismatch'           → grote drift, AI mist iets
 *   - mismatch > €1 absoluut           → flagrant
 */
export function shouldEscalate(
    confidence: number,
    itemCount: number,
    reconciliation: ReconciliationResult,
): boolean {
    if (confidence < 0.75) return true;
    if (itemCount === 0) return true;
    if (reconciliation.status === 'mismatch') return true;
    if (reconciliation.mismatch_eur > 1.0) return true;
    return false;
}
