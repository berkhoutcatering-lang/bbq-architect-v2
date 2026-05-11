/**
 * Recipe-phase-DAG-templates voor BBQ-gerechten.
 *
 * Per gerecht een geordende lijst van prep-phases met phase-duration en
 * dependency-chain. Wordt gebruikt door `bulk-schedule` om uit een offerte
 * automatisch realistische prep-taken te maken zonder dat de chef elke
 * phase handmatig moet inplannen.
 *
 * "Best of the world"-pillar #1: backward-scheduled smoker timeline
 * werkt pas écht magisch als bulk-schedule weet dat pulled pork = pekel→rub→smoke,
 * en niet alleen "iemand moet wat doen".
 *
 * Geen LLM hier. Pure data + helper-functies.
 */

import type { PrepTaskPhase } from '@/types/database.types';
import { PHASE_OFFSET_MINUTES, PHASE_DURATION_MINUTES } from './prepTaskScheduler';

/**
 * Per phase in een template:
 *   - `phase`: BBQ-keten-phase
 *   - `customOffsetMinutes?`: override van default PHASE_OFFSET_MINUTES
 *     (bv brisket smoke = 14u i.p.v. 12u default)
 *   - `customDurationMinutes?`: override van duration
 *   - `text`: korte taak-beschrijving voor in de UI ("Pekel aanzetten")
 *   - `station_type?`: hint voor automatische station-routing
 *   - `dependsOnPhase?`: deze phase wacht op een andere phase uit dezelfde template
 */
export interface RecipePhaseStep {
    phase: PrepTaskPhase;
    text: string;
    customOffsetMinutes?: number;
    customDurationMinutes?: number;
    station_type?:
        | 'smoker'
        | 'grill'
        | 'koud'
        | 'warm'
        | 'sauzen'
        | 'expeditie'
        | 'prep';
    dependsOnPhase?: PrepTaskPhase;
}

export interface RecipeTemplate {
    /** Slug — match op gerechten.naam (case-insensitive, fuzzy) of expliciete koppeling. */
    id: string;
    naam: string;
    /** Match-patterns voor fuzzy-koppeling met gerechten in de database. */
    matchPatterns: RegExp[];
    /** Geordende phases — eerste komt eerst in tijd, laatste = serveren. */
    steps: RecipePhaseStep[];
    /** Totale doorloop in uren voor display. */
    totalPrepHours: number;
    /** Korte omschrijving voor de planner-UI. */
    description: string;
}

/**
 * Standaard BBQ-templates. Sam kan deze lijst uitbreiden via een
 * `recipe_templates` tabel (V1.5); voor MVP zit het hier hardcoded
 * zodat bulk-schedule meteen iets goeds doet.
 */
export const RECIPE_TEMPLATES: RecipeTemplate[] = [
    {
        id: 'pulled-pork',
        naam: 'Pulled Pork',
        matchPatterns: [/pulled\s*pork/i, /procureur/i, /pp-broodje/i],
        totalPrepHours: 36,
        description: '24u pekel → 12u rub → 12u smoke @110°C → 1u rust → trekken',
        steps: [
            { phase: 'inkoop', text: 'Procureur ophalen' },
            {
                phase: 'pekel',
                text: 'Pekel aanzetten',
                station_type: 'koud',
                dependsOnPhase: 'inkoop',
            },
            {
                phase: 'rub',
                text: 'Rub aanbrengen',
                station_type: 'koud',
                dependsOnPhase: 'pekel',
            },
            {
                phase: 'smoke',
                text: 'Smoker @110°C tot IT 92°C',
                station_type: 'smoker',
                dependsOnPhase: 'rub',
            },
            {
                phase: 'plate',
                text: 'Trekken + saus',
                station_type: 'warm',
                dependsOnPhase: 'smoke',
            },
            { phase: 'service', text: 'Uitgifte', station_type: 'expeditie' },
        ],
    },
    {
        id: 'brisket',
        naam: 'Brisket',
        matchPatterns: [/brisket/i, /borst(?:lap)?/i],
        totalPrepHours: 44,
        description: 'Dry-brine 24u → rub 2u → smoke 14u @110°C → 4u rust → slicen',
        steps: [
            { phase: 'inkoop', text: 'Brisket ophalen (full packer)' },
            {
                phase: 'pekel',
                text: 'Dry-brine (zout)',
                customDurationMinutes: 24 * 60,
                station_type: 'koud',
                dependsOnPhase: 'inkoop',
            },
            {
                phase: 'rub',
                text: 'Texas-rub aanbrengen',
                customOffsetMinutes: 20 * 60, // 20u voor event, niet de default 18u
                customDurationMinutes: 2 * 60,
                station_type: 'koud',
                dependsOnPhase: 'pekel',
            },
            {
                phase: 'smoke',
                text: 'Smoker @110°C tot IT 96°C (stall accepteren)',
                customOffsetMinutes: 18 * 60, // 14u smoke + 4u rust
                customDurationMinutes: 14 * 60,
                station_type: 'smoker',
                dependsOnPhase: 'rub',
            },
            {
                phase: 'plate',
                text: 'Slicen tegen draad in',
                customOffsetMinutes: 30,
                station_type: 'warm',
                dependsOnPhase: 'smoke',
            },
            { phase: 'service', text: 'Uitgifte', station_type: 'expeditie' },
        ],
    },
    {
        id: 'beef-ribs',
        naam: 'Beef Short Ribs',
        matchPatterns: [/short[- ]?ribs?/i, /beef\s*ribs?/i, /shortrib/i],
        totalPrepHours: 18,
        description: 'Rub 6u → smoke 8u @120°C → 1u rust',
        steps: [
            { phase: 'inkoop', text: 'Short ribs ophalen' },
            {
                phase: 'rub',
                text: 'Salt-pepper-rub',
                customOffsetMinutes: 14 * 60,
                customDurationMinutes: 6 * 60,
                station_type: 'koud',
                dependsOnPhase: 'inkoop',
            },
            {
                phase: 'smoke',
                text: 'Smoker @120°C tot IT 92°C',
                customOffsetMinutes: 9 * 60,
                customDurationMinutes: 8 * 60,
                station_type: 'smoker',
                dependsOnPhase: 'rub',
            },
            {
                phase: 'plate',
                text: 'Snijden tussen botten',
                customOffsetMinutes: 30,
                station_type: 'warm',
                dependsOnPhase: 'smoke',
            },
            { phase: 'service', text: 'Uitgifte', station_type: 'expeditie' },
        ],
    },
    {
        id: 'spare-ribs',
        naam: 'Spare Ribs',
        matchPatterns: [/spare\s*ribs?/i, /spareribs?/i, /3-2-1/i],
        totalPrepHours: 8,
        description: '3-2-1 methode: 3u rook open → 2u in folie → 1u afsmaak',
        steps: [
            { phase: 'inkoop', text: 'Spareribs ophalen (st louis cut)' },
            {
                phase: 'rub',
                text: 'Sweet-rub',
                customOffsetMinutes: 7 * 60,
                customDurationMinutes: 30,
                station_type: 'koud',
                dependsOnPhase: 'inkoop',
            },
            {
                phase: 'smoke',
                text: '3u open → 2u folie → 1u glaze',
                customOffsetMinutes: 6 * 60 + 30,
                customDurationMinutes: 6 * 60,
                station_type: 'smoker',
                dependsOnPhase: 'rub',
            },
            {
                phase: 'plate',
                text: 'Tussen botten snijden',
                customOffsetMinutes: 20,
                station_type: 'warm',
                dependsOnPhase: 'smoke',
            },
            { phase: 'service', text: 'Uitgifte', station_type: 'expeditie' },
        ],
    },
    {
        id: 'pulled-chicken',
        naam: 'Pulled Chicken',
        matchPatterns: [/pulled\s*chicken/i, /getrokken\s*kip/i],
        totalPrepHours: 16,
        description: 'Brine 12u → rub → smoke 3u @120°C → trekken',
        steps: [
            { phase: 'inkoop', text: 'Hele kip ophalen' },
            {
                phase: 'pekel',
                text: 'Brine 12u',
                customOffsetMinutes: 15 * 60,
                customDurationMinutes: 12 * 60,
                station_type: 'koud',
                dependsOnPhase: 'inkoop',
            },
            {
                phase: 'rub',
                text: 'Poultry-rub aanbrengen',
                customOffsetMinutes: 4 * 60,
                customDurationMinutes: 30,
                station_type: 'koud',
                dependsOnPhase: 'pekel',
            },
            {
                phase: 'smoke',
                text: 'Smoker @120°C tot IT 85°C',
                customOffsetMinutes: 3 * 60,
                customDurationMinutes: 3 * 60,
                station_type: 'smoker',
                dependsOnPhase: 'rub',
            },
            {
                phase: 'plate',
                text: 'Trekken + saus',
                customOffsetMinutes: 20,
                station_type: 'warm',
                dependsOnPhase: 'smoke',
            },
            { phase: 'service', text: 'Uitgifte', station_type: 'expeditie' },
        ],
    },
    {
        id: 'whole-chicken',
        naam: 'Hele Kip',
        matchPatterns: [/hele\s*kip/i, /spatchcock/i, /whole\s*chicken/i],
        totalPrepHours: 4,
        description: 'Spatchcock → rub → grill 90min @180°C',
        steps: [
            { phase: 'inkoop', text: 'Hele kip ophalen' },
            {
                phase: 'rub',
                text: 'Spatchcocken + rub',
                customOffsetMinutes: 3 * 60,
                customDurationMinutes: 30,
                station_type: 'koud',
                dependsOnPhase: 'inkoop',
            },
            {
                phase: 'grill',
                text: 'Grill 90min @180°C',
                customOffsetMinutes: 2 * 60,
                customDurationMinutes: 90,
                station_type: 'grill',
                dependsOnPhase: 'rub',
            },
            {
                phase: 'plate',
                text: 'Versnijden',
                customOffsetMinutes: 20,
                station_type: 'warm',
                dependsOnPhase: 'grill',
            },
            { phase: 'service', text: 'Uitgifte', station_type: 'expeditie' },
        ],
    },
    {
        id: 'salmon',
        naam: 'Hot-Smoked Zalm',
        matchPatterns: [/zalm/i, /salmon/i],
        totalPrepHours: 14,
        description: 'Dry-cure 12u → spoelen → smoke 90min @80°C',
        steps: [
            { phase: 'inkoop', text: 'Zalmfilet ophalen' },
            {
                phase: 'pekel',
                text: 'Dry-cure (zout/suiker)',
                customOffsetMinutes: 14 * 60,
                customDurationMinutes: 12 * 60,
                station_type: 'koud',
                dependsOnPhase: 'inkoop',
            },
            {
                phase: 'smoke',
                text: 'Hot-smoke 90min @80°C',
                customOffsetMinutes: 2 * 60,
                customDurationMinutes: 90,
                station_type: 'smoker',
                dependsOnPhase: 'pekel',
            },
            {
                phase: 'plate',
                text: 'Plate met dille-room',
                customOffsetMinutes: 20,
                station_type: 'koud',
                dependsOnPhase: 'smoke',
            },
            { phase: 'service', text: 'Uitgifte', station_type: 'expeditie' },
        ],
    },
    {
        id: 'coleslaw',
        naam: 'Coleslaw',
        matchPatterns: [/coleslaw/i, /witte\s*koolsalade/i],
        totalPrepHours: 4,
        description: 'Snijden + dressen 2u voor event (rust voor flavor)',
        steps: [
            { phase: 'inkoop', text: 'Witte kool + wortel ophalen' },
            {
                phase: 'koud',
                text: 'Snijden + dressen',
                customOffsetMinutes: 2 * 60,
                customDurationMinutes: 30,
                station_type: 'koud',
                dependsOnPhase: 'inkoop',
            },
            { phase: 'service', text: 'Uitgifte' },
        ],
    },
    {
        id: 'mac-and-cheese',
        naam: 'Mac & Cheese',
        matchPatterns: [/mac\s*(and|&|en)\s*cheese/i, /macaroni\s*kaas/i],
        totalPrepHours: 3,
        description: 'Bechamel + pasta + oven 25min',
        steps: [
            { phase: 'inkoop', text: 'Pasta + kaas + melk' },
            {
                phase: 'warm',
                text: 'Bechamel + pasta koken',
                customOffsetMinutes: 90,
                customDurationMinutes: 30,
                station_type: 'warm',
                dependsOnPhase: 'inkoop',
            },
            {
                phase: 'grill',
                text: 'Oven 25min @180°C',
                customOffsetMinutes: 45,
                customDurationMinutes: 25,
                station_type: 'warm',
                dependsOnPhase: 'warm',
            },
            { phase: 'service', text: 'Uitgifte', station_type: 'expeditie' },
        ],
    },
    {
        id: 'bbq-saus',
        naam: 'BBQ-saus',
        matchPatterns: [/bbq[- ]?saus/i, /bbq\s*sauce/i, /kansas\s*city/i],
        totalPrepHours: 24,
        description: 'Inkoken 1u → koelen 12u voor flavor-bonding',
        steps: [
            { phase: 'inkoop', text: 'Ingrediënten ophalen' },
            {
                phase: 'koud',
                text: 'Inkoken + koelen',
                customOffsetMinutes: 14 * 60,
                customDurationMinutes: 60,
                station_type: 'sauzen',
                dependsOnPhase: 'inkoop',
            },
            { phase: 'service', text: 'Tafels voorzien', station_type: 'expeditie' },
        ],
    },
];

/**
 * Fuzzy-match een gerecht-naam tegen onze templates. Eerste match wint.
 * Returnt null als geen match — caller valt dan terug op een generic phase
 * (`other`) of een handmatig prep-task.
 */
export function findTemplateForDish(naam: string): RecipeTemplate | null {
    if (!naam || typeof naam !== 'string') return null;
    for (const tpl of RECIPE_TEMPLATES) {
        for (const pat of tpl.matchPatterns) {
            if (pat.test(naam)) return tpl;
        }
    }
    return null;
}

/**
 * Resolve de werkelijke offset voor een step — gebruikt customOffsetMinutes
 * als die gezet is, anders de default uit PHASE_OFFSET_MINUTES.
 */
export function resolveOffsetMinutes(step: RecipePhaseStep): number {
    return step.customOffsetMinutes ?? PHASE_OFFSET_MINUTES[step.phase];
}

/**
 * Resolve duration voor een step — custom of default.
 */
export function resolveDurationMinutes(step: RecipePhaseStep): number {
    return step.customDurationMinutes ?? PHASE_DURATION_MINUTES[step.phase];
}
