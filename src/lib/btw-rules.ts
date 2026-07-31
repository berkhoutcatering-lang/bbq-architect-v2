/**
 * NL BTW-tarieven — server-side lookup-only.
 *
 * Hard rule (BBQ Architect): BTW-percentages worden NOOIT door AI bepaald.
 * AI mag de categorie suggereren ("food_catering" / "alcohol" / "service_personnel"),
 * maar de daadwerkelijke rate (0.09 / 0.21 / 0.00) komt ALTIJD uit deze tabel.
 *
 * ── Tarieven zijn DATUMGEBONDEN ────────────────────────────────────────────
 * Een tarief geldt vanaf een datum. De lookup neemt de documentdatum (factuur-
 * of bondatum), niet "vandaag". Zonder dat herschrijft de volgende tarief-
 * wijziging met terugwerkende kracht je reeds verzonden facturen — precies het
 * soort fout dat pas bij een controle opvalt.
 *
 * De tabel begint op 2019-01-01, toen het lage tarief van 6% naar 9% ging.
 * Documenten van vóór die datum worden bewust NIET ondersteund: die tarieven
 * zijn nooit in dit systeem geverifieerd. getBtwRate() gooit er liever op stuk
 * dan een verkeerd getal terug te geven.
 *
 * ── Bron ───────────────────────────────────────────────────────────────────
 * Belastingdienst, "Btw-tarief dranken" en "Btw-tarief voedingsmiddelen",
 * geraadpleegd 2026-07-29.
 *
 * Alcoholvrije dranken staan op 9%, NIET op 21%. Tot 2026-07-29 stond hier
 * `soft_drinks: 0.21` met de toelichting "sinds 1 jan 2026: alle drinks 21%".
 * Dat berustte op een verwisseling: per 2026 wijzigde de VERBRUIKSBELASTING op
 * alcoholvrije dranken (de zuivelvrijstelling werd aangescherpt), niet de btw.
 * Het btw-tarief op alcoholvrije dranken is ongewijzigd 9%.
 *
 * Gerelateerd: src/lib/rgsCategories.ts heeft btw_default per RGS-categorie.
 * Beide bronnen moeten consistent blijven — RGS is categorisering voor de
 * boekhouder, deze tabel is rate-bron voor factuur-generatie.
 */

export type BtwCategory =
  | 'food_catering'          // 9% — voedingsmiddelen catering ter plaatse
  | 'food_takeaway'          // 9% — voedingsmiddelen afhalen / bezorgen
  | 'service_personnel'      // 21% — bediening / hulp / serveer-uren
  | 'alcohol'                // 21% — alcoholhoudende dranken (zie ALCOHOL_GRENS)
  | 'soft_drinks'            // 9%  — alcoholvrije dranken (frisdrank, water, sap, koffie, thee)
  | 'transport'              // 21% — bezorging / transport-fee
  | 'equipment_rental'       // 21% — materieel-verhuur (BBQ, tenten, etc.)
  | 'b2b_intra_eu_reverse'   // 0%  — B2B intracommunautair (verlegd)
  | 'export_non_eu'          // 0%  — uitvoer buiten EU
  | 'exempt';                // n.v.t. — vrijgesteld (lonen, privé)

/**
 * Waar de grens tussen `soft_drinks` (9%) en `alcohol` (21%) precies ligt.
 * Belastingdienst: bier en biermengsels met méér dan 0,5% alcohol en andere
 * dranken met méér dan 1,2% alcohol vallen onder 21%. Daaronder geldt 9%.
 *
 * Praktisch voor catering: alcoholvrij bier (0,0%) is 9%, niet 21%.
 */
export const ALCOHOL_GRENS = {
  /** Bier en biermengsels: > 0,5 vol% ⇒ 21%. */
  bier_vol_pct: 0.5,
  /** Overige dranken (wijn, mixdranken, gedistilleerd): > 1,2 vol% ⇒ 21%. */
  overig_vol_pct: 1.2,
} as const;

/**
 * Kiest de drankcategorie op basis van het alcoholpercentage.
 * Bewust deterministisch: dit mag nooit een AI-inschatting worden.
 */
export function drinkCategoryForAlcohol(
  volPct: number,
  soort: 'bier' | 'overig' = 'overig',
): Extract<BtwCategory, 'alcohol' | 'soft_drinks'> {
  const grens = soort === 'bier' ? ALCOHOL_GRENS.bier_vol_pct : ALCOHOL_GRENS.overig_vol_pct;
  return volPct > grens ? 'alcohol' : 'soft_drinks';
}

export interface BtwRule {
  category: BtwCategory;
  rate: number;          // decimaal (0.09, 0.21, 0.00)
  rate_pct: 9 | 21 | 0;  // gehele percentage voor UI
  label: string;
  /** ISO-datum (YYYY-MM-DD) vanaf wanneer dit tarief geldt. */
  geldig_vanaf: string;
  /** ISO-datum tot en met wanneer dit tarief gold. Afwezig = nog geldig. */
  geldig_tot?: string;
}

/** Vroegste datum die deze tabel dekt. Zie module-docblock. */
export const BTW_TABEL_VANAF = '2019-01-01';

/**
 * Alle tariefversies. Bij een toekomstige wijziging voeg je een NIEUW record
 * toe met `geldig_vanaf` en zet je `geldig_tot` op het oude record — je
 * overschrijft nooit een bestaande regel, anders veranderen oude facturen mee.
 */
export const BTW_TARIEVEN: readonly BtwRule[] = [
  { category: 'food_catering',        rate: 0.09, rate_pct: 9,  label: 'Voedingsmiddelen — catering ter plaatse', geldig_vanaf: BTW_TABEL_VANAF },
  { category: 'food_takeaway',        rate: 0.09, rate_pct: 9,  label: 'Voedingsmiddelen — afhalen / bezorgen',    geldig_vanaf: BTW_TABEL_VANAF },
  { category: 'service_personnel',    rate: 0.21, rate_pct: 21, label: 'Bediening / personeel-uren',               geldig_vanaf: BTW_TABEL_VANAF },
  { category: 'alcohol',              rate: 0.21, rate_pct: 21, label: 'Alcoholhoudende dranken',                  geldig_vanaf: BTW_TABEL_VANAF },
  { category: 'soft_drinks',          rate: 0.09, rate_pct: 9,  label: 'Alcoholvrije dranken',                     geldig_vanaf: BTW_TABEL_VANAF },
  { category: 'transport',            rate: 0.21, rate_pct: 21, label: 'Transport / bezorging',                    geldig_vanaf: BTW_TABEL_VANAF },
  { category: 'equipment_rental',     rate: 0.21, rate_pct: 21, label: 'Materieel-verhuur',                        geldig_vanaf: BTW_TABEL_VANAF },
  { category: 'b2b_intra_eu_reverse', rate: 0.00, rate_pct: 0,  label: 'B2B intracommunautair (BTW verlegd)',      geldig_vanaf: BTW_TABEL_VANAF },
  { category: 'export_non_eu',        rate: 0.00, rate_pct: 0,  label: 'Export buiten EU',                         geldig_vanaf: BTW_TABEL_VANAF },
  { category: 'exempt',               rate: 0.00, rate_pct: 0,  label: 'Vrijgesteld / geen BTW',                   geldig_vanaf: BTW_TABEL_VANAF },
] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * De tarieftabel zoals die gold op een bepaalde datum.
 * Zonder datum: vandaag.
 */
export function getBtwRules(opDatum: string = today()): readonly BtwRule[] {
  if (opDatum < BTW_TABEL_VANAF) {
    throw new Error(
      `[btw-rules] Datum ${opDatum} ligt vóór ${BTW_TABEL_VANAF}; die tarieven zijn niet in dit systeem geverifieerd.`,
    );
  }
  return BTW_TARIEVEN.filter(
    r => r.geldig_vanaf <= opDatum && (!r.geldig_tot || opDatum <= r.geldig_tot),
  );
}

/**
 * Snapshot van de tarieven zoals die per 1 januari 2026 golden.
 * Behouden voor bestaande imports; nieuwe code gebruikt getBtwRules(datum).
 */
export const BTW_RULES_2026: readonly BtwRule[] = getBtwRules('2026-01-01');

/**
 * Server-side helper: krijg het BTW-percentage (decimaal) voor een categorie
 * op een bepaalde documentdatum.
 * Faalt hard als categorie niet bestaat — voorkomt stille bugs.
 */
export function getBtwRate(category: BtwCategory, opDatum?: string): number {
  const rule = getBtwRules(opDatum).find(r => r.category === category);
  if (!rule) {
    throw new Error(`[btw-rules] Onbekende BTW-categorie: ${category}`);
  }
  return rule.rate;
}

/**
 * Helper: hele percentage voor UI-weergave (9 / 21 / 0).
 */
export function getBtwPct(category: BtwCategory, opDatum?: string): 9 | 21 | 0 {
  const rule = getBtwRules(opDatum).find(r => r.category === category);
  if (!rule) {
    throw new Error(`[btw-rules] Onbekende BTW-categorie: ${category}`);
  }
  return rule.rate_pct;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Lezen van btw-percentages uit bestaande data
 *
 * 0 is een GELDIG btw-tarief (verlegd, export, vrijgesteld). Daarom mag een
 * percentage nooit met `||` worden gelezen: `item.btw || 21` maakt van elke
 * 0%-regel een 21%-regel. Dat stond op 2026-07-29 op 27 plaatsen in deze
 * codebase, waaronder de UBL-, Moneybird-, Exact-, Mollie-, CSV-, e-mail- en
 * PDF-export — dus op documenten die naar klanten en boekhouder gaan.
 *
 * Gebruik hieronder `resolveBtwPct` (leest, met expliciete fallback voor
 * ontbrekende waardes) of `requireBtwPct` (weigert te raden).
 * ──────────────────────────────────────────────────────────────────────────── */

/** Fallback-tarief voor regels zonder tarief. Alleen voor niet-formele weergave. */
export const BTW_FALLBACK_PCT = 21;

/** True als er helemaal geen bruikbaar percentage in de data zit. 0 telt als wél aanwezig. */
export function isMissingBtwPct(raw: unknown): boolean {
  if (raw === null || raw === undefined || raw === '') return true;
  return !Number.isFinite(typeof raw === 'number' ? raw : Number(raw));
}

/**
 * Leest een btw-percentage uit (mogelijk oude) data.
 * 0 blijft 0. Alleen een ontbrekende/onleesbare waarde krijgt de fallback.
 */
export function resolveBtwPct(raw: unknown, fallback: number = BTW_FALLBACK_PCT): number {
  if (isMissingBtwPct(raw)) return fallback;
  return typeof raw === 'number' ? raw : Number(raw);
}

/**
 * Zoals resolveBtwPct, maar weigert te raden. Gebruik dit op paden die een
 * formeel document produceren (UBL/Peppol, XAF, btw-aangifte): daar is een
 * gegokt tarief erger dan een geweigerde export.
 */
export function requireBtwPct(raw: unknown, context: string): number {
  if (isMissingBtwPct(raw)) {
    throw new Error(`[btw-rules] Ontbrekend BTW-percentage bij ${context}; weiger te raden.`);
  }
  return typeof raw === 'number' ? raw : Number(raw);
}

/**
 * Reverse-lookup voor legacy data: een numeriek percentage (9 / 21 / 0)
 * → BtwCategory met defaults voor catering-context.
 *
 * Let op: dit is een fallback voor bestaande data. Nieuwe code moet
 * altijd met een expliciete BtwCategory werken.
 */
export function categoryFromLegacyPct(pct: number, hint?: 'food' | 'service' | 'rental' | 'drinks'): BtwCategory {
  if (pct === 0) return 'exempt';
  if (pct === 9) return hint === 'drinks' ? 'soft_drinks' : 'food_catering';
  if (pct === 21) {
    if (hint === 'service') return 'service_personnel';
    if (hint === 'rental') return 'equipment_rental';
    if (hint === 'drinks') return 'alcohol';
    return 'service_personnel';
  }
  throw new Error(`[btw-rules] Onbekend legacy BTW-percentage: ${pct}`);
}

/**
 * Validatie-helper: gegeven een AI-suggestie van btw_pct (zoals uit
 * bon-extract), normaliseer naar een toegestane rate.
 *
 * AI mag 8 / 9 / 21 / 22 / "laag" / "hoog" sturen; wij accepteren
 * alleen 0 / 9 / 21 als gevalideerd resultaat.
 *
 * Drempels gespiegeld aan de oude `bonProcessing.ts`-logica (die had
 * dezelfde test-coverage):
 *   <  5  → 0   (ongeldig NL-tarief, snap naar vrijgesteld)
 *   5-14  → 9   (food / laag tarief)
 *   ≥ 15  → 21  (algemeen tarief)
 */
export function validateBtwPct(raw: unknown): 0 | 9 | 21 {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  if (n < 5) return 0;
  if (n < 15) return 9;
  return 21;
}
