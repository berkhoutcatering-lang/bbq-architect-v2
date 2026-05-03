'use client';

import { Layers, Tag, TrendingUp, ShieldAlert } from 'lucide-react';

interface Props {
  totaal: number;
  conceptCount: number;
  gemVerkoop: number; // €
  gemMargePct: number; // 0-100
  allergenenGedekt: number; // # gerechten met allergenen ingevuld
  totaalGerechten: number; // noemer voor x/y
}

export default function GerechtenKpiTiles({
  totaal,
  conceptCount,
  gemVerkoop,
  gemMargePct,
  allergenenGedekt,
  totaalGerechten,
}: Props) {
  const tiles = [
    {
      label: 'In de kaart',
      value: String(totaal),
      sub: `${conceptCount} concept${conceptCount === 1 ? '' : 'en'}`,
      Icon: Layers,
      tone: 'default' as const,
    },
    {
      label: 'Gem. verkoop',
      value: gemVerkoop > 0 ? `€${gemVerkoop.toFixed(2)}` : '—',
      sub: 'per portie',
      Icon: Tag,
      tone: 'default' as const,
    },
    {
      label: 'Gem. brutomarge',
      value: gemMargePct > 0 ? `${Math.round(gemMargePct)}%` : '—',
      sub: 'over alle gangen',
      Icon: TrendingUp,
      tone: 'green' as const,
    },
    {
      label: 'Allergenen-dekking',
      value: `${allergenenGedekt}/${totaalGerechten}`,
      sub: 'in receptuur gemerkt',
      Icon: ShieldAlert,
      tone: 'gold' as const,
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 1,
        background: 'var(--border)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 22,
      }}
      className="kpi-tiles"
    >
      {tiles.map((t) => {
        const Icon = t.Icon;
        const valueColor =
          t.tone === 'green' ? 'var(--green)' : t.tone === 'gold' ? 'var(--brand)' : 'var(--text)';
        return (
          <div key={t.label} style={{ background: 'var(--card)', padding: '18px 20px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <div
                className="eyebrow"
                style={{
                  fontSize: 10,
                  letterSpacing: '.18em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  fontWeight: 700,
                }}
              >
                {t.label}
              </div>
              <Icon size={13} color="var(--muted-light)" />
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 500,
                color: valueColor,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.1,
              }}
            >
              {t.value}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t.sub}</div>
          </div>
        );
      })}
      <style jsx>{`
        @media (max-width: 900px) {
          :global(.kpi-tiles) {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}
