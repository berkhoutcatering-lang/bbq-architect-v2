/* ═══════════════════════════════════════════════════════════════════
   SERVICE MODE — type-definities + ALLERGENS lookup.

   Voorheen: `_data/serviceMockData.ts` met hardcoded EVENT_BRUILOFT,
   EVENT_TECHCORP, EVENT_BERGHUIS arrays + SERVICE_AI_DIRECTIVES. Die
   mock-data is verwijderd (P0.5) — KDS draait nu volledig op real DB-data
   via `dbEventToServiceEvent()` in src/lib/serviceData.ts. Deze file
   houdt alleen de types + de ALLERGENS-display-lookup over.
   ═══════════════════════════════════════════════════════════════════ */

export type AllergenCode = 'G' | 'L' | 'N' | 'V' | 'VE' | 'E' | 'S' | 'F' | 'M';

export const ALLERGENS: Record<AllergenCode, { label: string; color: string }> = {
    G: { label: 'Gluten', color: '#d97706' },
    L: { label: 'Lactose', color: '#3b82f6' },
    N: { label: 'Noten', color: '#92400e' },
    V: { label: 'Veggie', color: '#10b981' },
    VE: { label: 'Vegan', color: '#059669' },
    E: { label: 'Ei', color: '#facc15' },
    S: { label: 'Soja', color: '#a3a3a3' },
    F: { label: 'Vis', color: '#0ea5e9' },
    M: { label: 'Mosterd', color: '#eab308' },
};

export type CourseStatus = 'queued' | 'active' | 'ready' | 'served' | 'recalled';

export interface CourseStep { n: number; action: string; detail: string }
export interface CourseMise { item: string; qty: string; source?: string }

export interface CourseItem {
    id: string;
    table: number;
    count: number;
    served?: boolean;
    ready?: boolean;
    inProgress?: boolean;
    started?: string;
    special?: string;
}

/** Gerecht zoals de KDS hem nodig heeft — opgelost uit courses.gerecht_ids
 *  (FK-route) of via naam-match op de description (fallback pre-migratie). */
export interface CourseGerecht {
    id?: string;
    naam: string;
    fotoUrl?: string;
    serviceTip?: string;
}

export interface Course {
    id: string;
    num: number;
    title: string;
    emoji: string;
    imgGradient: string;
    prepTime: number;
    serveTime: number;
    status: CourseStatus;
    vegOption?: string;
    description: string;
    mise: CourseMise[];
    steps: CourseStep[];
    plating: string[];
    qualityChecks: string[];
    items: CourseItem[];
    aiNote?: string;
    /** Eerste beschikbare gerecht-foto — card-header/hero. Ontbreekt = emoji-fallback. */
    fotoUrl?: string;
    /** Opgeloste gerechten van deze gang, in menu-volgorde. */
    gerechten?: CourseGerecht[];
}

export interface AllergyEntry {
    table: number;
    seat: number;
    name: string;
    allergens: AllergenCode[];
    note: string;
}

export interface ServiceEvent {
    id: string;
    date: string;
    title: string;
    venue: string;
    guests: number;
    vegGuests: number;
    veganGuests: number;
    glutenFreeGuests: number;
    type: string;
    package: string;
    status: 'live' | 'scheduled' | 'completed';
    startTime: string;
    staff: string[];
    hero: string;
    banner: string;
    allergyTable: AllergyEntry[];
    courses: Course[];
}

export interface ServiceAIDirective {
    severity: 'critical' | 'opportunity' | 'info';
    title: string;
    body: string;
}
