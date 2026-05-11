/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Car, TrendingUp, ArrowRight, Loader2 } from 'lucide-react';

/**
 * TransportBlock — cross-page tile op /financien
 * ─────────────────────────────────────────────
 * Toont zakelijke kilometeraftrek per jaar incl. top-events. Maakt
 * verborgen transport-kosten zichtbaar in de financiele view.
 *
 * Data uit /api/financien/transport. Klik door naar
 * /administratie/rittenregistratie voor detail.
 */

interface TransportData {
  year: number;
  tarief_per_km: number;
  totals: {
    ritten_count: number;
    totaal_km: number;
    aftrekbaar_eur: number;
    events_covered: number;
  };
  per_maand_eur: number[];
  per_maand_km: number[];
  top_events: Array<{
    event_id: number;
    event_name: string;
    event_date: string | null;
    km: number;
    bedrag_eur: number;
    ritten_count: number;
  }>;
}

function fmtEur(n: number): string {
  return Number(n).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
}

const MONTHS = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

export default function TransportBlock({ year }: { year?: number }) {
  const [data, setData] = useState<TransportData | null>(null);
  const [loading, setLoading] = useState(true);
  const targetYear = year || new Date().getFullYear();

  useEffect(function () {
    fetch(`/api/financien/transport?year=${targetYear}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(j => setData(j))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [targetYear]);

  if (loading) return <div style={{ padding: 20, color: 'var(--muted)', textAlign: 'center', fontSize: 13 }}><Loader2 className="bh-spin" /> Transport laden…</div>;
  if (!data || data.totals.ritten_count === 0) {
    return (
      <section className="transport-block">
        <header className="transport-block__header">
          <h2><Car size={16} /> Transport-kosten {targetYear}</h2>
        </header>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '8px 0' }}>
          Geen zakelijke ritten geregistreerd dit jaar.
        </p>
        <Link href="/administratie/rittenregistratie" className="transport-block__cta">
          Open rittenregistratie <ArrowRight size={12} />
        </Link>
      </section>
    );
  }

  const maxMaand = Math.max(...data.per_maand_eur, 1);

  return (
    <section className="transport-block">
      <header className="transport-block__header">
        <h2><Car size={16} /> Transport-kosten {data.year}</h2>
        <Link href="/administratie/rittenregistratie" className="transport-block__cta">
          Open rittenregistratie <ArrowRight size={12} />
        </Link>
      </header>

      <div className="transport-block__totals">
        <div>
          <span>Zakelijke km</span>
          <strong>{data.totals.totaal_km.toLocaleString('nl-NL')}</strong>
        </div>
        <div>
          <span>Aftrekbaar ({fmtEur(data.tarief_per_km)}/km)</span>
          <strong style={{ color: 'var(--green, #22c55e)' }}>{fmtEur(data.totals.aftrekbaar_eur)}</strong>
        </div>
        <div>
          <span>Ritten</span>
          <strong>{data.totals.ritten_count}</strong>
        </div>
        <div>
          <span>Events gedekt</span>
          <strong>{data.totals.events_covered}</strong>
        </div>
      </div>

      {/* Maand-bargraph */}
      <div className="transport-block__bars">
        {data.per_maand_eur.map((eur, i) => {
          const pct = maxMaand > 0 ? (eur / maxMaand) * 100 : 0;
          return (
            <div key={i} className="transport-block__bar" title={`${MONTHS[i]}: ${fmtEur(eur)} (${data.per_maand_km[i]} km)`}>
              <div
                className="transport-block__bar-fill"
                style={{ height: pct > 0 ? `${pct}%` : '2px', opacity: pct > 0 ? 1 : 0.15 }}
              />
              <span>{MONTHS[i]}</span>
            </div>
          );
        })}
      </div>

      {data.top_events.length > 0 && (
        <div className="transport-block__top-events">
          <h3>Top-events met meeste transport</h3>
          <ul>
            {data.top_events.slice(0, 5).map(e => (
              <li key={e.event_id}>
                <span>
                  <strong>{e.event_name}</strong>
                  {e.event_date && <span style={{ color: 'var(--muted)', marginLeft: 4 }}>({e.event_date})</span>}
                </span>
                <span style={{ display: 'inline-flex', gap: 10, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: 'var(--muted)' }}>{e.km} km</span>
                  <strong>{fmtEur(e.bedrag_eur)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p style={{ marginTop: 12, fontSize: 11, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <TrendingUp size={11} /> Aftrekbaar tarief uit Belastingdienst-bron (niet AI-derived).
      </p>
    </section>
  );
}
