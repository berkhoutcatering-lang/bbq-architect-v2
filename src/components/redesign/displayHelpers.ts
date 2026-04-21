/* Shared display helpers for redesign components.
   Purpose: normalize data-layer quirks at the UI boundary so the redesign
   pages never show backend plumbing (e.g. auto-generated prefixes). */

/** Strip leading "Offerte: " / "Offerte-" / "OFF-xxxx: " from event names.
 *  These get added by event auto-creation flows but pollute the cinematic hero titles. */
export function displayEventName(name: string | null | undefined): string {
  if (!name) return 'Geen titel';
  return name
    .replace(/^offerte\s*[:\-–]\s*/i, '')
    .replace(/^OFF-\d+-\d+\s*[:\-–]\s*/i, '')
    .trim() || 'Geen titel';
}

/** Capitalize first letter (name titles tend to come in lowercase from data entry). */
export function titleCase(s: string | null | undefined): string {
  if (!s) return '';
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}
