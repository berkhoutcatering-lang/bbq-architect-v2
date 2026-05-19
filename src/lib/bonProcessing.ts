/**
 * Pure helpers voor bon-verwerking.
 *
 * Geëxtraheerd uit de API-route zodat tests deze kunnen importeren zonder
 * Supabase mee te slepen. Drie kerntaken:
 *
 *   1. matchLeverancier — fuzzy lookup van winkel-string ("SLIGRO 2024-04-12")
 *      tegen bestaande leveranciers.naam. Score-based: exact > prefix >
 *      include, met kortste-naam tiebreaker.
 *
 *   2. parseBonBtw — verdeel totaal-bedrag naar btw-laag/hoog/netto op basis
 *      van bon_items. NL-tarieven 9% (food) en 21% (overig). Items zonder
 *      btw_pct vallen op 0 (vrijgesteld).
 *
 *   3. normalizeBonItem — krijgt een AI-geparsed regel-object en geeft een
 *      consistente BonItemRow terug. AI-output kan velden in NL of EN hebben,
 *      qty als string of number, ontbrekende prijs etc.
 *
 * Alle functies zijn defensief: ongeldige input → safe defaults, geen throw.
 */

import { matchInventory, normalizeInventoryName } from '@/lib/inventoryDeduction';
import { validateBtwPct } from '@/lib/btw-rules';
import type { BonItemRow } from '@/types';

export interface LeverancierLookup {
    id: number;
    naam: string;
    type?: string | null;
}

/** Veelvoorkomende noise in winkel-strings van bon-OCR. */
const WINKEL_NOISE_PATTERNS = [
    /\b(b\.?v\.?|n\.?v\.?)\b/gi,
    /\b\d{4}-\d{2}-\d{2}\b/g,           // datum
    /\b\d{2}[-/.]\d{2}[-/.]\d{2,4}\b/g, // korte datum
    /[#@]\s*\d+/g,                      // bon-nummer
    /\b(filiaal|vestiging|store|shop)\s*\d+\b/gi,
];

/** Strip OCR-noise (datums, bon-nummers, BV/NV) uit winkel-string. */
export function cleanWinkelString(raw: string): string {
    let s = (raw || '').trim();
    for (const re of WINKEL_NOISE_PATTERNS) s = s.replace(re, ' ');
    /* Trailing/leading punctuatie eruit (bv. "Sligro ." na B.V.-strip). */
    s = s.replace(/[.,;:\-—_]+$/g, '').replace(/^[.,;:\-—_]+/g, '');
    return s.replace(/\s+/g, ' ').trim();
}

/**
 * Score-based fuzzy lookup van winkel-string tegen leveranciers-namen.
 * Hergebruikt dezelfde scoring als matchInventory voor consistentie.
 *
 * Returnt null als er geen plausibele match is (<3 chars na cleaning).
 */
export function matchLeverancier(
    winkelString: string,
    leveranciers: LeverancierLookup[],
): LeverancierLookup | null {
    const cleaned = cleanWinkelString(winkelString);
    if (!cleaned || cleaned.length < 3) return null;

    /* Hergebruik matchInventory's scoring door leveranciers als pseudo-inventory te
       presenteren. Resultaat: dezelfde tie-break-logica voor beide tabellen. */
    const inv = leveranciers.map(l => ({ id: l.id, naam: l.naam }));
    const m = matchInventory(cleaned, inv);
    if (!m) return null;
    return leveranciers.find(l => l.id === m.id) || null;
}

/**
 * Parse number-achtige value (string of number) → number.
 * AI kan "2,5" of "2.5" of "2,50" of " €4,20 " sturen.
 */
export function parseAmount(v: unknown): number {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v !== 'string') return 0;
    const cleaned = v.replace(/[€$\s]/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Normaliseer 1 AI-geparsed item naar canoniek BonItemRow shape.
 * AI-output varieert (naam/name, aantal/qty/quantity, prijs/price/unit_price).
 * Ontbrekende velden krijgen safe defaults; lege naam → null returnt
 * zodat caller 'm kan filteren.
 */
export function normalizeBonItem(raw: any): BonItemRow | null {
    if (!raw || typeof raw !== 'object') return null;
    const naam = String(raw.naam || raw.name || raw.product || '').trim();
    if (!naam) return null;

    const aantal = parseAmount(raw.aantal ?? raw.qty ?? raw.quantity ?? 1);
    const prijs = parseAmount(raw.prijs ?? raw.price ?? raw.unit_price ?? raw.eenheidsprijs ?? 0);
    const totaal = parseAmount(raw.totaal ?? raw.total ?? (aantal * prijs));
    const unit = (raw.eenheid || raw.unit || raw.uom || 'stuks').toString().toLowerCase().trim();

    /* btw_pct: AI kan 9 / 21 / 0 of "9%" of "laag"/"hoog" sturen. We mappen
       eerst naar één getal en valideren daarna via de centrale BTW_RULES_2026
       lookup (src/lib/btw-rules.ts) — zo blijft er één bron-of-truth voor
       toegestane percentages, ook als de Belastingdienst-tarieven wijzigen.
       Hard rule 1: BTW komt nooit direct uit AI-output. */
    let btw_pct: number = 0;
    const rawBtw = raw.btw ?? raw.btw_pct ?? raw.tax ?? raw.tax_rate;
    if (typeof rawBtw === 'number') btw_pct = rawBtw;
    else if (typeof rawBtw === 'string') {
        const lower = rawBtw.toLowerCase();
        if (/laag|low|food/.test(lower)) btw_pct = 9;
        else if (/hoog|high|standard/.test(lower)) btw_pct = 21;
        else btw_pct = parseAmount(rawBtw);
    }
    /* validateBtwPct snapt naar 0 / 9 / 21 — geen losse percentages mogelijk. */
    btw_pct = validateBtwPct(btw_pct);

    return {
        naam,
        aantal: aantal > 0 ? aantal : 1,
        unit,
        prijs,
        btw_pct,
        totaal: totaal > 0 ? totaal : aantal * prijs,
    };
}

export interface BonBtwBreakdown {
    btw_laag_bedrag: number;     // 9% voorbelasting
    btw_hoog_bedrag: number;     // 21% voorbelasting
    netto_bedrag: number;         // totaal − totale btw
    bruto_bedrag: number;         // sum totals (sanity-check tegen bon-totaal)
}

/**
 * Bereken BTW-breakdown uit genormaliseerde items.
 * Aanname: item.totaal is INCLUSIEF BTW (zoals op een Sligro-bon).
 * Daaruit destilleren we netto en btw-bedrag per tarief.
 */
export function parseBonBtw(items: BonItemRow[]): BonBtwBreakdown {
    let btw_laag_bedrag = 0;
    let btw_hoog_bedrag = 0;
    let netto_bedrag = 0;
    let bruto_bedrag = 0;

    for (const item of items) {
        const totaal = item.totaal ?? (item.aantal * item.prijs);
        bruto_bedrag += totaal;
        const btw_pct = item.btw_pct ?? 0;
        if (btw_pct === 0) {
            netto_bedrag += totaal;
            continue;
        }
        /* totaal = netto × (1 + btw/100) → netto = totaal / (1 + btw/100) */
        const factor = 1 + btw_pct / 100;
        const netto = totaal / factor;
        const btw = totaal - netto;
        netto_bedrag += netto;
        if (btw_pct === 9) btw_laag_bedrag += btw;
        else if (btw_pct === 21) btw_hoog_bedrag += btw;
        else {
            /* Onverwacht tarief — zet op hoog als fallback voor BTW-aangifte. */
            btw_hoog_bedrag += btw;
        }
    }

    /* Round op 2 decimalen voor opslag — voorkomt "0.0000001" floating-point ruis. */
    const r = (n: number) => Math.round(n * 100) / 100;
    return {
        btw_laag_bedrag: r(btw_laag_bedrag),
        btw_hoog_bedrag: r(btw_hoog_bedrag),
        netto_bedrag: r(netto_bedrag),
        bruto_bedrag: r(bruto_bedrag),
    };
}

/**
 * Bouw een "ProcessedBon"-summary uit raw_analysis (AI-output) — voor de UI
 * preview vóór de user op "Verwerk volledig automatisch" klikt.
 */
export interface BonSummary {
    winkel: string;
    datum: string;
    totaal_bedrag: number;
    items: BonItemRow[];
    btw: BonBtwBreakdown;
}

export function summarizeBon(rawAnalysis: any): BonSummary {
    /* raw_analysis kan een array zijn van AI-actions of een directe { winkel, items } object. */
    let winkel = '';
    let datum = '';
    let totaal_bedrag = 0;
    const items: BonItemRow[] = [];

    if (Array.isArray(rawAnalysis)) {
        for (const action of rawAnalysis) {
            const data = action?.data || action;
            if (!winkel && data?.winkel) winkel = String(data.winkel);
            if (!datum && data?.datum) datum = String(data.datum);
            if (!totaal_bedrag && data?.totaal_bedrag) totaal_bedrag = parseAmount(data.totaal_bedrag);

            const rawItems = data?.items || (data?.naam ? [data] : []);
            if (Array.isArray(rawItems)) {
                for (const ri of rawItems) {
                    const norm = normalizeBonItem(ri);
                    if (norm) items.push(norm);
                }
            }
        }
    } else if (rawAnalysis && typeof rawAnalysis === 'object') {
        winkel = String(rawAnalysis.winkel || '');
        datum = String(rawAnalysis.datum || '');
        totaal_bedrag = parseAmount(rawAnalysis.totaal_bedrag || 0);
        const rawItems = Array.isArray(rawAnalysis.items) ? rawAnalysis.items : [];
        for (const ri of rawItems) {
            const norm = normalizeBonItem(ri);
            if (norm) items.push(norm);
        }
    }

    if (!datum) datum = new Date().toISOString().slice(0, 10);
    const btw = parseBonBtw(items);
    if (!totaal_bedrag) totaal_bedrag = btw.bruto_bedrag;

    return { winkel, datum, totaal_bedrag, items, btw };
}

/* Re-export inventory-name normalizer zodat consumers één bron hebben. */
export { normalizeInventoryName };
