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

import { formatEur } from '@/lib/format';

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
    /** True als de regelbedragen andersom bleken te staan dan het model zei
        (factuur-met-inclusieve-regels, of andersom). Zie de uitleg hieronder. */
    btw_interpretatie_omgedraaid?: boolean;
}

const TOLERANCE_EXACT_EUR = 0.10;
const TOLERANCE_DRIFT_EUR = 0.50;

/**
 * Reconcileer items met door-AI-gerapporteerd totaal.
 *
 * Twee scenario's:
 *   - pricesIncludeBtw=true  → som van item.totaal moet ≈ claimedTotal
 *   - pricesIncludeBtw=false → som van item.totaal IS ex-BTW; we converteren
 *                              elke regel naar bruto (netto + netto * btw/100)
 *                              en vergelijken die met claimedTotal.
 *
 * @param items genormaliseerde bon-items (na normalizeBonItem)
 * @param claimedTotal door AI geëxtraheerde totaal_bedrag (null als AI 'm niet vond)
 * @param pricesIncludeBtw of item.totaal incl-BTW is (kassabon) of ex-BTW (factuur). Default true.
 * @returns status + uitleg voor UI
 */
export function reconcileBon(
    items: BonItemRow[],
    claimedTotal: number | null,
    pricesIncludeBtw = true,
): ReconciliationResult {
    /* Reken per regel het bruto-bedrag uit op basis van pricesIncludeBtw.
       In de UI tonen we altijd bruto-som (zodat het naast totaal_bedrag valt). */
    const sommeer = (inclusief: boolean) =>
        items.reduce((acc, it) => {
            const lineTotal = it.totaal ?? it.aantal * it.prijs;
            if (!Number.isFinite(lineTotal)) return acc;
            if (inclusief || !it.btw_pct) return acc + lineTotal;
            /* ex-BTW interpretatie: factuur (Sligro/Hanos) — bruto = netto * (1+btw/100) */
            return acc + lineTotal * (1 + it.btw_pct / 100);
        }, 0);

    /* Staat er incl of excl BTW in de bedrag-kolom? Dat is de meest gemaakte
       leesfout, en tegelijk een vraag die je kúnt uitrekenen: één van de twee
       lezingen komt uit op het totaal dat onderaan de bon staat, de andere zit
       er precies het BTW-percentage naast. Twee echte voorbeelden:
         - BBQTime: regels 252 + 54 = 306 = het totaal → inclusief, terwijl het
           model "factuur, dus exclusief" zei en er 21% overheen rekende.
         - STRATO: kolomkop zegt "EUR bruto", eronder staat "Netto bedrag".
       We laten de rekensom beslissen in plaats van het model. Klopt de lezing
       van het model, dan verandert er niets — dit grijpt alleen in als de
       andere lezing wél op het totaal uitkomt. */
    let inclusief = pricesIncludeBtw;
    let omgedraaid = false;
    if (claimedTotal != null && claimedTotal > 0 && items.length > 0) {
        const afwijking = (incl: boolean) =>
            Math.abs(Math.round(sommeer(incl) * 100) / 100 - claimedTotal);
        const zoalsGelezen = afwijking(pricesIncludeBtw);
        const andersom = afwijking(!pricesIncludeBtw);
        if (zoalsGelezen > TOLERANCE_DRIFT_EUR && andersom <= TOLERANCE_DRIFT_EUR) {
            inclusief = !pricesIncludeBtw;
            omgedraaid = true;
        }
    }

    const sumItems = sommeer(inclusief);
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
                    ? `AI kon geen totaal-bedrag lezen. Som van regels: ${formatEur(sumRounded)}.`
                    : 'Geen items en geen totaal — controleer of dit wel een bon is.',
            btw_interpretatie_omgedraaid: false,
        };
    }

    const mismatch = Math.abs(sumRounded - claimedTotal);
    const mismatchRounded = Math.round(mismatch * 100) / 100;

    let status: ReconciliationStatus;
    let explanation: string;

    if (mismatchRounded <= TOLERANCE_EXACT_EUR) {
        status = 'ok';
        explanation = omgedraaid
            ? `Regels en totaal kloppen — de bedragen per regel bleken ${inclusief ? 'inclusief' : 'exclusief'} BTW.`
            : 'Regels en totaal kloppen.';
    } else if (mismatchRounded <= TOLERANCE_DRIFT_EUR) {
        status = 'minor_drift';
        explanation = `Klein verschil ${formatEur(mismatchRounded)} — waarschijnlijk BTW-afronding.`;
    } else {
        status = 'mismatch';
        const diff = sumRounded - claimedTotal;
        if (diff > 0) {
            explanation = `Som van regels is ${formatEur(mismatchRounded)} hoger dan totaal — mogelijk dubbel-getelde subtotaal-regel.`;
        } else {
            explanation = `Som van regels is ${formatEur(mismatchRounded)} lager dan totaal — mogelijk gemiste regel.`;
        }
    }

    return {
        status,
        sum_items_eur: sumRounded,
        claimed_total_eur: Math.round(claimedTotal * 100) / 100,
        mismatch_eur: mismatchRounded,
        negative_items_count: negativeCount,
        explanation,
        btw_interpretatie_omgedraaid: omgedraaid,
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
