import { classifyEventType, CATEGORY_LABEL, CATEGORY_COLOR, type EventCategory } from './event-type-heuristic';

interface EventForMix {
  id: number | string;
  type?: string | null;
  menu_selectie?: unknown;
  date?: string | null;
  guests?: number | null;
  ppp?: number | null;
  status?: string | null;
}

export interface RevenueMixSlice {
  id: EventCategory;
  label: string;
  value: number;
  color: string;
}

/**
 * Verdeel huidige-maand omzet over 4 categorieën via heuristiek.
 * Geannuleerd of toekomstig (na vandaag) telt niet mee. Lege buckets blijven
 * staan met value 0 zodat de donut consistent dezelfde 4 segmenten kent.
 */
export function computeRevenueMix(events: EventForMix[]): RevenueMixSlice[] {
  const now = new Date();
  const yyyymm = now.toISOString().slice(0, 7);
  const today = now.toISOString().slice(0, 10);
  const totals: Record<EventCategory, number> = {
    catering: 0, verhuur: 0, verkoop: 0, overig: 0,
  };

  for (const e of events) {
    if (!e.date || !e.date.startsWith(yyyymm)) continue;
    if (e.date > today) continue;
    if (e.status === 'geannuleerd' || e.status === 'cancelled') continue;
    const cat = classifyEventType(e);
    totals[cat] += (e.guests || 0) * (e.ppp || 0);
  }

  const order: EventCategory[] = ['catering', 'verhuur', 'verkoop', 'overig'];
  return order.map((cat) => ({
    id: cat,
    label: CATEGORY_LABEL[cat],
    value: Math.round(totals[cat]),
    color: CATEGORY_COLOR[cat],
  }));
}
