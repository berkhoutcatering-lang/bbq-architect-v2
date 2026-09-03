'use client';

import { useMemo } from 'react';
import { Route, Receipt, Fuel, UserRound } from 'lucide-react';
import type { Rit } from '@/types';
import { aggregeer, fmtKm, fmtEur, type Periode } from '@/lib/ritten-aggregaties';
import { tariefVoorJaar } from '@/lib/ritten-tarieven';
import { formatEur } from '@/lib/format';

interface Props {
  ritten: Rit[];
  periode: Periode;
  onPeriode: (p: Periode) => void;
}

const PERIODES: Periode[] = ['Week', 'Maand', 'Kwartaal', 'Jaar'];

export default function TotalenStrip({ ritten, periode, onPeriode }: Props) {
  const agg = useMemo(() => aggregeer(ritten), [ritten]);
  const niet = ritten.filter((r) => !r.zakelijk);
  const nietKm = niet.reduce((a, r) => a + (r.kilometers ?? r.km_eind - r.km_begin), 0);
  const tarief = tariefVoorJaar(new Date().getFullYear());

  const tiles = [
    { label: 'Totaal km', value: fmtKm(agg.totaalKm), sub: `${agg.count} ritten`, Icon: Route, tone: 'default' as const },
    {
      label: 'Fiscaal aftrekbaar',
      value: fmtKm(agg.aftrekKm),
      sub: `× ${formatEur(tarief)} = ${fmtEur(agg.aftrekEur)}`,
      Icon: Receipt,
      tone: 'ok' as const,
    },
    { label: 'Niet-aftrekbaar', value: fmtKm(nietKm), sub: 'privé + woon-werk', Icon: UserRound, tone: 'muted' as const },
    {
      label: 'Voertuigen actief',
      value: String(new Set(ritten.map((r) => r.voertuig_id)).size || 0),
      sub: 'gebruikt deze periode',
      Icon: Fuel,
      tone: 'default' as const,
    },
  ];

  return (
    <div className="metal" style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Route size={16} color="var(--brand)" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Rittenadministratie</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              Belastingdienst-conform · {formatEur(tarief)}/km vergoeding {new Date().getFullYear()}
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: 3,
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 8,
            border: '1px solid var(--border)',
          }}
          role="tablist"
          aria-label="Periode-filter"
        >
          {PERIODES.map((p) => (
            <button
              key={p}
              onClick={() => onPeriode(p)}
              role="tab"
              aria-selected={periode === p}
              style={{
                padding: '5px 11px',
                fontSize: 11,
                fontWeight: 600,
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                background: periode === p ? 'var(--brand)' : 'transparent',
                color: periode === p ? '#0a0a0c' : 'var(--muted)',
                fontFamily: 'inherit',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="ritten-tiles">
        {tiles.map((t, i) => {
          const Icon = t.Icon;
          return (
            <div
              key={i}
              style={{
                padding: '16px 18px',
                borderRight: i < tiles.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div className="eyebrow">{t.label}</div>
                <Icon size={13} color="var(--muted-light)" />
              </div>
              <div
                style={{
                  fontWeight: 500,
                  fontSize: 24,
                  color: t.tone === 'ok' ? 'var(--green)' : t.tone === 'muted' ? 'var(--muted)' : 'var(--text)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t.value}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t.sub}</div>
            </div>
          );
        })}
      </div>
      <style jsx>{`
        .ritten-tiles {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
        }
        @media (max-width: 800px) {
          .ritten-tiles {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}
