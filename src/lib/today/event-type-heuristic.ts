/**
 * Segment-indeling voor de omzet-mix op Vandaag.
 *
 * Eerdere versie zocht naar "catering", "verhuur", "verkoop" en "shop" in
 * `events.type`. Die waarden schrijft de app nergens weg: de EventWizard biedt
 * alleen Particulier / Zakelijk / Festival. Daardoor viel vrijwel elk event in
 * "Overig" en kon de donut nooit iets zinnigs tonen.
 *
 * Nu delen we in op de as die de data wél heeft — het klantsegment. Dat is ook
 * de vraag waar je iets mee kunt: komt de omzet van particuliere feesten, van
 * bedrijven of van festivals? Vrije-tekst types uit oudere records worden
 * meegenomen via de regexes hieronder.
 */

interface EventLike {
  id: number | string;
  type?: string | null;
  menu_selectie?: unknown;
  guests?: number | null;
  ppp?: number | null;
  date?: string | null;
}

export type EventCategory = 'particulier' | 'zakelijk' | 'festival' | 'overig';

export function classifyEventType(e: EventLike): EventCategory {
  const t = (e.type || '').toString().toLowerCase();

  if (/festival|markt|fair|evenement/.test(t)) return 'festival';
  if (/zakelijk|bedrijf|business|corporate|b2b/.test(t)) return 'zakelijk';
  if (/particulier|prive|privé|consument|b2c|feest|bruiloft|verjaardag/.test(t)) return 'particulier';

  return 'overig';
}

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  particulier: 'Particulier',
  zakelijk: 'Zakelijk',
  festival: 'Festival',
  overig: 'Onbekend',
};

export const CATEGORY_COLOR: Record<EventCategory, string> = {
  particulier: '#c4a35a',
  zakelijk: '#93c5fd',
  festival: '#86efac',
  overig: '#94a3b8',
};
