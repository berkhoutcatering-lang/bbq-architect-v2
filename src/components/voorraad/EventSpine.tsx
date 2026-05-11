/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { AlertTriangle, Calendar, ChevronRight, Package, X } from 'lucide-react';

/**
 * EventSpine
 * ──────────
 * De rode draad door Voorraad / Inkoop / Leveranciers: laat zien hoeveel events
 * de komende N dagen op de planning staan, hoeveel kg vlees/voorraad ze vragen,
 * en hoeveel items er een tekort hebben. Klik = popover met details.
 *
 * Pillar #1 — Event-aware voorraad: dit is de afzonderlijke feature waarmee we
 * Apicbase/MarketMan/Caterease verslaan, want zij denken per-item (restaurant
 * mindset), wij per-event-window (catering realiteit).
 *
 * Data uit /api/voorraad/demand — RLS via createServerSupabase, geen client-side
 * tenant-check nodig (cookie session bepaalt org).
 */

interface DemandEvent {
  event_id: number;
  event_name: string;
  event_date: string;
  guests: number;
  qty: number;
}

interface DemandRow {
  id: number;
  naam: string;
  unit: string;
  current_stock: number;
  reserved_qty: number;
  shortfall: number;
  events: DemandEvent[];
}

interface DemandSummary {
  rows: DemandRow[];
  events_in_window: Array<{ id: number; name: string; date: string; guests: number; status: string }>;
  totals: {
    items_with_demand: number;
    items_with_shortfall: number;
    total_reserved_value_kg: number;
    window_days: number;
  };
}

function fmtKg(n: number, unit: string): string {
  const v = Number(n) || 0;
  if (v >= 100) return `${Math.round(v)}${unit}`;
  if (v >= 10) return `${v.toFixed(1)}${unit}`;
  return `${v.toFixed(2)}${unit}`;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', weekday: 'short' });
}

export default function EventSpine({ windowDays = 14 }: { windowDays?: number }) {
  const [summary, setSummary] = useState<DemandSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const fetchDemand = useCallback(async function () {
    try {
      const res = await fetch(`/api/voorraad/demand?window=${windowDays}`, { credentials: 'include' });
      if (!res.ok) {
        setSummary(null);
        return;
      }
      const json = await res.json();
      setSummary(json);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(function () { fetchDemand(); }, [fetchDemand]);

  // Close popover op click-outside
  useEffect(function () {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current && !popoverRef.current.contains(t)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return function () {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  if (loading) {
    return (
      <div className="event-spine event-spine--loading" aria-busy="true">
        <span style={{ opacity: 0.5 }}>Event-context laden…</span>
      </div>
    );
  }

  if (!summary || summary.events_in_window.length === 0) {
    return (
      <div className="event-spine event-spine--empty">
        <Calendar size={14} aria-hidden />
        <span>Geen bevestigde events komende {windowDays} dagen — voorraad rust.</span>
        <Link href="/agenda" className="event-spine__cta">
          plan event <ChevronRight size={12} aria-hidden />
        </Link>
      </div>
    );
  }

  const t = summary.totals;
  const tone = t.items_with_shortfall > 0 ? 'danger' : t.items_with_demand > 0 ? 'warning' : 'brand';

  return (
    <div className={`event-spine event-spine--${tone}`} style={{ position: 'relative' }}>
      <button
        type="button"
        className="event-spine__btn"
        onClick={function () { setOpen(function (o) { return !o; }); }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open voorraad-impact detail"
      >
        <Calendar size={14} aria-hidden />
        <strong style={{ fontWeight: 600 }}>{summary.events_in_window.length} events</strong>
        <span style={{ opacity: 0.8 }}>komende {windowDays}d</span>
        <span className="event-spine__divider" aria-hidden>·</span>
        <Package size={14} aria-hidden />
        <strong>{fmtKg(t.total_reserved_value_kg, 'kg')}</strong>
        <span style={{ opacity: 0.8 }}>nodig</span>
        {t.items_with_shortfall > 0 && (
          <>
            <span className="event-spine__divider" aria-hidden>·</span>
            <AlertTriangle size={14} aria-hidden />
            <strong style={{ color: 'var(--red)' }}>{t.items_with_shortfall} tekort</strong>
          </>
        )}
        <ChevronRight size={14} aria-hidden style={{ marginLeft: 4, transform: open ? 'rotate(90deg)' : '', transition: 'transform .15s' }} />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Voorraad-impact per event"
          className="event-spine__popover"
        >
          <header className="event-spine__popover-header">
            <h3>Voorraad-impact komende {windowDays} dagen</h3>
            <button type="button" onClick={function () { setOpen(false); }} aria-label="Sluiten">
              <X size={14} />
            </button>
          </header>

          <section className="event-spine__section">
            <h4>Events</h4>
            <ul className="event-spine__list">
              {summary.events_in_window.map(function (e) {
                return (
                  <li key={e.id}>
                    <Link href={`/events/${e.id}/hub`} onClick={function () { setOpen(false); }}>
                      <span>{e.name}</span>
                      <span className="event-spine__meta">{fmtDate(e.date)} · {e.guests} gasten</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          {summary.rows.filter(function (r) { return r.shortfall > 0; }).length > 0 && (
            <section className="event-spine__section">
              <h4 style={{ color: 'var(--red)' }}>Tekorten</h4>
              <ul className="event-spine__list">
                {summary.rows
                  .filter(function (r) { return r.shortfall > 0; })
                  .slice(0, 8)
                  .map(function (r) {
                    return (
                      <li key={r.id}>
                        <span>{r.naam}</span>
                        <span className="event-spine__meta">
                          <strong style={{ color: 'var(--red)' }}>{fmtKg(r.shortfall, r.unit)}</strong>
                          {' '}tekort · nodig {fmtKg(r.reserved_qty, r.unit)} · stock {fmtKg(r.current_stock, r.unit)}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </section>
          )}

          {summary.rows.filter(function (r) { return r.shortfall === 0 && r.reserved_qty > 0; }).length > 0 && (
            <section className="event-spine__section">
              <h4>Gereserveerd uit voorraad</h4>
              <ul className="event-spine__list">
                {summary.rows
                  .filter(function (r) { return r.shortfall === 0 && r.reserved_qty > 0; })
                  .slice(0, 6)
                  .map(function (r) {
                    return (
                      <li key={r.id}>
                        <span>{r.naam}</span>
                        <span className="event-spine__meta">
                          {fmtKg(r.reserved_qty, r.unit)} van {fmtKg(r.current_stock, r.unit)} · {r.events.length} event{r.events.length === 1 ? '' : 's'}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </section>
          )}

          <footer className="event-spine__footer">
            <Link href="/inkoop" onClick={function () { setOpen(false); }} className="btn-primary">
              Naar bestelvoorstel <ChevronRight size={12} />
            </Link>
          </footer>
        </div>
      )}
    </div>
  );
}
