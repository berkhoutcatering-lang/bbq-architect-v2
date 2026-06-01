/* Canonical status definitions + aliases + mappings.
   ──────────────────────────────────────────────────────
   Vóór 2026-06-01 had de codebase drie termen voor "geaccepteerd"
   (geaccepteerd, akkoord, goedgekeurd), twee voor "geannuleerd"
   (cancelled, geannuleerd), en geen centrale offerte→event mapping.
   Resultaat: orphan events, niet-getriggerde workflows, ai-actions
   die sommige geaccepteerde offertes negeerden.

   Deze file is de single source of truth. Nieuwe code gebruikt
   alleen de canonical values; legacy data wordt via normalize*
   gepatched zodat queries blijven werken.

   Hard rule: NIET deze constants veranderen zonder DB-migratie.
   De waarden hieronder matchen de DB-strings 1-op-1. */

// ─── Offerte statuses ─────────────────────────────────────────

export const OFFERTE_STATUS = {
    CONCEPT: 'concept',           // pitmaster werkt nog aan offerte
    VERZONDEN: 'verzonden',       // mail uit, klant heeft 'm
    GEACCEPTEERD: 'geaccepteerd', // klant heeft getekend op /q/[id]
    BETAALD: 'betaald',           // aanbetaling (of totaal) ontvangen via Mollie
    AFGEWEZEN: 'afgewezen',       // klant heeft expliciet afgezegd
    VERLOPEN: 'verlopen',         // geldig_tot voorbij zonder accept
} as const;

export type OfferteStatus = typeof OFFERTE_STATUS[keyof typeof OFFERTE_STATUS];

/* Legacy aliases — vertaal oude naar canonical.
   Toegevoegd bij verschillende migraties; nooit weghalen tot DB
   gemigreerd is met UPDATE offertes SET status = ... */
const OFFERTE_STATUS_ALIASES: Record<string, OfferteStatus> = {
    akkoord: 'geaccepteerd',     // pre-2026-05 alias
    goedgekeurd: 'geaccepteerd', // ai-actions.ts/financeAnalytics.ts alias
    voltooid: 'betaald',          // ai-actions.ts alias
    geannuleerd: 'afgewezen',     // pre-2026-04 alias
};

export function normalizeOfferteStatus(raw: string | null | undefined): OfferteStatus | null {
    if (!raw) return null;
    const lower = raw.toLowerCase().trim();
    if (Object.values(OFFERTE_STATUS).includes(lower as OfferteStatus)) {
        return lower as OfferteStatus;
    }
    if (OFFERTE_STATUS_ALIASES[lower]) {
        return OFFERTE_STATUS_ALIASES[lower];
    }
    return null;
}

/* "Is deze offerte effectief geaccepteerd?" — accepteert geaccepteerd
   én betaald (want betaald impliceert geaccepteerd). Gebruik deze
   helper overal waar je wilt weten "is dit een deal die door moet". */
export function isOfferteAccepted(status: string | null | undefined): boolean {
    const n = normalizeOfferteStatus(status);
    return n === OFFERTE_STATUS.GEACCEPTEERD || n === OFFERTE_STATUS.BETAALD;
}

/* "Is deze offerte definitief afgehandeld?" — betaald, afgewezen, of
   verlopen. Voor list-filters in /offertes om "openstaand" te tonen. */
export function isOfferteFinal(status: string | null | undefined): boolean {
    const n = normalizeOfferteStatus(status);
    return n === OFFERTE_STATUS.BETAALD || n === OFFERTE_STATUS.AFGEWEZEN || n === OFFERTE_STATUS.VERLOPEN;
}

/* "Is deze offerte open?" — concept of verzonden. Voor cashflow forecasts:
   open-offertes-totaal in de finance dashboard. */
export function isOfferteOpen(status: string | null | undefined): boolean {
    const n = normalizeOfferteStatus(status);
    return n === OFFERTE_STATUS.CONCEPT || n === OFFERTE_STATUS.VERZONDEN;
}

// ─── Event statuses ────────────────────────────────────────────

export const EVENT_STATUS = {
    PENDING: 'pending',           // nieuw event, nog niet vastgelegd
    OPTIE: 'optie',                // gekoppeld aan open offerte, plaatsing in agenda als reservering
    CONFIRMED: 'confirmed',       // offerte geaccepteerd → event gaat door
    IN_PROGRESS: 'in_progress',   // service-day actief, KDS live
    COMPLETED: 'completed',       // event afgelopen, reflectie ingevuld
    CANCELLED: 'cancelled',       // afgezegd ná confirmatie (kan factuur-correctie nodig hebben)
} as const;

export type EventStatus = typeof EVENT_STATUS[keyof typeof EVENT_STATUS];

const EVENT_STATUS_ALIASES: Record<string, EventStatus> = {
    geannuleerd: 'cancelled',     // NL alias
};

export function normalizeEventStatus(raw: string | null | undefined): EventStatus | null {
    if (!raw) return null;
    const lower = raw.toLowerCase().trim();
    if (Object.values(EVENT_STATUS).includes(lower as EventStatus)) {
        return lower as EventStatus;
    }
    if (EVENT_STATUS_ALIASES[lower]) {
        return EVENT_STATUS_ALIASES[lower];
    }
    return null;
}

/* "Is dit event actief?" — gebruikt door /agenda, capacity-planning,
   /voorraad demand-forecast. Alles behalve cancelled + completed. */
export function isEventActive(status: string | null | undefined): boolean {
    const n = normalizeEventStatus(status);
    return n === EVENT_STATUS.PENDING
        || n === EVENT_STATUS.OPTIE
        || n === EVENT_STATUS.CONFIRMED
        || n === EVENT_STATUS.IN_PROGRESS;
}

// ─── Offerte → Event mapping (canonical) ───────────────────────

/* Single source of truth voor offerte-status → event-status mapping.
   Eerder in syncQuoteToEvent (offertes/page.tsx) en accept-offerte/route.ts
   apart geïmplementeerd, met subtiel verschillende afhandeling van
   'verlopen' en 'akkoord'. Nu uniform.

   Return:
   - EventStatus = update event naar deze status
   - 'DELETE' = verwijder event (orphan cleanup bij afgewezen/verlopen)
   - null = niets doen (status niet relevant voor event-sync) */
export type EventSyncAction = EventStatus | 'DELETE' | null;

export function mapOfferteToEventStatus(offerteStatus: string | null | undefined): EventSyncAction {
    const n = normalizeOfferteStatus(offerteStatus);
    if (!n) return null;
    switch (n) {
        case OFFERTE_STATUS.CONCEPT:
        case OFFERTE_STATUS.VERZONDEN:
            return EVENT_STATUS.OPTIE;
        case OFFERTE_STATUS.GEACCEPTEERD:
        case OFFERTE_STATUS.BETAALD:
            return EVENT_STATUS.CONFIRMED;
        case OFFERTE_STATUS.AFGEWEZEN:
        case OFFERTE_STATUS.VERLOPEN:
            return 'DELETE'; // orphan-cleanup
        default:
            return null;
    }
}

// ─── Factuur statuses (voor compleetheid, raakt Golden Flow) ───

export const FACTUUR_STATUS = {
    CONCEPT: 'concept',
    VERZONDEN: 'verzonden',
    BETAALD: 'betaald',
    VERLOPEN: 'verlopen',         // vervaldatum voorbij, niet betaald
    OPEN: 'open',                  // synoniem voor verzonden (legacy)
} as const;

export type FactuurStatus = typeof FACTUUR_STATUS[keyof typeof FACTUUR_STATUS];

const FACTUUR_STATUS_ALIASES: Record<string, FactuurStatus> = {
    geannuleerd: 'concept',        // legacy
    vervallen: 'verlopen',         // bbq-tools.ts alias
};

export function normalizeFactuurStatus(raw: string | null | undefined): FactuurStatus | null {
    if (!raw) return null;
    const lower = raw.toLowerCase().trim();
    if (Object.values(FACTUUR_STATUS).includes(lower as FactuurStatus)) {
        return lower as FactuurStatus;
    }
    if (FACTUUR_STATUS_ALIASES[lower]) {
        return FACTUUR_STATUS_ALIASES[lower];
    }
    return null;
}

export function isFactuurPaid(status: string | null | undefined): boolean {
    return normalizeFactuurStatus(status) === FACTUUR_STATUS.BETAALD;
}

export function isFactuurOutstanding(status: string | null | undefined): boolean {
    const n = normalizeFactuurStatus(status);
    return n === FACTUUR_STATUS.VERZONDEN || n === FACTUUR_STATUS.OPEN || n === FACTUUR_STATUS.VERLOPEN;
}
