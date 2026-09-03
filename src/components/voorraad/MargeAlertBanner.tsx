/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AlertTriangle, TrendingUp, TrendingDown, X, ChevronRight, Check, EyeOff } from 'lucide-react';
import { formatPercent } from '@/lib/format';

/**
 * MargeAlertBanner
 * ────────────────
 * Sticky banner bovenaan /leveranciers (en optioneel /vandaag). Toont open
 * marge-alerts uit /api/voorraad/marge-alerts. Klik = expand met affected
 * offertes. Acknowledge / dismiss inline.
 *
 * Pillar #4 — De killer-feature. Stopt margelek op stale prijzen.
 */

interface AffectedOfferte {
  offerte_id: number;
  klant_naam: string;
  marge_delta_eur: number;
  datum: string;
}

interface Alert {
  id: number;
  inventory_id: number;
  leverancier_id: number | null;
  old_price: number;
  new_price: number;
  pct_change: number;
  affected_offertes: AffectedOfferte[];
  total_marge_impact_eur: number;
  status: string;
  detected_at: string;
  notes: string | null;
  inventory: { naam: string; unit: string; categorie?: string } | null;
  leverancier: { naam: string; type?: string } | null;
}

function fmtEur(n: number): string {
  const abs = Math.abs(n);
  return (n < 0 ? '-' : '') + abs.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export default function MargeAlertBanner() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);

  const fetchAlerts = useCallback(async function () {
    try {
      const r = await fetch('/api/voorraad/marge-alerts', { credentials: 'include' });
      if (!r.ok) { setAlerts([]); return; }
      const j = await r.json();
      setAlerts(j.alerts || []);
    } catch { setAlerts([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(function () { fetchAlerts(); }, [fetchAlerts]);

  async function triggerScan() {
    setScanning(true);
    try {
      await fetch('/api/voorraad/marge-alerts', { method: 'POST', credentials: 'include' });
      await fetchAlerts();
    } finally {
      setScanning(false);
    }
  }

  async function patchAlert(id: number, status: 'acknowledged' | 'dismissed') {
    await fetch('/api/voorraad/marge-alerts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id, status }),
    });
    setAlerts(function (cur) { return cur.filter(function (a) { return a.id !== id; }); });
  }

  if (loading || alerts.length === 0) {
    // Render in alerts-empty state alleen een subtiele scan-knop voor admins
    if (!loading && alerts.length === 0) {
      return (
        <div className="marge-banner marge-banner--empty">
          <Check size={14} aria-hidden />
          <span>Geen open marge-alerts.</span>
          <button
            type="button"
            className="marge-banner__scan"
            onClick={triggerScan}
            disabled={scanning}
            aria-label="Scan nu voor prijs-shifts"
          >
            {scanning ? 'scannen…' : 'scan nu'}
          </button>
        </div>
      );
    }
    return null;
  }

  return (
    <section className="marge-banner marge-banner--danger" aria-live="polite">
      <header className="marge-banner__header">
        <div className="marge-banner__title">
          <AlertTriangle size={16} aria-hidden />
          <strong>{alerts.length} marge-alert{alerts.length === 1 ? '' : 's'}</strong>
          <span style={{ color: 'var(--muted-light)' }}>prijs-shift {'>'}5% bij een leverancier</span>
        </div>
        <button
          type="button"
          className="marge-banner__scan"
          onClick={triggerScan}
          disabled={scanning}
        >
          {scanning ? 'scannen…' : 'opnieuw scannen'}
        </button>
      </header>

      <ul className="marge-banner__list">
        {alerts.map(function (a) {
          const up = a.pct_change > 0;
          const isOpen = expanded === a.id;
          return (
            <li key={a.id} className={'marge-alert' + (up ? ' marge-alert--up' : ' marge-alert--down')}>
              <button
                type="button"
                className="marge-alert__row"
                onClick={function () { setExpanded(function (cur) { return cur === a.id ? null : a.id; }); }}
                aria-expanded={isOpen}
              >
                <span className="marge-alert__icon">
                  {up ? <TrendingUp size={14} aria-hidden /> : <TrendingDown size={14} aria-hidden />}
                </span>
                <div className="marge-alert__main">
                  <strong>{a.inventory?.naam || `Item #${a.inventory_id}`}</strong>
                  {' '}<span style={{ color: 'var(--muted)' }}>·</span>{' '}
                  <span>{a.leverancier?.naam || 'leverancier onbekend'}</span>
                  {' '}<span style={{ color: 'var(--muted)' }}>·</span>{' '}
                  <span className={up ? 'marge-alert__pct--up' : 'marge-alert__pct--down'}>
                    {up ? '+' : ''}{formatPercent(a.pct_change)}
                  </span>
                </div>
                <div className="marge-alert__price">
                  <span style={{ color: 'var(--muted)' }}>{fmtEur(a.old_price)}</span>
                  {' → '}
                  <strong>{fmtEur(a.new_price)}</strong>
                  <span className="marge-alert__unit">/{a.inventory?.unit || 'kg'}</span>
                </div>
                <div className="marge-alert__impact">
                  <strong>{fmtEur(a.total_marge_impact_eur)}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                    {' '}· {a.affected_offertes.length} offerte{a.affected_offertes.length === 1 ? '' : 's'}
                  </span>
                </div>
                <ChevronRight size={14} aria-hidden style={{ transform: isOpen ? 'rotate(90deg)' : '', transition: 'transform .15s' }} />
              </button>

              {isOpen && (
                <div className="marge-alert__details">
                  {a.affected_offertes.length === 0 && (
                    <p style={{ color: 'var(--muted)', margin: '4px 0', fontSize: 12 }}>
                      Geen lopende offertes geraakt — alert is informatief.
                    </p>
                  )}
                  {a.affected_offertes.length > 0 && (
                    <ul className="marge-alert__offertes">
                      {a.affected_offertes.slice(0, 10).map(function (o) {
                        return (
                          <li key={o.offerte_id}>
                            <Link href={`/offertes`} onClick={function () { setExpanded(null); }}>
                              <span>{o.klant_naam}</span>
                              <span style={{ color: 'var(--muted)', fontSize: 11 }}>{fmtDate(o.datum)}</span>
                              <strong className={o.marge_delta_eur < 0 ? 'marge-alert__pct--down' : 'marge-alert__pct--up'}>
                                {fmtEur(o.marge_delta_eur)}
                              </strong>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="marge-alert__actions">
                    <button
                      type="button"
                      onClick={function () { patchAlert(a.id, 'acknowledged'); }}
                      className="btn-secondary"
                    >
                      <Check size={12} /> Gezien
                    </button>
                    <button
                      type="button"
                      onClick={function () { patchAlert(a.id, 'dismissed'); }}
                      className="btn-secondary"
                    >
                      <EyeOff size={12} /> Negeren
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
