import { classifyEventType, CATEGORY_LABEL, CATEGORY_COLOR, type EventCategory } from './event-type-heuristic';
import { localMonthKey } from './date-keys';

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
 *
 * Zelfde afbakening als de KPI "Omzet deze maand" en de laatste balk van de
 * 6-maandengrafiek: alle events met een datum in deze maand, geannuleerde niet
 * meegeteld, ook de events die nog moeten plaatsvinden. Eerder telde deze
 * donut alleen het verleden, waardoor hij "geen omzet" meldde terwijl de KPI
 * ernaast een bedrag toonde. Lege buckets blijven staan met value 0 zodat de
 * donut consistent dezelfde 4 segmenten kent.
 */
export function computeRevenueMix(events: EventForMix[]): RevenueMixSlice[] {
  const yyyymm = localMonthKey(new Date());
  const totals: Record<EventCategory, number> = {
    particulier: 0, zakelijk: 0, festival: 0, overig: 0,
  };

  for (const e of events) {
    if (!e.date || !e.date.startsWith(yyyymm)) continue;
    if (e.status === 'geannuleerd' || e.status === 'cancelled') continue;
    const cat = classifyEventType(e);
    totals[cat] += (e.guests || 0) * (e.ppp || 0);
  }

  const order: EventCategory[] = ['particulier', 'zakelijk', 'festival', 'overig'];
  return order.map((cat) => ({
    id: cat,
    label: CATEGORY_LABEL[cat],
    value: Math.round(totals[cat]),
    color: CATEGORY_COLOR[cat],
  }));
}
