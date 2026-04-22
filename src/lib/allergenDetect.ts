/**
 * Allergenen auto-detect: heuristiek op basis van ingredient-namen.
 * Werkt gratis (geen AI), dekt ~80% van de gevallen voor Nederlandse
 * catering ingrediënten. Voor edge-cases gebruikt de app op
 * master_product-niveau AI-enrichment via /api/enrich-master-allergens.
 *
 * EU14 allergenen (wettelijk verplicht):
 * gluten, lactose, ei, noten, pinda, soja, vis, schaaldieren,
 * weekdieren, selderij, mosterd, sesam, sulfiet, lupine
 */

export type Allergen =
    | 'gluten' | 'lactose' | 'ei' | 'noten' | 'pinda'
    | 'soja' | 'vis' | 'schaaldieren' | 'weekdieren'
    | 'selderij' | 'mosterd' | 'sesam' | 'sulfiet' | 'lupine';

interface AllergenRule {
    allergen: Allergen;
    patterns: RegExp[];
}

/** Nederlandse + Engelse keywords per allergeen */
const RULES: AllergenRule[] = [
    {
        allergen: 'gluten',
        patterns: [
            /\b(tarwe|spelt|gerst|rogge|haver|kamut|bulgur|couscous|bloem|brood|broodjes?|beschuit|cracker|koekjes?|deeg|pasta|noodles?|pannenkoek|pizza|wrap|tortilla|croissant|baguette)\b/i,
            /\bdurum\b/i,
        ],
    },
    {
        allergen: 'lactose',
        patterns: [
            /\b(melk|yoghurt|karnemelk|kwark|hüttenkäse|roomkaas|mozzarella|parmezaan|parmigiano|feta|halloumi|brie|camembert|geitenkaas|schapenkaas|cheddar|gruyere|gruy[èe]re|gouda|edam|boerenkaas|roomboter|boter|room|slagroom|creme(?: fraiche)?|crème|botter|butter|cheese|cheesey?|kaas|ijs|yogurt|buttermilk|cottage cheese)\b/i,
        ],
    },
    {
        allergen: 'ei',
        patterns: [
            /\b(ei(?:eren)?|ouefs?|eggs?|mayonaise|aioli|tartaar(?:saus)?|hollandaise|bearnaise|quiche|omelet|meringue|pavlova)\b/i,
        ],
    },
    {
        allergen: 'noten',
        patterns: [
            /\b(amandel(?:en)?|hazelnoten?|walnoten?|cashew(?:noten)?|pecan(?:noten)?|macadamia|paranoten?|pistache(?:s)?|pistachio|pistachios?|nootjes?|noten|pijnboompit(?:ten)?)\b/i,
        ],
    },
    {
        allergen: 'pinda',
        patterns: [
            /\b(pinda(?:'?s|kaas)?|peanuts?|sat[eé](?:saus)?)\b/i,
        ],
    },
    {
        allergen: 'soja',
        patterns: [
            /\b(soja(?:saus|boontjes|melk|olie)?|tofu|tempeh|edamame|miso)\b/i,
        ],
    },
    {
        allergen: 'vis',
        patterns: [
            /\b(vis|zalm|tonijn|forel|kabeljauw|makreel|haring|heilbot|ansjovis|anchovies?|sardines?|bokking|zeeduivel|tarbot|schol|dorade|zeebaars|paling|snoek|seabass)\b/i,
        ],
    },
    {
        allergen: 'schaaldieren',
        patterns: [
            /\b(garnalen?|kreeft|krab|langoustines?|scampi|schaaldieren|shrimps?|lobster|crab|rivierkreeft)\b/i,
        ],
    },
    {
        allergen: 'weekdieren',
        patterns: [
            /\b(mosselen?|oesters?|inktvis|octopus|pijlinktvis|squid|calamari|coquilles?|sint-jakobs|st-jacques|abalone|kokkels?)\b/i,
        ],
    },
    {
        allergen: 'selderij',
        patterns: [
            /\b(selderij|knolselderij|bleekselderij)\b/i,
        ],
    },
    {
        allergen: 'mosterd',
        patterns: [
            /\b(mosterd|mustard|dijon|mosterdzaad)\b/i,
        ],
    },
    {
        allergen: 'sesam',
        patterns: [
            /\b(sesam(?:zaad|olie)?|tahin[ei]|sesame)\b/i,
        ],
    },
    {
        allergen: 'sulfiet',
        patterns: [
            /\b(wijn|sherry|port|cava|prosecco|champagne|balsamicoazijn|balsamico|gedroogde? vruchten?|rozijnen?|zuurkool)\b/i,
        ],
    },
    {
        allergen: 'lupine',
        patterns: [
            /\b(lupine|lupin)\b/i,
        ],
    },
];

/** Detecteer allergenen in één product-naam / ingredient-naam */
export function detectAllergensInName(name: string): Allergen[] {
    if (!name) return [];
    const found = new Set<Allergen>();
    for (const rule of RULES) {
        for (const pat of rule.patterns) {
            if (pat.test(name)) {
                found.add(rule.allergen);
                break;
            }
        }
    }
    return Array.from(found);
}

/** Detecteer allergenen in een lijst ingrediënten en retourneer unieke set + per-ingredient info */
export function detectAllergensInRecipe(
    ingredients: { naam?: string }[]
): { all: Allergen[]; perIngredient: { naam: string; allergens: Allergen[] }[] } {
    const all = new Set<Allergen>();
    const perIngredient = ingredients.map(ing => {
        const name = (ing?.naam || '').toString();
        const allergens = detectAllergensInName(name);
        allergens.forEach(a => all.add(a));
        return { naam: name, allergens };
    });
    return { all: Array.from(all), perIngredient };
}

export const ALLERGEN_LABELS: Record<Allergen, string> = {
    gluten: '🌾 Gluten',
    lactose: '🥛 Lactose',
    ei: '🥚 Ei',
    noten: '🌰 Noten',
    pinda: '🥜 Pinda',
    soja: '🌱 Soja',
    vis: '🐟 Vis',
    schaaldieren: '🦐 Schaaldieren',
    weekdieren: '🦑 Weekdieren',
    selderij: '🌿 Selderij',
    mosterd: '🌼 Mosterd',
    sesam: '⚫ Sesam',
    sulfiet: '🍷 Sulfiet',
    lupine: '🌸 Lupine',
};
