/** Helpers om de stats voor de Gerechten-page hero uit ruwe gerechten-rijen te berekenen. */
import { MENU_PRICE_REF } from '@/lib/menuMargin';
import { effectieveKostprijsPP } from '@/lib/gerecht-kosten';

interface GerechtRow {
  id: number;
  naam?: string;
  /** Workflow-status (oudere code) — concept | review_nodig | actief | inactief */
  status?: string;
  /** Database boolean — true = actief in productie. Concept-flag = !actief. */
  actief?: boolean;
  bron?: string;
  kostprijs_pp?: number;
  /** Echte DB-veld voor verkoopprijs */
  verkoopprijs?: number;
  /** Legacy alias — sommige code-paden noemen het `prijs` */
  prijs?: number;
  extra_prijs_pp?: number;
  /** Pre-computed marge (0-100) als die in DB staat */
  marge_pct?: number;
  allergenen?: string[];
  tags?: string[];
  gang_slug?: string;
  target_prep_time?: number; // seconds
  beschrijving?: string;
  ingredient_costs?: unknown;
  /** Componenten-rollup (DB-trigger). Wint boven kostprijs_pp — zie lib/gerecht-kosten.ts. */
  total_cost_cents?: number | null;
}

/** Echte verkoopprijs lezen: verkoopprijs > prijs > extra. GEEN verzonnen prijs
 *  meer (was kostprijs/0.35 → altijd ~65%); geen eigen prijs → 0 (telt niet mee
 *  in "gem. verkoop"). Bij een vast menu heeft een gerecht geen eigen prijs. */
export function schatVerkoop(g: GerechtRow): number {
  if (g.verkoopprijs && g.verkoopprijs > 0) return g.verkoopprijs;
  if (g.prijs && g.prijs > 0) return g.prijs;
  if (g.extra_prijs_pp && g.extra_prijs_pp > 0) return g.extra_prijs_pp;
  return 0;
}

/** Brutomarge in 0-100 schaal. Pre-computed marge_pct wint; anders tegen de
 *  eigen verkoopprijs, en zonder eigen prijs tegen de menu-prijs (menu-niveau,
 *  niet een verzonnen prijs). */
export function schatMarge(g: GerechtRow): number {
  if (g.marge_pct && g.marge_pct > 0) return g.marge_pct;
  /* Componenten-rollup wint — anders vielen gerechten die hun kostprijs uit
     componenten halen stil uit de gemiddelde-marge-tegel. */
  const k = effectieveKostprijsPP(g);
  if (k <= 0) return 0;
  const own = schatVerkoop(g);
  const ref = own > 0 ? own : MENU_PRICE_REF;
  return ((ref - k) / ref) * 100;
}

/** Concept = niet-actief volgens DB-boolean. Status-string blijft fallback. */
export function isConcept(g: GerechtRow): boolean {
  if (g.status === 'concept') return true;
  if (g.actief === false) return true;
  return false;
}

export interface KpiTilesData {
  totaal: number;
  conceptCount: number;
  gemVerkoop: number;
  gemMargePct: number;
  allergenenGedekt: number;
  totaalGerechten: number;
}

export function computeKpiTiles(gerechten: GerechtRow[]): KpiTilesData {
  const totaalGerechten = gerechten.length;
  const conceptCount = gerechten.filter(isConcept).length;
  const verkoopValues = gerechten.map(schatVerkoop).filter((v) => v > 0);
  const margeValues = gerechten.map(schatMarge).filter((m) => m > 0);
  const gemVerkoop =
    verkoopValues.length > 0 ? verkoopValues.reduce((s, v) => s + v, 0) / verkoopValues.length : 0;
  const gemMargePct =
    margeValues.length > 0 ? margeValues.reduce((s, v) => s + v, 0) / margeValues.length : 0;
  const allergenenGedekt = gerechten.filter((g) => g.allergenen && g.allergenen.length > 0).length;
  return {
    totaal: totaalGerechten,
    conceptCount,
    gemVerkoop,
    gemMargePct,
    allergenenGedekt,
    totaalGerechten,
  };
}

const DIET_TAGS = ['Vegan', 'Vegetarisch', 'Vlees'];

const ALLERGEN_KEYS = [
  'Gluten',
  'Noten',
  'Lactose',
  'Soja',
  'Ei',
  'Vis',
  'Schaaldieren',
  'Selderij',
  'Mosterd',
  'Sesam',
  'Sulfiet',
  'Lupine',
];

export function computeDietAllergens(gerechten: GerechtRow[]) {
  const diet: Record<string, number> = {};
  const allergens: Record<string, number> = {};

  for (const g of gerechten) {
    // Diet-detectie via tags
    for (const d of DIET_TAGS) {
      const has = (g.tags || []).some((t) => t.toLowerCase().includes(d.toLowerCase()));
      if (has) diet[d] = (diet[d] || 0) + 1;
    }
    // Allergens uit allergenen-array
    for (const a of g.allergenen || []) {
      const matched = ALLERGEN_KEYS.find((k) => a.toLowerCase().includes(k.toLowerCase()));
      const key = matched || a;
      allergens[key] = (allergens[key] || 0) + 1;
    }
  }
  return { diet, allergens };
}

const GLYPHS_BY_GANG: Record<string, string> = {
  bites: '🍢',
  borrelhap: '🍢',
  borrelhapje: '🍢',
  hapje: '🍢',
  voorgerechten: '🥗',
  hoofdgerechten: '🍖',
  bijgerechten: '🥗',
  bijgerecht: '🥗',
  dessert: '🍫',
  desserts: '🍫',
  vegetarisch: '🌱',
  anders: '🍴',
};

const GLYPH_KEYWORDS: { rx: RegExp; emoji: string }[] = [
  { rx: /watermel|meloen/i, emoji: '🍉' },
  { rx: /taco/i, emoji: '🌮' },
  { rx: /burger/i, emoji: '🍔' },
  { rx: /brisket|burnt/i, emoji: '🥩' },
  { rx: /pulled.?pork|varken/i, emoji: '🐖' },
  { rx: /ribs?/i, emoji: '🍖' },
  { rx: /kip|chicken/i, emoji: '🍗' },
  { rx: /salade|salad|slaw/i, emoji: '🥗' },
  { rx: /maïs|mais|corn/i, emoji: '🌽' },
  { rx: /chocola|brownie/i, emoji: '🍫' },
  { rx: /bonbon|spies|skewer/i, emoji: '🍢' },
];

export function pickGlyph(name: string, gangSlug?: string): string {
  for (const { rx, emoji } of GLYPH_KEYWORDS) if (rx.test(name)) return emoji;
  if (gangSlug && GLYPHS_BY_GANG[gangSlug.toLowerCase()]) return GLYPHS_BY_GANG[gangSlug.toLowerCase()];
  return '🍴';
}

/** Pak het "signature" gerecht: hoogste marge bij actief, fallback eerste actief, fallback eerste. */
export function pickSignatureDish(gerechten: GerechtRow[]): GerechtRow | null {
  if (gerechten.length === 0) return null;
  const actief = gerechten.filter((g) => g.actief !== false && g.status !== 'concept');
  const pool = actief.length > 0 ? actief : gerechten;
  const withMarge = pool.map((g) => ({ g, marge: schatMarge(g) }));
  withMarge.sort((a, b) => b.marge - a.marge);
  return withMarge[0]?.g || pool[0];
}

/** Format prep-tijd seconden → "1u" / "30m". */
export function fmtSmokeTime(seconds?: number): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const minutes = Math.round(seconds / 60);
  if (minutes >= 60) return `${(minutes / 60).toFixed(0)}u`;
  return `${minutes}m`;
}
