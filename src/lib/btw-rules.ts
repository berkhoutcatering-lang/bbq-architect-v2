/**
 * NL BTW-tarieven 2026 — server-side lookup-only.
 *
 * Hard rule (BBQ Architect): BTW-percentages worden NOOIT door AI bepaald.
 * AI mag de categorie suggereren ("food_catering" / "alcohol" / "service_personnel"),
 * maar de daadwerkelijke rate (0.09 / 0.21 / 0.00) komt ALTIJD uit deze tabel.
 *
 * Bron: Belastingdienst NL, tarieven geldig 1 jan 2026.
 * Update jaarlijks bij wijziging (laag tarief horeca-discussie speelt
 * periodiek — controleer met Sam's boekhouder).
 *
 * Gerelateerd: src/lib/rgsCategories.ts heeft btw_default per RGS-categorie.
 * Beide bronnen moeten consistent blijven — RGS is categorisering voor de
 * boekhouder, deze tabel is rate-bron voor factuur-generatie.
 */

export type BtwCategory =
  | 'food_catering'          // 9% — voedingsmiddelen catering ter plaatse
  | 'food_takeaway'          // 9% — voedingsmiddelen afhalen / bezorgen
  | 'service_personnel'      // 21% — bediening / hulp / serveer-uren
  | 'alcohol'                // 21% — alcoholische dranken
  | 'soft_drinks'            // 21% — frisdranken (sinds 1 jan 2026: alle drinks 21%)
  | 'transport'              // 21% — bezorging / transport-fee
  | 'equipment_rental'       // 21% — materieel-verhuur (BBQ, tenten, etc.)
  | 'b2b_intra_eu_reverse'   // 0%  — B2B intracommunautair (verlegd)
  | 'export_non_eu'          // 0%  — uitvoer buiten EU
  | 'exempt';                // n.v.t. — vrijgesteld (lonen, privé)

export interface BtwRule {
  category: BtwCategory;
  rate: number;          // decimaal (0.09, 0.21, 0.00)
  rate_pct: 9 | 21 | 0;  // gehele percentage voor UI
  label: string;
}

export const BTW_RULES_2026: readonly BtwRule[] = [
  { category: 'food_catering',        rate: 0.09, rate_pct: 9,  label: 'Voedingsmiddelen — catering ter plaatse' },
  { category: 'food_takeaway',        rate: 0.09, rate_pct: 9,  label: 'Voedingsmiddelen — afhalen / bezorgen' },
  { category: 'service_personnel',    rate: 0.21, rate_pct: 21, label: 'Bediening / personeel-uren' },
  { category: 'alcohol',              rate: 0.21, rate_pct: 21, label: 'Alcoholische dranken' },
  { category: 'soft_drinks',          rate: 0.21, rate_pct: 21, label: 'Niet-alcoholische dranken' },
  { category: 'transport',            rate: 0.21, rate_pct: 21, label: 'Transport / bezorging' },
  { category: 'equipment_rental',     rate: 0.21, rate_pct: 21, label: 'Materieel-verhuur' },
  { category: 'b2b_intra_eu_reverse', rate: 0.00, rate_pct: 0,  label: 'B2B intracommunautair (BTW verlegd)' },
  { category: 'export_non_eu',        rate: 0.00, rate_pct: 0,  label: 'Export buiten EU' },
  { category: 'exempt',               rate: 0.00, rate_pct: 0,  label: 'Vrijgesteld / geen BTW' },
] as const;

/**
 * Server-side helper: krijg het BTW-percentage (decimaal) voor een categorie.
 * Faalt hard als categorie niet bestaat — voorkomt stille bugs.
 */
export function getBtwRate(category: BtwCategory): number {
  const rule = BTW_RULES_2026.find(r => r.category === category);
  if (!rule) {
    throw new Error(`[btw-rules] Onbekende BTW-categorie: ${category}`);
  }
  return rule.rate;
}

/**
 * Helper: hele percentage voor UI-weergave (9 / 21 / 0).
 */
export function getBtwPct(category: BtwCategory): 9 | 21 | 0 {
  const rule = BTW_RULES_2026.find(r => r.category === category);
  if (!rule) {
    throw new Error(`[btw-rules] Onbekende BTW-categorie: ${category}`);
  }
  return rule.rate_pct;
}

/**
 * Reverse-lookup voor legacy data: een numeriek percentage (9 / 21 / 0)
 * → BtwCategory met defaults voor catering-context.
 *
 * Let op: dit is een fallback voor bestaande data. Nieuwe code moet
 * altijd met een expliciete BtwCategory werken.
 */
export function categoryFromLegacyPct(pct: number, hint?: 'food' | 'service' | 'rental'): BtwCategory {
  if (pct === 0) return 'exempt';
  if (pct === 9) return hint === 'food' ? 'food_catering' : 'food_catering';
  if (pct === 21) {
    if (hint === 'service') return 'service_personnel';
    if (hint === 'rental') return 'equipment_rental';
    return 'service_personnel';
  }
  throw new Error(`[btw-rules] Onbekend legacy BTW-percentage: ${pct}`);
}

/**
 * Validatie-helper: gegeven een AI-suggestie van btw_pct (zoals uit
 * bon-extract), normaliseer naar een toegestane rate of throw.
 *
 * AI mag 8 / 9 / 21 / 22 / "laag" / "hoog" sturen; wij accepteren
 * alleen 0 / 9 / 21 als gevalideerd resultaat.
 */
export function validateBtwPct(raw: unknown): 0 | 9 | 21 {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n < 15) return 9;
  return 21;
}
