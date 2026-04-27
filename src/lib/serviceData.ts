/**
 * Helper voor Service Mode: combineert een echt DB-event + DB-courses +
 * DB-allergies tot het rich `ServiceEvent`-shape dat de KDS-UI verwacht.
 *
 * Vóór deze module liep Service Mode alléén op hardcoded SERVICE_EVENTS
 * mock-data; een echt event selecteren had een lege courses-array tot gevolg
 * en de KDS-UI viel om. Met deze merge:
 *   - useDbServiceEvents() haalt events + courses + allergies op
 *   - dbEventToServiceEvent() bouwt het ServiceEvent shape
 *   - bij events zonder courses returnt de helper null zodat consumers naar
 *     mock kunnen fallbacken (graceful degradation tot data ingevuld is)
 */

import type { DbEvent, DbCourse, DbEventAllergy } from '@/types';
import type {
    ServiceEvent, Course, AllergyEntry, AllergenCode,
} from '@/app/service/_data/serviceMockData';

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

/** Map DbCourse → Course (UI shape). Zorgt voor defaults op elk JSONB-veld. */
function dbCourseToCourse(c: DbCourse): Course {
    return {
        id: 'c_' + c.id,
        num: c.num,
        title: c.title,
        emoji: c.emoji || '🍽️',
        imgGradient: c.image_gradient || 'linear-gradient(135deg, #3f3f46, #18181b)',
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
 * Bouw een ServiceEvent uit DB rows. Returns null als er geen courses zijn —
 * caller moet dan terugvallen op mock-data of een lege state tonen.
 */
export function dbEventToServiceEvent(
    event: DbEvent,
    courses: DbCourse[],
    allergies: DbEventAllergy[],
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
            .map(dbCourseToCourse),
    };
}
