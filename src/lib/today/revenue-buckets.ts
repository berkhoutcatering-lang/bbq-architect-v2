/**
 * Datum-bucketing voor Vandaag-cijfers.
 *
 * Alle helpers nemen een rauwe events-array en geven een dag-/week-/maand-bucket
 * met euro-waarden. Een event telt mee als (guests * ppp). geannuleerde events
 * worden gefilterd. Tijdzone = Europe/Amsterdam (default JS Date toLocaleString).
 */

import { localDayKey, localMonthKey } from './date-keys';

interface EventForRevenue {
  date?: string | null;
  guests?: number | null;
  ppp?: number | null;
  status?: string | null;
}

const MONTHS_NL_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function eventValue(e: EventForRevenue): number {
  if (e.status === 'geannuleerd' || e.status === 'cancelled') return 0;
  return (e.guests || 0) * (e.ppp || 0);
}

/** 7 buckets, 1 per dag, eindigend bij vandaag (inclusief). */
export function compute7DayRevenue(events: EventForRevenue[]): number[] {
  return computeDailyRevenue(events, 7);
}

/** 14 dagen — voor wekelijkse trend op Vandaag-pagina. */
export function compute14DayRevenue(events: EventForRevenue[]): number[] {
  return computeDailyRevenue(events, 14);
}

function computeDailyRevenue(events: EventForRevenue[], days: number): number[] {
  const buckets = new Array<number>(days).fill(0);
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    const iso = localDayKey(d);
    for (const e of events) {
      if (e.date === iso) buckets[i] += eventValue(e);
    }
  }
  return buckets;
}

export interface RevenueMonthBucket {
  m: string;
  value: number;
  current?: boolean;
}

/** 6 maanden — laatste maand krijgt `current: true`. */
export function compute6MonthRevenue(events: EventForRevenue[]): RevenueMonthBucket[] {
  const out: RevenueMonthBucket[] = [];
  const now = new Date();
  for (let offset = 5; offset >= 0; offset--) {
    const ref = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const yyyymm = localMonthKey(ref);
    let total = 0;
    for (const e of events) {
      if (e.date && e.date.startsWith(yyyymm)) total += eventValue(e);
    }
    out.push({
      m: MONTHS_NL_SHORT[ref.getMonth()],
      value: total,
      current: offset === 0,
    });
  }
  return out;
}
