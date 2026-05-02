'use client';

import React from 'react';
import HBarList from '@/components/charts/HBarList';

/**
 * Per-prompt mini-chart — geeft visuele context bij het AI-antwoord.
 * Inhoud is hier client-side gemockt; later kan een prompt-specifieke API
 * de cijfers leveren.
 */

const Wrap = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div
    style={{
      padding: '14px 16px',
      marginBottom: 16,
      background: 'rgba(255,255,255,.02)',
      border: '1px solid var(--border)',
      borderRadius: 10,
    }}
  >
    <div
      style={{
        fontSize: 10,
        letterSpacing: '.18em',
        textTransform: 'uppercase',
        fontWeight: 700,
        color: 'var(--muted)',
        marginBottom: 10,
      }}
    >
      {title}
    </div>
    {children}
  </div>
);

const StatRow = ({ stats }: { stats: { label: string; value: string; sub?: string; color?: string }[] }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 12 }}>
    {stats.map((s, i) => (
      <div
        key={i}
        style={{
          padding: 10,
          borderRadius: 8,
          background: 'rgba(255,255,255,.02)',
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            fontSize: 9,
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            fontWeight: 600,
          }}
        >
          {s.label}
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: s.color || 'var(--text)',
            marginTop: 4,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {s.value}
        </div>
        {s.sub && (
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{s.sub}</div>
        )}
      </div>
    ))}
  </div>
);

const Donut = ({ pct, label, sub, color }: { pct: number; label: string; sub?: string; color: string }) => {
  const r = 32;
  const c = 2 * Math.PI * r;
  const off = c - (c * pct) / 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={80} height={80}>
        <circle cx={40} cy={40} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={8} />
        <circle
          cx={40}
          cy={40}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          transform="rotate(-90 40 40)"
        />
        <text x={40} y={45} textAnchor="middle" fill="var(--text)" fontSize={15} fontWeight={700}>
          {pct}%
        </text>
      </svg>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
};

interface Props {
  promptId: string;
}

export default function PromptChart({ promptId }: Props): React.ReactElement | null {
  switch (promptId) {
    case 'qp-1':
      return (
        <Wrap title="Top 5 ingrediënten · volgende catering">
          <HBarList
            valueFormatter={(v) => v.toString()}
            rows={[
              { label: 'Pulled pork (bbq-rub)', value: 8.5, detail: '8,5 kg', color: '#fbbf24' },
              { label: 'Brisket', value: 6.2, detail: '6,2 kg', color: '#fbbf24' },
              { label: 'BBQ saus (huisrecept)', value: 4.0, detail: '4,0 L', color: '#86efac' },
              { label: 'Coleslaw kool', value: 5.5, detail: '5,5 kg', color: '#86efac' },
              { label: 'Mais (vers)', value: 44, detail: '44 stuks', color: '#86efac' },
            ]}
          />
        </Wrap>
      );
    case 'qp-2':
      return (
        <Wrap title="Vrije vriescapaciteit">
          <Donut pct={62} label="62% vrij" sub="≈ 18 kg ruimte · prima voor 2 sauzen + 1 pulled-pork batch" color="#60a5fa" />
        </Wrap>
      );
    case 'qp-3':
      return (
        <Wrap title="Voorwerk deze week">
          <StatRow
            stats={[
              { label: 'TAKEN', value: '7', sub: '3 vandaag' },
              { label: 'TIJD', value: '4u 30m', sub: 'totaal' },
              { label: 'DEADLINE', value: 'do 17:00', color: '#fbbf24', sub: 'rubs droog' },
            ]}
          />
        </Wrap>
      );
    case 'qp-4':
      return (
        <Wrap title="Aandacht — voorraad">
          <HBarList
            valueFormatter={() => ''}
            rows={[
              { label: 'Pulled pork (-3 dagen)', value: 12, detail: 'kritiek', color: '#fb7185' },
              { label: 'Brisket (-5 dagen)', value: 25, detail: 'kritiek', color: '#fb7185' },
              { label: 'BBQ saus (-10 dagen)', value: 45, detail: 'check', color: '#fbbf24' },
              { label: 'Coleslaw kool (-12 dagen)', value: 60, detail: 'check', color: '#fbbf24' },
            ]}
          />
        </Wrap>
      );
    case 'qp-5':
      return (
        <Wrap title="Marge deze maand">
          <Donut pct={64} label="64,2% bruto marge" sub="+4,2% boven doel · €5.408 winst" color="#86efac" />
        </Wrap>
      );
    case 'qp-6':
      return (
        <Wrap title="Bestelvoorstel — top 3 leveranciers">
          <HBarList
            valueFormatter={(v) => `€${v}`}
            rows={[
              { label: 'Sligro (Brisket, rubs)', value: 184, color: 'var(--brand)' },
              { label: 'Hanos (Sauzen, kruiden)', value: 92, color: 'var(--brand)' },
              { label: 'Boer Bert (Vlees, vers)', value: 248, color: 'var(--brand)' },
            ]}
          />
        </Wrap>
      );
    case 'qp-7':
      return (
        <Wrap title="Open facturen">
          <StatRow
            stats={[
              { label: 'TOTAAL', value: '€16.888', sub: '13 stuks' },
              { label: 'OVERDUE', value: '2', color: '#fb7185', sub: '> 30 dagen' },
              { label: 'TE CHASEN', value: '5', color: '#fbbf24', sub: 'vandaag' },
            ]}
          />
        </Wrap>
      );
    case 'qp-8':
      return (
        <Wrap title="Briefing voor morgen">
          <StatRow
            stats={[
              { label: 'EVENTS', value: '0', sub: 'rustdag' },
              { label: 'PREP', value: '2 taken', sub: 'rubs + saus' },
              { label: 'WEER', value: '—', sub: 'KNMI volgt' },
            ]}
          />
        </Wrap>
      );
    default:
      return null;
  }
}
