/**
 * Conflict-detection utility voor events.
 *
 * Vóór deze module zaten conflict-flags hardcoded in de mock-data van de
 * Agenda (`conflict: { with: 'e4', note: 'Smoker dubbel bezet' }`). Echte
 * runtime-detectie ontbrak waardoor:
 *  - nieuwe events zonder hardcoded flag silent door-glipten (smoker
 *    capacity-overschrijding bleef onzichtbaar)
 *  - dubbele venue-boekingen niet opgemerkt werden
 *  - planning-warnings inconsistent waren tussen Agenda en Events
 *
 * Deze module levert pure functies die op een lijst events conflicts
 * berekenen. Bewust geen state, geen hooks — alleen input → output, zodat
 * het zowel client (Agenda) als server (event-suggesties) kan gebruiken.
 *
 * Granulariteit: dag-niveau (DbEvent heeft alleen `date`, geen tijdstip).
 * Bij introductie van start_time/end_time kan dit module de overlap-logica
 * uitbreiden zonder consumer-changes.
 */

export interface ConflictableEvent {
    id: number | string;
    name?: string;
    date?: string;        // YYYY-MM-DD
    /* Optioneel: HH:MM lokaal — wanneer aanwezig wordt venue-conflict
       op tijd-overlap berekend i.p.v. dag-grain. */
    start_time?: string | null;
    end_time?: string | null;
    location?: string;
    guests?: number;
    status?: string;       // 'confirmed' | 'optie' | 'cancelled' etc.
    /* Optioneel: events kunnen aangeven dat ze een smoker nodig hebben.
       Default-aanname: events ≥ 60 gasten gebruiken low&slow + smoker. */
    needs_smoker?: boolean;
    smoker_kg?: number;    // capaciteits-eis in kg vlees
    type?: string;
}

export type ConflictType = 'smoker' | 'venue' | 'team' | 'capacity';
export type ConflictSeverity = 'critical' | 'warning' | 'info';

export interface Conflict {
    type: ConflictType;
    severity: ConflictSeverity;
    eventIds: (number | string)[];
    note: string;
    /* Datum waarop conflict zich voordoet — handig voor grouping op de Agenda. */
    date?: string;
}

export interface ConflictDetectionConfig {
    /* Maximale smoker-capaciteit (kg) per dag, somatie van alle smokers. */
    maxSmokerKgPerDay?: number;
    /* Default aanname voor smoker-kg per gast bij events zonder
       expliciete smoker_kg veld. Hop & Bites: low&slow ~0.4 kg/gast. */
    smokerKgPerGuestDefault?: number;
    /* Drempel-waarde voor needs_smoker auto-detectie als veld ontbreekt. */
    needsSmokerGuestThreshold?: number;
    /* Statussen die níét meetellen (bv. 'cancelled', 'concept'). */
    excludeStatuses?: string[];
}

const DEFAULT_CONFIG: Required<ConflictDetectionConfig> = {
    maxSmokerKgPerDay: 60,
    smokerKgPerGuestDefault: 0.4,
    needsSmokerGuestThreshold: 60,
    excludeStatuses: ['cancelled', 'geannuleerd', 'afgewezen', 'concept'],
};

/** Filter events naar alleen "geldig" voor conflict-detectie (status check). */
function activeEvents(events: ConflictableEvent[], cfg: Required<ConflictDetectionConfig>): ConflictableEvent[] {
    return events.filter(e => !!e.date && !cfg.excludeStatuses.includes((e.status || '').toLowerCase()));
}

/** Groepeer events per datum voor efficiënte O(n) per-dag analyse. */
function groupByDate(events: ConflictableEvent[]): Map<string, ConflictableEvent[]> {
    const map = new Map<string, ConflictableEvent[]>();
    for (const e of events) {
        if (!e.date) continue;
        const list = map.get(e.date) || [];
        list.push(e);
        map.set(e.date, list);
    }
    return map;
}

/** Schat smoker-belasting voor een event (kg vlees op smoker). */
export function estimateSmokerKg(e: ConflictableEvent, cfg: ConflictDetectionConfig = {}): number {
    const merged = { ...DEFAULT_CONFIG, ...cfg };
    if (typeof e.smoker_kg === 'number') return e.smoker_kg;
    const needsSmoker = e.needs_smoker ?? (e.guests || 0) >= merged.needsSmokerGuestThreshold;
    if (!needsSmoker) return 0;
    return (e.guests || 0) * merged.smokerKgPerGuestDefault;
}

/** Detecteer smoker-capaciteit overschrijding per dag. */
export function detectSmokerConflicts(
    events: ConflictableEvent[],
    config: ConflictDetectionConfig = {},
): Conflict[] {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const conflicts: Conflict[] = [];
    const byDate = groupByDate(activeEvents(events, cfg));

    for (const [date, dayEvents] of byDate) {
        const totalKg = dayEvents.reduce((s, e) => s + estimateSmokerKg(e, cfg), 0);
        if (totalKg <= cfg.maxSmokerKgPerDay) continue;
        const smokerEvents = dayEvents.filter(e => estimateSmokerKg(e, cfg) > 0);
        if (smokerEvents.length < 2) continue; // 1 enkel groot event = capacity-warning, niet conflict
        conflicts.push({
            type: 'smoker',
            severity: 'critical',
            eventIds: smokerEvents.map(e => e.id),
            note: `Smoker-capaciteit overschreden op ${date}: ${totalKg.toFixed(0)}kg nodig, ${cfg.maxSmokerKgPerDay}kg beschikbaar`,
            date,
        });
    }
    return conflicts;
}

/** Parse HH:MM naar minuten sinds middernacht; null bij ontbrekende of ongeldige input. */
function timeToMinutes(t?: string | null): number | null {
    if (!t) return null;
    const m = t.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Bepaal of twee event-tijdvakken overlappen op dezelfde dag. Conservatief:
 *  als beide events tijden hebben → strict half-open overlap [start, end).
 *  Als één van beide géén tijden heeft → fallback op dag-overlap (true). */
function timesOverlap(a: ConflictableEvent, b: ConflictableEvent): boolean {
    const aStart = timeToMinutes(a.start_time);
    const aEnd = timeToMinutes(a.end_time);
    const bStart = timeToMinutes(b.start_time);
    const bEnd = timeToMinutes(b.end_time);
    /* Mist één een veld → kunnen we tijd-overlap niet uitsluiten; altijd true. */
    if (aStart == null || aEnd == null || bStart == null || bEnd == null) return true;
    return aStart < bEnd && bStart < aEnd;
}

/** Detecteer dubbele venue-boekingen op dezelfde dag.
 *  Met start_time/end_time: strict tijd-overlap; anders dag-grain. */
export function detectVenueConflicts(
    events: ConflictableEvent[],
    config: ConflictDetectionConfig = {},
): Conflict[] {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const conflicts: Conflict[] = [];
    const byDate = groupByDate(activeEvents(events, cfg));

    for (const [date, dayEvents] of byDate) {
        const byVenue = new Map<string, ConflictableEvent[]>();
        for (const e of dayEvents) {
            const loc = (e.location || '').trim().toLowerCase();
            if (!loc) continue;
            const list = byVenue.get(loc) || [];
            list.push(e);
            byVenue.set(loc, list);
        }
        for (const [loc, group] of byVenue) {
            if (group.length < 2) continue;
            /* Subset events die daadwerkelijk in tijd overlappen — n² is OK,
               typisch <5 events per locatie/dag. */
            const overlapping: ConflictableEvent[] = [];
            const seen = new Set<number | string>();
            for (let i = 0; i < group.length; i++) {
                for (let j = i + 1; j < group.length; j++) {
                    if (timesOverlap(group[i], group[j])) {
                        if (!seen.has(group[i].id)) { overlapping.push(group[i]); seen.add(group[i].id); }
                        if (!seen.has(group[j].id)) { overlapping.push(group[j]); seen.add(group[j].id); }
                    }
                }
            }
            if (overlapping.length < 2) continue;
            conflicts.push({
                type: 'venue',
                severity: 'warning',
                eventIds: overlapping.map(e => e.id),
                note: `${overlapping.length} events overlappen op zelfde locatie (${loc}) op ${date}`,
                date,
            });
        }
    }
    return conflicts;
}

/** Detecteer enkele-event capacity-warnings (te groot voor 1 dag, ongeacht andere). */
export function detectCapacityWarnings(
    events: ConflictableEvent[],
    config: ConflictDetectionConfig = {},
): Conflict[] {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    return activeEvents(events, cfg)
        .filter(e => estimateSmokerKg(e, cfg) > cfg.maxSmokerKgPerDay)
        .map(e => ({
            type: 'capacity' as const,
            severity: 'warning' as const,
            eventIds: [e.id],
            note: `Event "${e.name || e.id}" alleen al overschrijdt smoker-capaciteit (${estimateSmokerKg(e, cfg).toFixed(0)}kg)`,
            date: e.date,
        }));
}

/** Run alle conflict-detectors. Resultaat is gegroepeerd per type. */
export function detectAllConflicts(
    events: ConflictableEvent[],
    config: ConflictDetectionConfig = {},
): {
    conflicts: Conflict[];
    byEventId: Map<number | string, Conflict[]>;
    byDate: Map<string, Conflict[]>;
} {
    const conflicts = [
        ...detectSmokerConflicts(events, config),
        ...detectVenueConflicts(events, config),
        ...detectCapacityWarnings(events, config),
    ];

    const byEventId = new Map<number | string, Conflict[]>();
    const byDate = new Map<string, Conflict[]>();
    for (const c of conflicts) {
        for (const id of c.eventIds) {
            const list = byEventId.get(id) || [];
            list.push(c);
            byEventId.set(id, list);
        }
        if (c.date) {
            const list = byDate.get(c.date) || [];
            list.push(c);
            byDate.set(c.date, list);
        }
    }
    return { conflicts, byEventId, byDate };
}

/** Helper: heeft event X conflicts? */
export function hasConflict(eventId: number | string, byEventId: Map<number | string, Conflict[]>): boolean {
    return (byEventId.get(eventId)?.length || 0) > 0;
}

/** Helper: hoogste severity onder conflicts van een event. */
export function highestSeverity(conflicts: Conflict[]): ConflictSeverity | null {
    if (conflicts.length === 0) return null;
    if (conflicts.some(c => c.severity === 'critical')) return 'critical';
    if (conflicts.some(c => c.severity === 'warning')) return 'warning';
    return 'info';
}
