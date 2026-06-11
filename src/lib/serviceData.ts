/**
 * Helper voor Service Mode: combineert een echt DB-event + DB-courses +
 * DB-allergies tot het rich `ServiceEvent`-shape dat de KDS-UI verwacht.
 *
 * Sinds P0.5 (2026-05-20) is de oude `_data/serviceMockData.ts`
 * verwijderd — alle KDS-data komt nu uit de database. Bij events zonder
 * courses returnt deze helper null zodat de UI een lege state met link
 * naar event-hub kan tonen i.p.v. mock-fallback.
 */

import type { DbEvent, DbCourse, DbEventAllergy } from '@/types';
import type {
    ServiceEvent, Course, AllergyEntry, AllergenCode, CourseGerecht,
} from '@/app/events/[id]/service/_types/service';
import { findGerechtMatch } from '@/lib/gerechtMatch';

/* Lichte gerecht-shape voor de KDS: allergie-cross-ref + foto's + service-tips.
   `id` is nodig voor de FK-route via courses.gerecht_ids; de overige velden
   komen gewoon mee uit useSupabase('gerechten') (select *). */
export interface GerechtAllergenLookup {
    id?: string;
    naam: string;
    allergenen?: string[] | null;
    foto_url?: string | null;
    service_image?: string | null;
    service_tip?: string | null;
}

/**
 * Los de gerechten van een gang op, in menu-volgorde.
 *
 * 1) FK-route: courses.gerecht_ids (sinds migratie 20260611100000) — betrouwbaar.
 * 2) Fallback: comma-separated dish-namen uit course.description, case-
 *    insensitive naam-match — voor data van vóór de migratie.
 */
export function resolveGerechtenForCourse(
    course: DbCourse,
    gerechten: GerechtAllergenLookup[],
): GerechtAllergenLookup[] {
    const out: GerechtAllergenLookup[] = [];
    const seen = new Set<string>();

    const ids = Array.isArray(course.gerecht_ids) ? course.gerecht_ids : [];
    for (const id of ids) {
        const g = gerechten.find(x => x.id === id);
        if (g && !seen.has(g.naam.toLowerCase().trim())) {
            out.push(g);
            seen.add(g.naam.toLowerCase().trim());
        }
    }
    if (out.length > 0) return out;

    for (const part of (course.description || '').split(',')) {
        const t = part.trim();
        if (!t || seen.has(t.toLowerCase())) continue;
        /* Fuzzy-maar-veilig: exact → uniek-containment ("Bavette" vindt
           "Gerookte bavette"); ambigu = geen match. */
        const g = findGerechtMatch(t, gerechten.filter(x => x.naam));
        if (g && !out.includes(g)) {
            out.push(g);
            seen.add(t.toLowerCase());
        }
    }
    return out;
}

/** Default banner-gradient per type. */
function bannerForType(type: string | undefined | null): string {
    const t = (type || '').toLowerCase();
    if (t.includes('bruiloft')) return 'linear-gradient(135deg, #6b3410, #2a1a0a)';
    if (t.includes('bedrijf')) return 'linear-gradient(135deg, #1e3a8a, #0f1e3a)';
    if (t.includes('verjaard') || t.includes('particulier')) return 'linear-gradient(135deg, #5b2148, #1a0a1a)';
    return 'linear-gradient(135deg, #3f3f46, #18181b)';
}

/** Default emoji per type. */
function heroForType(type: string | undefined | null): string {
    const t = (type || '').toLowerCase();
    if (t.includes('bruiloft')) return '💍';
    if (t.includes('bedrijf')) return '🏢';
    if (t.includes('verjaard')) return '🎂';
    if (t.includes('festival')) return '🎪';
    return '🍽️';
}

/** Map DbCourse → Course (UI shape). Zorgt voor defaults op elk JSONB-veld.
 *  Met `gerechten` erbij krijgt de course ook foto's + service-tips mee. */
function dbCourseToCourse(c: DbCourse, gerechten: GerechtAllergenLookup[] = []): Course {
    const resolved = resolveGerechtenForCourse(c, gerechten);
    const courseGerechten: CourseGerecht[] = resolved.map(g => ({
        id: g.id,
        naam: g.naam,
        fotoUrl: g.service_image || g.foto_url || undefined,
        serviceTip: g.service_tip || undefined,
    }));
    const fotoUrl = courseGerechten.find(g => g.fotoUrl)?.fotoUrl;
    return {
        id: 'c_' + c.id,
        num: c.num,
        title: c.title,
        emoji: c.emoji || '🍽️',
        imgGradient: c.image_gradient || 'linear-gradient(135deg, #3f3f46, #18181b)',
        fotoUrl,
        gerechten: courseGerechten.length > 0 ? courseGerechten : undefined,
        prepTime: c.prep_time_minutes || 0,
        serveTime: c.serve_offset_minutes || 0,
        status: c.status,
        description: c.description || '',
        vegOption: c.veg_option || undefined,
        aiNote: c.ai_note || undefined,
        mise: Array.isArray(c.mise) ? c.mise : [],
        steps: Array.isArray(c.steps) ? c.steps : [],
        plating: Array.isArray(c.plating) ? c.plating : [],
        qualityChecks: Array.isArray(c.quality_checks) ? c.quality_checks : [],
        items: Array.isArray(c.items) ? c.items.map((it, idx) => ({
            id: it.id || `c_${c.id}_t${idx + 1}`,
            table: it.table || idx + 1,
            count: it.count || 0,
            served: !!it.served,
            ready: !!it.ready,
            inProgress: !!it.inProgress,
            started: it.started,
            special: it.special,
        })) : [],
    };
}

/** Map DbEventAllergy → AllergyEntry (UI shape). */
function dbAllergyToEntry(a: DbEventAllergy): AllergyEntry {
    /* AllergenCode is een gesloten set in de mock; pas niet-matchende codes
       door zonder coercion zodat we de string-fallback kunnen tonen. */
    const allergens = (a.allergens || []) as AllergenCode[];
    return {
        table: a.table_num || 0,
        seat: a.seat_num || 0,
        name: a.name || '—',
        allergens,
        note: a.note || '',
    };
}

/**
 * Cross-reference allergenen-codes per gang.
 *
 * Voor elke gang: parse de description (comma-separated dish-namen) en
 * lees gerechten.allergenen[] voor elk gerecht. De vereniging is wat de
 * gang aan allergenen "raakt".
 *
 * Vervolgens kruisen we dat met de event_allergies van gasten — als een
 * gast op tafel T allergeen X heeft EN de gang bevat X, dan flaggen we
 * `items[T].special = "T3 Marie pinda risico"` zodat de KDS-card automatisch
 * een rode rand om die tafel-cel zet zonder dat de pitmaster handmatig
 * iets hoeft in te vullen.
 */
function buildSpecialFlagsForCourse(
    course: DbCourse,
    eventAllergies: DbEventAllergy[],
    gerechten: GerechtAllergenLookup[],
): Map<number, string> {
    /* Verzamel allergenen-codes uit alle gerechten in deze gang.
       resolveGerechtenForCourse pakt de FK-route (gerecht_ids) waar die
       bestaat en valt anders terug op naam-match via de description. */
    const courseAllergens = new Set<string>();
    for (const g of resolveGerechtenForCourse(course, gerechten)) {
        for (const code of g.allergenen || []) courseAllergens.add(code.toUpperCase());
    }

    /* Voor elke event_allergy: als overlap → flag op tafel-nummer. */
    const flags = new Map<number, string>();
    if (courseAllergens.size === 0) return flags;

    for (const a of eventAllergies) {
        if (!a.table_num || !a.allergens) continue;
        const overlap = a.allergens.filter(code => courseAllergens.has(code.toUpperCase()));
        if (overlap.length === 0) continue;
        const naam = a.name || `Tafel ${a.table_num}`;
        const codes = overlap.join('+');
        const sev = a.severity === 'critical' ? '⚠️ KRITIEK ' : '';
        const msg = `${sev}T${a.table_num} ${naam} — ${codes}`;
        const existing = flags.get(a.table_num);
        flags.set(a.table_num, existing ? existing + ' · ' + msg : msg);
    }
    return flags;
}

/**
 * Bouw een ServiceEvent uit DB rows. Returns null als er geen courses zijn —
 * caller moet dan terugvallen op mock-data of een lege state tonen.
 *
 * `gerechten` is optioneel: zonder krijg je de oude gedrag (geen automatische
 * allergie-cross-ref). Met gerechten[] krijgt elke course-item.special een
 * automatische flag bij allergie-overlap.
 */
export function dbEventToServiceEvent(
    event: DbEvent,
    courses: DbCourse[],
    allergies: DbEventAllergy[],
    gerechten: GerechtAllergenLookup[] = [],
): ServiceEvent | null {
    const eventCourses = courses.filter(c => c.event_id === event.id);
    if (eventCourses.length === 0) return null;

    const eventAllergies = allergies.filter(a => a.event_id === event.id);

    /* Datum-label is vrij format; formatteer NL kort. */
    const dt = new Date(event.date);
    const isToday = dt.toDateString() === new Date().toDateString();
    const dateLabel = isToday
        ? 'Vandaag'
        : dt.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
    const startTime = event.start_time ? event.start_time.slice(0, 5) : '17:00';

    /* Status: live als event vandaag is + start_time gepasseerd. */
    const now = new Date();
    const isLive = isToday && event.start_time
        ? now.getHours() * 60 + now.getMinutes() >= parseInt(event.start_time.slice(0, 2), 10) * 60
        : false;

    return {
        id: 'evt_db_' + event.id,
        date: dateLabel + (startTime ? ' · ' + startTime : ''),
        title: event.name,
        venue: event.location || '—',
        guests: event.guests || 0,
        vegGuests: event.veg_guests || 0,
        veganGuests: event.vegan_guests || 0,
        glutenFreeGuests: event.gluten_free_guests || 0,
        type: event.type || 'Event',
        package: event.notitie || '—',
        status: isLive ? 'live' : (event.status === 'completed' ? 'completed' : 'scheduled'),
        startTime,
        staff: [],
        hero: heroForType(event.type),
        banner: bannerForType(event.type),
        allergyTable: eventAllergies
            .sort((a, b) => (a.table_num || 0) - (b.table_num || 0))
            .map(dbAllergyToEntry),
        courses: eventCourses
            .sort((a, b) => a.num - b.num)
            .map(c => {
                const course = dbCourseToCourse(c, gerechten);
                /* Auto-allergie-flagging per tafel obv gerechten.allergenen. */
                const flags = buildSpecialFlagsForCourse(c, eventAllergies, gerechten);
                if (flags.size > 0) {
                    course.items = course.items.map(it => ({
                        ...it,
                        special: it.special || flags.get(it.table) || undefined,
                    }));
                }
                return course;
            }),
    };
}
