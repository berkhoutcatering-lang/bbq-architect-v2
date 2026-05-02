/**
 * Hardcoded BBQ-prep-fases voor de Vandaag-EventHero.
 *
 * V1 keuze: globaal vast, niet tenant-specifiek. Werkt voor Hop & Bites en
 * vergelijkbare smoke/grill-cateraars. Pasta-/lunch-cateraars krijgen een
 * "geen template"-fallback in EventHero (dan rendert hij geen checklist).
 *
 * Tenant-specifieke `prep_templates` is een aparte ronde — zie plan.
 */

export interface PrepFaseDef {
  id: string;
  label: string;
  /** Aantal dagen vóór event-dag (D-day). 0 = D-day zelf. */
  daysOffset: number;
}

export const BBQ_PREP_FASES: PrepFaseDef[] = [
  { id: 'hout', label: 'Hout bestellen', daysOffset: 14 },
  { id: 'pekel', label: 'Pekelen', daysOffset: 3 },
  { id: 'rub', label: 'Rub aanbrengen', daysOffset: 2 },
  { id: 'smoke', label: 'Smoken', daysOffset: 1 },
  { id: 'service', label: 'Service / event', daysOffset: 0 },
];

/**
 * Bepaal welke fases "klaar" zijn op basis van days-away.
 * Alleen fases met daysOffset >= daysAway worden niet als done behandeld.
 *
 * Voorbeeld: event over 3 dagen → "Hout bestellen" (D-14) is voorbij/done,
 * "Pekelen" (D-3) is current, rest staat nog open.
 */
export function deriveFaseProgress(daysAway: number): {
  id: string;
  label: string;
  daysOffset: number;
  done: boolean;
}[] {
  return BBQ_PREP_FASES.map((f) => ({
    ...f,
    done: daysAway < f.daysOffset, // moment is al voorbij
  }));
}
