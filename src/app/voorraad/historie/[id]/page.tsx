/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowDown, ArrowUp, Package, Receipt, TrendingDown, TrendingUp, AlertCircle, ShieldCheck, Loader2 } from 'lucide-react';
import { formatPercent } from '@/lib/format';

/**
 * Voorraad-item historie page — cross-page koppeling
 * ──────────────────────────────────────────────────
 * Audit-trail van één inventory-item: stock_movements + price_history +
 * marge_alerts. Beantwoordt vragen als "welke bon dronk dit stock?" en
 * "hoe heeft de prijs zich ontwikkeld?".
 */

interface Inv {
  id: number;
  naam: string;
  unit: string;
  current_stock: number;
  last_price_eur: number | null;
  last_price_at: string | null;
}
interface Movement {
  id: number;
  type: string;
  qty: number;
  resulting_stock: number | null;
  unit_price: number | null;
  bon_id: number | null;
  by_user: string | null;
  note: string | null;
  created_at: string;
  bon: { id: number; datum: string | null; totaal_bedrag: number; leverancier_naam: string | null } | null;
}
interface PriceRow {
  id: number;
  leverancier_id: number | null;
  datum: string;
  unit_price: number;
  unit: string;
  source: string;
  leverancier_naam: string | null;
}
interface AlertRow {
  id: number;
  leverancier_id: number | null;
  old_price: number;
  new_price: number;
  pct_change: number;
  total_marge_impact_eur: number;
  status: string;
  detected_at: string;
  leverancier_naam: string | null;
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
function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TYPE_META: Record<string, { icon: any; label: string; tone: string }> = {
  receive: { icon: ArrowDown, label: 'Ontvangst', tone: 'ok' },
  usage: { icon: ArrowUp, label: 'Verbruik', tone: 'warn' },
  waste: { icon: ArrowUp, label: 'Waste', tone: 'bad' },
  count: { icon: Package, label: 'Telling', tone: 'neutral' },
  adjust: { icon: Package, label: 'Correctie', tone: 'neutral' },
};

export default function InventoryHistoriePage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inv, setInv] = useState<Inv | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  useEffect(function () {
    if (!id) return;
    fetch(`/api/inventory/${id}/historie`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error)))
      .then(j => {
        setInv(j.inventory);
        setMovements(j.stock_movements || []);
        setPrices(j.price_history || []);
        setAlerts(j.marge_alerts || []);
      })
      .catch(e => setError(typeof e === 'string' ? e : 'Laden mislukt'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}><Loader2 className="bh-spin" /> Laden…</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>{error}</div>;
  if (!inv) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Item niet gevonden</div>;

  return (
    <div style={{ padding: '24px var(--space-mobile-edge) 32px', maxWidth: 1200, margin: '0 auto' }}>
      <button
        type="button"
        onClick={() => router.back()}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 0, color: 'var(--muted)', cursor: 'pointer', fontSize: 12, marginBottom: 14 }}
      >
        <ArrowLeft size={14} /> Terug
      </button>

      <header style={{ marginBottom: 20 }}>
        <h1 className="chassis-titel">{inv.naam}</h1>
        <div className="chassis-onderschrift">
          Huidige stock: <strong>{inv.current_stock} {inv.unit}</strong>
          {inv.last_price_eur != null && <> · laatste prijs <strong>{fmtEur(inv.last_price_eur)}</strong>/{inv.unit} ({fmtDate(inv.last_price_at)})</>}
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 18 }}>
        {/* Stock-movements */}
        <section className="bh-pakket__card" style={{ padding: 16 }}>
          <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
            <Receipt size={14} /> Voorraadmutaties ({movements.length})
          </h2>
          {movements.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nog geen mutaties geregistreerd.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 480, overflowY: 'auto' }}>
              {movements.map(function (m) {
                const meta = TYPE_META[m.type] || TYPE_META.count;
                const Icon = meta.icon;
                const isPositive = m.type === 'receive';
                return (
                  <li key={m.id} style={{ padding: '8px 10px', background: 'var(--card-solid)', border: '1px solid var(--border, rgba(255,255,255,.06))', borderRadius: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 12 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Icon size={12} style={{ color: meta.tone === 'ok' ? 'var(--green)' : meta.tone === 'bad' ? 'var(--red)' : meta.tone === 'warn' ? 'var(--amber)' : 'var(--muted)' }} />
                        <strong>{meta.label}</strong>
                        <span style={{ color: meta.tone === 'ok' ? 'var(--green)' : 'var(--red)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {isPositive ? '+' : '−'}{Math.abs(m.qty).toFixed(2)} {inv.unit}
                        </span>
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}>{fmtDateTime(m.created_at)}</span>
                    </div>
                    {m.bon && (
                      <div style={{ fontSize: 11, color: 'var(--muted-light)', marginTop: 4 }}>
                        Via bon{m.bon.leverancier_naam ? ` van ${m.bon.leverancier_naam}` : ''} — {fmtDate(m.bon.datum)} · {fmtEur(m.bon.totaal_bedrag)}
                      </div>
                    )}
                    {m.note && !m.bon && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{m.note}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Price history */}
        <section className="bh-pakket__card" style={{ padding: 16 }}>
          <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
            <TrendingUp size={14} /> Prijshistorie ({prices.length})
          </h2>
          {prices.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nog geen prijs-momenten vastgelegd. Scan een bon om de eerste te genereren.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 480, overflowY: 'auto' }}>
              {prices.map(function (p, idx) {
                const prev = prices[idx + 1];
                const pct = prev ? ((p.unit_price - prev.unit_price) / prev.unit_price) * 100 : null;
                const up = pct != null && pct > 0;
                return (
                  <li key={p.id} style={{ padding: '8px 10px', background: 'var(--card-solid)', border: '1px solid var(--border, rgba(255,255,255,.06))', borderRadius: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 12 }}>
                      <span>
                        <strong>{fmtEur(p.unit_price)}</strong>/{p.unit}
                        {pct != null && Math.abs(pct) > 0.5 && (
                          <span style={{ marginLeft: 6, color: up ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                            {up ? '+' : ''}{formatPercent(pct)}
                          </span>
                        )}
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}>{fmtDate(p.datum)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted-light)', marginTop: 4 }}>
                      {p.leverancier_naam || 'geen leverancier'} · via {p.source}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Marge alerts */}
        {alerts.length > 0 && (
          <section className="bh-pakket__card" style={{ padding: 16, gridColumn: '1 / -1' }}>
            <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
              <AlertCircle size={14} /> Marge-alerts voor dit item ({alerts.length})
            </h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {alerts.map(function (a) {
                const up = a.pct_change > 0;
                return (
                  <li key={a.id} style={{ padding: '8px 12px', background: 'var(--card-solid)', border: '1px solid var(--border, rgba(255,255,255,.06))', borderRadius: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 12 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {up ? <TrendingUp size={12} style={{ color: 'var(--red)' }} /> : <TrendingDown size={12} style={{ color: 'var(--green)' }} />}
                        <strong>{a.leverancier_naam || 'onbekend'}</strong>
                        <span style={{ color: up ? 'var(--red)' : 'var(--green)' }}>{up ? '+' : ''}{formatPercent(a.pct_change)}</span>
                        <span style={{ color: 'var(--muted)' }}>({fmtEur(a.old_price)} → {fmtEur(a.new_price)})</span>
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                        <span style={{ color: 'var(--muted)' }}>{fmtDate(a.detected_at)}</span>
                        <span className={'bh-status bh-status--' + (a.status === 'open' ? 'warn' : 'ok')}>{a.status}</span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12 }}>
              <Link href="/leveranciers" style={{ color: 'var(--gold, #c4a35a)' }}>Open marge-alert dashboard ↗</Link>
            </p>
          </section>
        )}
      </div>

      <p style={{ marginTop: 24, fontSize: 11, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <ShieldCheck size={11} /> Audit-trail — alle mutaties + prijzen blijven bewaard onder de 7-jaar fiscale bewaarplicht.
      </p>
    </div>
  );
}
