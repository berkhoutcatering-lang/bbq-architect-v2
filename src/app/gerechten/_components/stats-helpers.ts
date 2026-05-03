/** Helpers om de stats voor de Gerechten-page hero uit ruwe gerechten-rijen te berekenen. */

interface GerechtRow {
  id: number;
  naam?: string;
  status?: string;
  bron?: string;
  kostprijs_pp?: number;
  prijs?: number;
  extra_prijs_pp?: number;
  allergenen?: string[];
  tags?: string[];
  gang_slug?: string;
  target_prep_time?: number; // seconds
  beschrijving?: string;
  ingredient_costs?: unknown;
}

/** Verkoopprijs schatting: prijs > extra > target 65% marge op kostprijs. */
export function schatVerkoop(g: GerechtRow): number {
  if (g.prijs && g.prijs > 0) return g.prijs;
  if (g.extra_prijs_pp && g.extra_prijs_pp > 0) return g.extra_prijs_pp;
  const k = g.kostprijs_pp || 0;
  if (k <= 0) return 0;
  return Math.round((k / 0.35) * 2) / 2;
}

/** Brutomarge in 0-100 schaal. */
export function schatMarge(g: GerechtRow): number {
  const v = schatVerkoop(g);
  const k = g.kostprijs_pp || 0;
  if (v <= 0 || k <= 0) return 0;
  return ((v - k) / v) * 100;
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
  const conceptCount = gerechten.filter((g) => g.status === 'concept').length;
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
  const actief = gerechten.filter((g) => g.status === 'actief' || !g.status);
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
