/**
 * Heuristiek voor event-type — v1 hack tot er een `events.type` enum migratie ligt.
 *
 * Logica:
 *   - menu_selectie ingevuld of items met cat=eten → catering
 *   - alleen materieel-/locatie-velden gevuld → verhuur
 *   - product-verkoop signaal (event.type bevat "verkoop"/"shop"/"toonbank") → verkoop
 *   - rest → overig
 */

interface EventLike {
  id: number | string;
  type?: string | null;
  menu_selectie?: unknown;
  guests?: number | null;
  ppp?: number | null;
  date?: string | null;
}

export type EventCategory = 'catering' | 'verhuur' | 'verkoop' | 'overig';

export function classifyEventType(e: EventLike): EventCategory {
  const t = (e.type || '').toString().toLowerCase();

  if (/verkoop|shop|toonbank|webshop/.test(t)) return 'verkoop';
  if (/verhuur|rental|materieel/.test(t)) return 'verhuur';

  const menu = e.menu_selectie;
  const hasMenu =
    Array.isArray(menu) ? menu.length > 0
    : typeof menu === 'object' && menu !== null
      ? Object.keys(menu as Record<string, unknown>).length > 0
      : false;

  if (hasMenu) return 'catering';
  if (/catering|bbq|feest|borrel|lunch|diner/.test(t)) return 'catering';

  return 'overig';
}

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  catering: 'BBQ Catering',
  verhuur: 'BBQ Verhuur',
  verkoop: 'Verkoop',
  overig: 'Overig',
};

export const CATEGORY_COLOR: Record<EventCategory, string> = {
  catering: '#c4a35a',
  verhuur: '#86efac',
  verkoop: '#93c5fd',
  overig: '#94a3b8',
};
