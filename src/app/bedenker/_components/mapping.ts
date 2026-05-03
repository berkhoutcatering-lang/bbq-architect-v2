/** Map API-respons (recipe-generate) → display-ready Concept. Vult ontbrekende
 *  velden met smart defaults (glyph uit naam, tone gradient uit categorie,
 *  confidence default 0.85, risk uit complexity). API kan later geüpgrade
 *  worden om deze expliciet te returnen. */

import type { Concept } from './types';

interface ApiRecipe {
  naam: string;
  categorie?: string;
  gang?: string;
  porties?: number;
  beschrijving?: string;
  ingredienten?: Array<{ naam: string; hoeveelheid: number | string; eenheid?: string }>;
  instructies?: string[] | string;
  allergenen?: string[];
  tags?: string[];
  wijn_suggestie?: string;
  service_tip?: string;
  geschatte_kostprijs_pp?: number;
  preptime?: number;
}

interface ExistingDish {
  id?: number | string;
  naam: string;
  gang_slug?: string;
  tags?: string[];
}

const CATEGORY_TONES: Record<string, string> = {
  Hoofd: 'linear-gradient(135deg, #d97706 0%, #7c2d12 100%)',
  Vlees: 'linear-gradient(135deg, #c4536b 0%, #6b1d2a 100%)',
  Vis: 'linear-gradient(135deg, #0891b2 0%, #164e63 100%)',
  Side: 'linear-gradient(135deg, #65a30d 0%, #1a2e05 100%)',
  Bijgerecht: 'linear-gradient(135deg, #65a30d 0%, #1a2e05 100%)',
  Dessert: 'linear-gradient(135deg, #a16207 0%, #422006 100%)',
  Borrel: 'linear-gradient(135deg, #92400e 0%, #1c0a05 100%)',
  Saus: 'linear-gradient(135deg, #b45309 0%, #451a03 100%)',
  Drank: 'linear-gradient(135deg, #4338ca 0%, #1e1b4b 100%)',
  Streetfood: 'linear-gradient(135deg, #d97706 0%, #7c2d12 100%)',
  default: 'linear-gradient(135deg, #c4a35a 0%, #44342a 100%)',
};

/** Smart emoji-uit-naam: matcht op keywords. */
const GLYPH_KEYWORDS: { rx: RegExp; emoji: string }[] = [
  { rx: /watermel|meloen/i, emoji: '🍉' },
  { rx: /taco/i, emoji: '🌮' },
  { rx: /burrito/i, emoji: '🌯' },
  { rx: /burger/i, emoji: '🍔' },
  { rx: /pizza/i, emoji: '🍕' },
  { rx: /brisket|beef/i, emoji: '🥩' },
  { rx: /pulled.?pork|pork|varken/i, emoji: '🐖' },
  { rx: /ribs?/i, emoji: '🍖' },
  { rx: /kip|chicken/i, emoji: '🍗' },
  { rx: /vis|salmon|tonijn|fish/i, emoji: '🐟' },
  { rx: /garnaal|shrimp/i, emoji: '🦐' },
  { rx: /tofu|tempeh|seitan/i, emoji: '🌱' },
  { rx: /salade|salad|slaw/i, emoji: '🥗' },
  { rx: /maïs|mais|corn/i, emoji: '🌽' },
  { rx: /champignon|paddenstoel|mushroom/i, emoji: '🍄' },
  { rx: /aubergine|eggplant/i, emoji: '🍆' },
  { rx: /paprika|pepper/i, emoji: '🌶️' },
  { rx: /chocola|brownie|fudge/i, emoji: '🍫' },
  { rx: /ijs|ice.?cream|sorbet/i, emoji: '🍨' },
  { rx: /bbq|smok|grill/i, emoji: '🔥' },
  { rx: /mac.?cheese|kaas|cheese/i, emoji: '🧀' },
  { rx: /brood|bread|cornbread|bun/i, emoji: '🍞' },
  { rx: /augurk|pickle/i, emoji: '🥒' },
  { rx: /tomat/i, emoji: '🍅' },
  { rx: /aardappel|potato|frites|fries/i, emoji: '🥔' },
  { rx: /borrel|hap|spies|skewer|bonbon/i, emoji: '🍢' },
  { rx: /soep|soup|chili/i, emoji: '🍲' },
  { rx: /noodle|noedel|ramen/i, emoji: '🍜' },
  { rx: /rijst|rice/i, emoji: '🍚' },
  { rx: /koek|koekje|cookie/i, emoji: '🍪' },
  { rx: /taart|cake|toets/i, emoji: '🍰' },
];

function pickGlyph(name: string, category?: string): string {
  for (const { rx, emoji } of GLYPH_KEYWORDS) if (rx.test(name)) return emoji;
  if (category) {
    if (/dessert|zoet/i.test(category)) return '🍰';
    if (/borrel/i.test(category)) return '🍢';
    if (/bij|side/i.test(category)) return '🥗';
    if (/saus/i.test(category)) return '🥄';
    if (/drank/i.test(category)) return '🍷';
  }
  return '🔥'; // BBQ-default
}

const DIET_TAGS = ['Vegan', 'Vegetarisch', 'Glutenvrij', 'Lactosevrij', 'Notenvrij'];

function pickCuisine(tags: string[] | undefined): string {
  if (!tags?.length) return 'BBQ · Hop & Bites';
  const cuisineHints: { rx: RegExp; label: string }[] = [
    { rx: /korean|aziatisch|asian|japans|sush|thai/i, label: 'Asian × BBQ' },
    { rx: /mexicaan|tex.?mex|street/i, label: 'Mexicaans × BBQ' },
    { rx: /americ|texas|carolina|kansas/i, label: 'BBQ · American' },
    { rx: /dutch|nederland|hollands/i, label: 'BBQ · Dutch' },
    { rx: /italiaan|italian/i, label: 'Italiaans × BBQ' },
  ];
  for (const tag of tags) {
    for (const { rx, label } of cuisineHints) if (rx.test(tag)) return label;
  }
  return 'BBQ · Hop & Bites';
}

function pickRisk(method: string[], ingredients: { name: string }[]): Concept['risk'] {
  const score =
    (method.length > 10 ? 1 : 0) +
    (method.length > 14 ? 1 : 0) +
    (ingredients.length > 12 ? 1 : 0) +
    (ingredients.length > 18 ? 1 : 0);
  return score >= 3 ? 'high' : score >= 1 ? 'medium' : 'low';
}

/** Bestaande gerechten matchen op tag-overlap voor "inspired by". */
function pickInspiredBy(
  conceptTags: string[],
  conceptCategory: string | undefined,
  existing: ExistingDish[],
): Concept['inspiredBy'] {
  const conceptTagSet = new Set((conceptTags || []).map((t) => t.toLowerCase()));
  const scored = existing.map((d) => {
    let score = 0;
    if (d.tags) {
      for (const t of d.tags) if (conceptTagSet.has(t.toLowerCase())) score += 2;
    }
    if (conceptCategory && d.gang_slug && d.gang_slug.toLowerCase().includes(conceptCategory.toLowerCase().slice(0, 4))) {
      score += 1;
    }
    return { d, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored
    .filter((s) => s.score > 0)
    .slice(0, 3)
    .map(({ d }) => ({
      name: d.naam,
      category: d.gang_slug,
      glyph: pickGlyph(d.naam, d.gang_slug),
    }));
}

export function mapApiToConcept(
  api: ApiRecipe,
  prompt: string,
  existing: ExistingDish[],
): Concept {
  const category = api.categorie || 'Hoofd';
  const ingredients = (api.ingredienten || []).map((i, idx) => ({
    name: i.naam,
    qty: `${i.hoeveelheid} ${i.eenheid || ''}`.trim(),
    critical: idx === 0, // eerste ingrediënt = hero-ingredient
  }));
  const method = Array.isArray(api.instructies)
    ? api.instructies
    : api.instructies
    ? api.instructies.split(/\n+/).filter(Boolean)
    : [];

  const estCost = api.geschatte_kostprijs_pp || 0;
  // Target margin 65% — verkoopprijs = kost / 0.35
  const estPrice = estCost > 0 ? Math.round((estCost / 0.35) * 2) / 2 : 0;
  const margin = estPrice > 0 ? (estPrice - estCost) / estPrice : 0;

  const tagsLower = (api.tags || []).map((t) => t.toLowerCase());
  const diet = DIET_TAGS.filter((d) => tagsLower.some((t) => t.includes(d.toLowerCase())));

  return {
    id: 'cpt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name: api.naam,
    tagline: api.beschrijving || `${category}-gerecht voor ${api.porties || 60} gasten`,
    category,
    cuisine: pickCuisine(api.tags),
    diet,
    portions: api.porties || 60,
    estCost: Math.round(estCost * 100) / 100,
    estPrice,
    margin,
    prepTime: (api.preptime || 60),
    serveTemp: 'Warm',
    confidence: 0.85,
    glyph: pickGlyph(api.naam, category),
    tone: CATEGORY_TONES[category] || CATEGORY_TONES.default,
    inspiredBy: pickInspiredBy(api.tags || [], category, existing),
    ingredients,
    method,
    allergens: api.allergenen || [],
    pairing: api.wijn_suggestie || '',
    serviceTip: api.service_tip || '',
    risk: pickRisk(method, ingredients),
  };
}

/** Map Concept → payload voor `gerechten` insert (status='concept', bron='ai'). */
export function conceptToGerechtPayload(c: Concept, orgId: string) {
  const CATEGORY_TO_GANG: Record<string, string> = {
    Hoofd: 'hoofdgerechten',
    Vlees: 'hoofdgerechten',
    Vis: 'hoofdgerechten',
    Side: 'bijgerechten',
    Bijgerecht: 'bijgerechten',
    Dessert: 'dessert',
    Borrel: 'bites',
    Saus: 'bijgerechten',
  };
  // Note: `gerechten` tabel heeft GEEN `bron` of `status` kolom — alleen `actief`.
  // Bij latere migration (voor "concept-tier" gerechten in /gerechten) hier
  // weer status='concept' + bron='ai' toevoegen.
  return {
    naam: c.name,
    beschrijving: c.tagline,
    gang_slug: CATEGORY_TO_GANG[c.category] || 'hoofdgerechten',
    ingredienten: c.ingredients.map((i) => `${i.qty} ${i.name}`.trim()),
    bereidingswijze: c.method.join('\n'),
    allergenen: c.allergens,
    tags: c.diet,
    kostprijs_pp: c.estCost,
    porties: c.portions,
    target_prep_time: c.prepTime * 60,
    wijn_suggestie: c.pairing,
    service_tip: c.serviceTip,
    organization_id: orgId,
    actief: false,
  };
}
