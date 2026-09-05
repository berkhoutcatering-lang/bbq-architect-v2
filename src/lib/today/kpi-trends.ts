/**
 * Compute 7-dag-trends voor de KPIStrip-sparklines.
 *
 * Alle reeksen zijn `number[7]`, oplopend (oudste eerst, vandaag laatste).
 * Geen aparte timeseries-tabel — we tellen client-side uit events / facturen
 * / inventory via `created_at` of (voor events) `date`.
 */

import { localDayKeyAgo } from './date-keys';

interface EventForTrend {
  date?: string | null;
  guests?: number | null;
  ppp?: number | null;
  status?: string | null;
  created_at?: string | null;
}

interface FactuurForTrend {
  status?: string | null;
  vervaldatum?: string | null;
  items?: { qty?: number; aantal?: number; prijs?: number; price?: number }[] | null;
  created_at?: string | null;
}

interface OfferteForTrend {
  status?: string | null;
  created_at?: string | null;
  items?: { qty?: number; aantal?: number; prijs?: number; price?: number }[] | null;
  aantal_gasten?: number | null;
  basis_prijs_pp?: number | null;
}

interface InventoryForTrend {
  current_stock?: number | null;
  min_stock?: number | null;
  prijs_per_unit?: number | null;
  inkoop_prijs?: number | null;
  updated_at?: string | null;
}

const isoDay = localDayKeyAgo;

function emptySeries(): number[] {
  return [0, 0, 0, 0, 0, 0, 0];
}

/** Days-tot-volgend-event per dag terug — toont "kromme" naar de event. */
export function trendDaysToNext(events: EventForTrend[]): number[] {
  const out = emptySeries();
  for (let i = 0; i < 7; i++) {
    const ref = isoDay(6 - i);
    const future = events
      .filter((e) => e.date && e.date >= ref && e.status !== 'geannuleerd' && e.status !== 'cancelled')
      .sort((a, b) => (a.date! < b.date! ? -1 : 1));
    const next = future[0];
    if (!next?.date) continue;
    const diff = Math.max(0, Math.ceil(
      (new Date(next.date).getTime() - new Date(ref).getTime()) / 86400000,
    ));
    out[i] = diff;
  }
  return out;
}

/** Aantal events per dag in de laatste 7 dagen. */
export function trendEventsPerDay(events: EventForTrend[]): number[] {
  const out = emptySeries();
  for (let i = 0; i < 7; i++) {
    const ref = isoDay(6 - i);
    out[i] = events.filter((e) => e.date === ref && e.status !== 'geannuleerd').length;
  }
  return out;
}

/** Cumulatieve maand-omzet per dag — laatste 7 dagen. Stijgt monotoon. */
export function trendMonthRevenue(events: EventForTrend[]): number[] {
  const out = emptySeries();
  for (let i = 0; i < 7; i++) {
    const ref = isoDay(6 - i);
    const monthPrefix = ref.slice(0, 7);
    let total = 0;
    for (const e of events) {
      if (!e.date || !e.date.startsWith(monthPrefix)) continue;
      if (e.date > ref) continue;
      if (e.status === 'geannuleerd' || e.status === 'cancelled') continue;
      total += (e.guests || 0) * (e.ppp || 0);
    }
    out[i] = Math.round(total);
  }
  return out;
}

function calcLineTotal(items: { qty?: number; aantal?: number; prijs?: number; price?: number }[] | null | undefined): number {
  if (!items) return 0;
  return items.reduce((s, it) => s + (it.qty || it.aantal || 0) * (it.prijs || it.price || 0), 0);
}

/** Cumulatieve open pipeline-€ per dag. */
export function trendPipelineEuro(offertes: OfferteForTrend[]): number[] {
  const out = emptySeries();
  for (let i = 0; i < 7; i++) {
    const ref = isoDay(6 - i);
    let total = 0;
    for (const o of offertes) {
      if (!o.created_at || o.created_at.slice(0, 10) > ref) continue;
      if (o.status !== 'concept' && o.status !== 'verzonden') continue;
      const lineTotal = calcLineTotal(o.items);
      total += lineTotal || (o.aantal_gasten || 0) * (o.basis_prijs_pp || 0);
    }
    out[i] = Math.round(total);
  }
  return out;
}

/** Open factuur-€ per dag (cumulatief, alle niet-betaalde). */
export function trendOpenInvoices(facturen: FactuurForTrend[]): number[] {
  const out = emptySeries();
  for (let i = 0; i < 7; i++) {
    const ref = isoDay(6 - i);
    let total = 0;
    for (const f of facturen) {
      if (!f.created_at || f.created_at.slice(0, 10) > ref) continue;
      if (f.status === 'betaald' || f.status === 'geannuleerd') continue;
      total += calcLineTotal(f.items);
    }
    out[i] = Math.round(total);
  }
  return out;
}

/** Aantal items onder minimum per dag — inventory sequentially niet beschikbaar,
 *  dus huidige snapshot 7× herhaald (placeholder). */
export function trendStockLow(inventory: InventoryForTrend[]): number[] {
  const low = inventory.filter((i) => (i.current_stock || 0) < (i.min_stock || 0)).length;
  return new Array<number>(7).fill(low);
}

/** Voorraad-waarde per dag — huidige snapshot herhaald (placeholder). */
export function trendStockValue(inventory: InventoryForTrend[]): number[] {
  const total = inventory.reduce(
    (s, i) => s + (i.current_stock || 0) * (i.prijs_per_unit || i.inkoop_prijs || 0),
    0,
  );
  return new Array<number>(7).fill(Math.round(total));
}

/** Aantal bonnen `processed_at = null` per dag — placeholder als snapshot. */
export function trendUnbookedReceipts(unbookedCount: number): number[] {
  return new Array<number>(7).fill(unbookedCount);
}

/** Marge-gemiddelde per dag — voor niet-historische data: huidige waarde
 *  herhaald. */
export function trendMargin(currentPct: number): number[] {
  return new Array<number>(7).fill(Math.round(currentPct * 10) / 10);
}
