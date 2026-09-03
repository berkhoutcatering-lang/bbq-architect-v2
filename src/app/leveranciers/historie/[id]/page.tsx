/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Receipt, TrendingUp, TrendingDown, AlertCircle, Calendar, Loader2, Store } from 'lucide-react';
import { formatPercent } from '@/lib/format';

interface Lev {
  id: number;
  naam: string;
  type: string;
  contact: string | null;
  email: string | null;
  tel: string | null;
  factuur_cyclus: string | null;
  bon_invoer_methode: string | null;
  kwaliteit_score: number | null;
}
interface Bon {
  id: number;
  datum: string | null;
  totaal_bedrag: number;
  netto_bedrag: number | null;
  btw_laag_bedrag: number | null;
  btw_hoog_bedrag: number | null;
  rgs_code: string | null;
  rgs_category_label: string | null;
  status: string | null;
  locked_at: string | null;
}
interface Trend {
  inventory_id: number;
  naam: string;
  unit: string;
  first_price: number | null;
  last_price: number | null;
  pct_change: number;
  data_points: number;
  sparkline: number[];
}
interface Alert {
  id: number;
  inventory_id: number;
  inventory_naam: string | null;
  old_price: number;
  new_price: number;
  pct_change: number;
  total_marge_impact_eur: number;
  status: string;
  detected_at: string;
}

function fmtEur(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number(n).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 80, h = 20;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  const trend = values[values.length - 1] - values[0];
  const color = trend > 0 ? '#ef4444' : '#22c55e';
  return (
    <svg width={w} height={h} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

export default function LeverancierHistoriePage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lev, setLev] = useState<Lev | null>(null);
  const [bonnen, setBonnen] = useState<Bon[]>([]);
  const [totals, setTotals] = useState<{ bonnen_count: number; total_spend_eur: number; total_btw_9_eur: number; total_btw_21_eur: number } | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(function () {
    if (!id) return;
    fetch(`/api/leveranciers/${id}/historie`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error)))
      .then(j => {
        setLev(j.leverancier);
        setBonnen(j.bonnen || []);
        setTotals(j.totals || null);
        setTrends(j.ingredient_trends || []);
        setAlerts(j.marge_alerts || []);
      })
      .catch(e => setError(typeof e === 'string' ? e : 'Laden mislukt'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}><Loader2 className="bh-spin" /> Laden…</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>{error}</div>;
  if (!lev) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Leverancier niet gevonden</div>;

  return (
    <div style={{ padding: '24px var(--space-mobile-edge) 32px', maxWidth: 1280, margin: '0 auto' }}>
      <button
        type="button"
        onClick={() => router.back()}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 0, color: 'var(--muted)', cursor: 'pointer', fontSize: 12, marginBottom: 14 }}
      >
        <ArrowLeft size={14} /> Terug
      </button>

      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Outfit, DM Sans, sans-serif', fontWeight: 200, fontSize: 30, letterSpacing: '-.015em', margin: 0, marginBottom: 4 }}>
          {lev.naam}
        </h1>
        <div style={{ color: 'var(--muted)', fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <span><Store size={11} style={{ verticalAlign: 'middle' }} /> {lev.type}</span>
          {lev.factuur_cyclus && <span>Facturen: {lev.factuur_cyclus}</span>}
          {lev.bon_invoer_methode && <span>Bon-flow: {lev.bon_invoer_methode}</span>}
          {lev.kwaliteit_score != null && <span>Kwaliteit: {lev.kwaliteit_score}/10</span>}
        </div>
      </header>

      {totals && (
        <div className="bh-pakket__summary" style={{ marginBottom: 18 }}>
          <div><span>Aantal bonnen</span><strong>{totals.bonnen_count}</strong></div>
          <div><span>Totaal-spend</span><strong>{fmtEur(totals.total_spend_eur)}</strong></div>
          <div><span>BTW 9% totaal</span><strong>{fmtEur(totals.total_btw_9_eur)}</strong></div>
          <div><span>BTW 21% totaal</span><strong>{fmtEur(totals.total_btw_21_eur)}</strong></div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 18 }}>
        {/* Prijs-trends per ingredient */}
        <section className="bh-pakket__card" style={{ padding: 16 }}>
          <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
            <TrendingUp size={14} /> Prijs-trends ({trends.length} ingredienten)
          </h2>
          {trends.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nog geen prijs-momenten van deze leverancier vastgelegd.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 480, overflowY: 'auto' }}>
              {trends.map(function (t) {
                const up = t.pct_change > 0;
                return (
                  <li key={t.inventory_id} style={{ padding: '10px 12px', background: 'var(--card-solid)', border: '1px solid var(--border, rgba(255,255,255,.06))', borderRadius: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 12 }}>
                      <Link href={`/voorraad/historie/${t.inventory_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        <strong>{t.naam}</strong>
                        <span style={{ color: 'var(--muted)', marginLeft: 6 }}>({t.data_points} prijzen)</span>
                      </Link>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <Sparkline values={t.sparkline} />
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {fmtEur(t.first_price)} → <strong>{fmtEur(t.last_price)}</strong>
                          {Math.abs(t.pct_change) > 0.5 && (
                            <span style={{ marginLeft: 6, color: up ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                              {up ? '+' : ''}{formatPercent(t.pct_change)}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Bonnen */}
        <section className="bh-pakket__card" style={{ padding: 16 }}>
          <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
            <Receipt size={14} /> Bonnen ({bonnen.length})
          </h2>
          {bonnen.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nog geen bonnen ontvangen van deze leverancier.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 480, overflowY: 'auto' }}>
              {bonnen.map(function (b) {
                return (
                  <li key={b.id} style={{ padding: '8px 12px', background: 'var(--card-solid)', border: '1px solid var(--border, rgba(255,255,255,.06))', borderRadius: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 12 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Calendar size={11} style={{ color: 'var(--muted)' }} />
                        {fmtDate(b.datum)}
                        {b.rgs_code && <span style={{ color: 'var(--muted)', fontSize: 11 }}>· {b.rgs_category_label || b.rgs_code}</span>}
                      </span>
                      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtEur(b.totaal_bedrag)}</strong>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      Netto {fmtEur(b.netto_bedrag)} · BTW 9% {fmtEur(b.btw_laag_bedrag)} · BTW 21% {fmtEur(b.btw_hoog_bedrag)}
                      {b.locked_at && <span style={{ marginLeft: 8 }}>· vergrendeld</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Marge-alerts */}
        {alerts.length > 0 && (
          <section className="bh-pakket__card" style={{ padding: 16, gridColumn: '1 / -1' }}>
            <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
              <AlertCircle size={14} /> Marge-alerts ({alerts.length})
            </h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {alerts.map(function (a) {
                const up = a.pct_change > 0;
                return (
                  <li key={a.id} style={{ padding: '8px 12px', background: 'var(--card-solid)', border: '1px solid var(--border, rgba(255,255,255,.06))', borderRadius: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 12 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {up ? <TrendingUp size={12} style={{ color: 'var(--red)' }} /> : <TrendingDown size={12} style={{ color: 'var(--green)' }} />}
                        <strong>{a.inventory_naam || 'onbekend'}</strong>
                        <span style={{ color: up ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>{up ? '+' : ''}{formatPercent(a.pct_change)}</span>
                        <span style={{ color: 'var(--muted)' }}>({fmtEur(a.old_price)} → {fmtEur(a.new_price)})</span>
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}>{fmtDate(a.detected_at)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
