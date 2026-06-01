/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { ShoppingCart, Package, AlertCircle, ChevronRight, Sparkles, Loader2, X } from 'lucide-react';
import Link from 'next/link';

/**
 * BestelvoorstelLaan
 * ──────────────────
 * Toont per leverancier wat er besteld moet worden voor events komende 14 dagen.
 * Pillar #1 (event-aware) + #2 (BBQ-yields ingebakken).
 * AI-uitleg-knop opent een Sonnet-call voor "waarom dit voorstel" — niet voor de math.
 */

interface BVEvent {
  event_id: number;
  event_name: string;
  event_date: string;
  qty: number;
}

interface BVItem {
  inventory_id: number;
  naam: string;
  qty: number;
  unit: string;
  unit_price_eur: number | null;
  est_total_eur: number;
  last_price_at: string | null;
  events_count: number;
  events: BVEvent[];
}

interface BVSupplier {
  leverancier_id: number | null;
  leverancier_naam: string;
  leverancier_type: string;
  items: BVItem[];
  subtotal_eur: number;
}

interface BVSummary {
  per_leverancier: BVSupplier[];
  totals: {
    items_total: number;
    leveranciers_count: number;
    estimated_total_eur: number;
    window_days: number;
  };
  has_unknown_supplier: boolean;
}

function fmtEur(n: number): string {
  return n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
}

function fmtQty(n: number, unit: string): string {
  const v = Number(n) || 0;
  if (v >= 100) return `${Math.round(v)} ${unit}`;
  if (v >= 10) return `${v.toFixed(1)} ${unit}`;
  return `${v.toFixed(2)} ${unit}`;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export default function BestelvoorstelLaan() {
  const [data, setData] = useState<BVSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const fetchVoorstel = useCallback(async function () {
    try {
      const r = await fetch('/api/voorraad/bestelvoorstel?window=14', { credentials: 'include' });
      if (!r.ok) { setData(null); return; }
      setData(await r.json());
    } catch { setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(function () { fetchVoorstel(); }, [fetchVoorstel]);

  if (loading) {
    return (
      <div className="bv-laan bv-laan--loading">
        <Loader2 size={16} className="bv-laan__spin" aria-hidden />
        <span>Bestelvoorstel berekenen…</span>
      </div>
    );
  }

  if (!data || data.per_leverancier.length === 0) {
    return (
      <div className="bv-laan bv-laan--empty">
        <ShoppingCart size={16} aria-hidden />
        <div>
          <strong>Geen tekorten voor de komende 14 dagen.</strong>
          <p>Je voorraad dekt alle bevestigde events.</p>
        </div>
      </div>
    );
  }

  return (
    <section className="bv-laan" aria-label="Bestelvoorstel">
      <header className="bv-laan__header">
        <div>
          <h2>
            <ShoppingCart size={16} aria-hidden />
            Bestelvoorstel
          </h2>
          <p>
            {data.totals.items_total} item{data.totals.items_total === 1 ? '' : 's'} tekort ·
            {' '}{data.totals.leveranciers_count} leverancier{data.totals.leveranciers_count === 1 ? '' : 's'} ·
            {' '}geschat {fmtEur(data.totals.estimated_total_eur)} ·
            {' '}volgende {data.totals.window_days}d
          </p>
        </div>
        {data.has_unknown_supplier && (
          <span className="bv-laan__warn">
            <AlertCircle size={12} /> sommige items missen leverancier
          </span>
        )}
      </header>

      <div className="bv-laan__suppliers">
        {data.per_leverancier.map(function (sup) {
          const key = sup.leverancier_id != null ? String(sup.leverancier_id) : '__unknown';
          const isCollapsed = !!collapsed[key];
          return (
            <article key={key} className={'bv-supplier' + (sup.leverancier_id == null ? ' bv-supplier--unknown' : '')}>
              <button
                type="button"
                className="bv-supplier__header"
                onClick={function () {
                  setCollapsed(function (c) {
                    const next = { ...c };
                    next[key] = !c[key];
                    return next;
                  });
                }}
                aria-expanded={!isCollapsed}
              >
                <div>
                  <strong>{sup.leverancier_naam}</strong>
                  <span className="bv-supplier__type">{sup.leverancier_type}</span>
                </div>
                <div className="bv-supplier__meta">
                  <span>{sup.items.length} item{sup.items.length === 1 ? '' : 's'}</span>
                  <strong>{fmtEur(sup.subtotal_eur)}</strong>
                  <ChevronRight size={14} style={{ transform: isCollapsed ? '' : 'rotate(90deg)', transition: 'transform .15s' }} aria-hidden />
                </div>
              </button>

              {!isCollapsed && (
                <ul className="bv-supplier__items">
                  {sup.items.map(function (it) {
                    return (
                      <li key={it.inventory_id}>
                        <div className="bv-item__main">
                          <Package size={12} aria-hidden style={{ color: 'var(--muted)' }} />
                          <span className="bv-item__naam">{it.naam}</span>
                          <span className="bv-item__qty">{fmtQty(it.qty, it.unit)}</span>
                          {it.unit_price_eur != null
                            ? <span className="bv-item__price">{fmtEur(it.unit_price_eur)}/{it.unit}</span>
                            : <span className="bv-item__price bv-item__price--missing">prijs onbekend</span>}
                          <strong className="bv-item__total">{fmtEur(it.est_total_eur)}</strong>
                        </div>
                        {it.events.length > 0 && (
                          <div className="bv-item__events">
                            {it.events.slice(0, 3).map(function (e) {
                              return (
                                <Link key={e.event_id} href={`/events/${e.event_id}/hub`} className="bv-item__event-chip">
                                  {fmtDate(e.event_date)} · {fmtQty(e.qty, it.unit)}
                                </Link>
                              );
                            })}
                            {it.events.length > 3 && (
                              <span className="bv-item__event-more">+{it.events.length - 3} meer</span>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          );
        })}
      </div>

      <footer className="bv-laan__footer">
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>
          <Sparkles size={11} aria-hidden /> Math is deterministic · AI mag uitleg geven, niet rekenen
        </span>
      </footer>
    </section>
  );
}
