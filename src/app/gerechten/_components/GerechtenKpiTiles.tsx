'use client';

import Link from 'next/link';
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
  // APK v3 #32: bij allergen-dekking <80% surface een actionable CTA
  // (link naar gerechten zonder allergens) ipv passieve KPI-display.
  // HACCP-relevant: ontbrekende allergens = risico bij klant-allergie.
  const allergenenMissend = Math.max(0, totaalGerechten - allergenenGedekt);
  const allergenenDekkingPct = totaalGerechten > 0 ? (allergenenGedekt / totaalGerechten) * 100 : 0;
  const allergenenWarn = totaalGerechten > 0 && allergenenDekkingPct < 80;
  const allergenenSub = allergenenWarn
    ? `Vul aan voor ${allergenenMissend} gerecht${allergenenMissend === 1 ? '' : 'en'} →`
    : 'in receptuur gemerkt';

  const tiles = [
    {
      label: 'In de kaart',
      value: String(totaal),
      sub: `${conceptCount} concept${conceptCount === 1 ? '' : 'en'}`,
      Icon: Layers,
      tone: 'default' as const,
      href: null as string | null,
    },
    {
      label: 'Gem. verkoop',
      value: gemVerkoop > 0 ? '€ ' + gemVerkoop.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—',
      sub: 'per portie',
      Icon: Tag,
      tone: 'default' as const,
      href: null as string | null,
    },
    {
      label: 'Gem. brutomarge',
      value: gemMargePct > 0 ? `${Math.round(gemMargePct)}%` : '—',
      sub: 'op gerechten met prijs',
      Icon: TrendingUp,
      tone: 'green' as const,
      href: null as string | null,
    },
    {
      label: 'Allergenen-dekking',
      value: `${allergenenGedekt}/${totaalGerechten}`,
      sub: allergenenSub,
      Icon: ShieldAlert,
      tone: (allergenenWarn ? 'warn' : 'default') as 'default' | 'warn' | 'green',
      href: allergenenWarn ? '/gerechten?queue=allergens' : null,
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
          t.tone === 'green' ? 'var(--green)'
          : t.tone === 'warn' ? 'var(--amber, #f59e0b)'
          : 'var(--text)';
        const subColor = t.tone === 'warn' ? 'var(--amber, #f59e0b)' : 'var(--muted)';
        const iconColor = t.tone === 'warn' ? 'var(--amber, #f59e0b)' : 'var(--muted-light)';
        const tileBody = (
          <>
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
              <Icon size={13} color={iconColor} />
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
            <div style={{ fontSize: 11, color: subColor, marginTop: 4, fontWeight: t.tone === 'warn' ? 600 : 400 }}>{t.sub}</div>
          </>
        );
        const baseStyle = { background: 'var(--card)', padding: '18px 20px' };
        if (t.href) {
          return (
            <Link key={t.label} href={t.href} style={{ ...baseStyle, textDecoration: 'none', color: 'inherit', cursor: 'pointer', transition: 'background .12s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover, rgba(245,158,11,.05))'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--card)'; }}>
              {tileBody}
            </Link>
          );
        }
        return (
          <div key={t.label} style={baseStyle}>
            {tileBody}
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
