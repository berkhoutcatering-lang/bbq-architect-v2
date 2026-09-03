/**
 * Lokale datum-sleutels voor de Vandaag-berekeningen.
 *
 * `toISOString()` rekent naar UTC. In Europe/Amsterdam (UTC+1/+2) betekent dat
 * dat lokaal middernacht in de vórige dag — en op de 1e van de maand in de
 * vórige maand — valt. `new Date(2026, 8, 1).toISOString()` geeft
 * "2026-08-31T22:00:00Z", dus maandsleutel "2026-08" terwijl het label "sep" is.
 * Daardoor telde elke balk in de 6-maandengrafiek de maand ervoor.
 *
 * Deze helpers lezen de lokale kalenderwaarden en formatteren zelf.
 */

/** "2026-09" — lokale jaar+maand. */
export function localMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "2026-09-03" — lokale kalenderdag. */
export function localDayKey(d: Date): string {
  return `${localMonthKey(d)}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lokale kalenderdag, `offsetDays` dagen terug vanaf nu. */
export function localDayKeyAgo(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return localDayKey(d);
}
