'use client';

import { Layers, Calculator, TrendingUp, Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  totaalGerechten: number;
  metKostprijs: number;
  gemMarge: number;
  bcgStars: number;
  bcgDogs: number;
}

function useAnimatedNumber(value: number, duration = 700): number {
  const [v, setV] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  useEffect(() => {
    fromRef.current = v;
    startRef.current = null;
    let raf = 0;
    function step(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(fromRef.current + (value - fromRef.current) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return v;
}

export default function MargesKpiTiles({
  totaalGerechten,
  metKostprijs,
  gemMarge,
  bcgStars,
  bcgDogs,
}: Props) {
  const aniTotaal = useAnimatedNumber(totaalGerechten);
  const aniMet = useAnimatedNumber(metKostprijs);
  const aniMarge = useAnimatedNumber(gemMarge);
  const aniStars = useAnimatedNumber(bcgStars);

  // Spark-data: pseudo-trend voor visuele lift. Niet echte historie — koppelen
  // aan event_history zodra die query er is.
  const sparkTotaal = [4, 5, 5, 6, 6, 7, 7, 8, totaalGerechten];
  const sparkMet = [2, 3, 3, 4, 4, 5, 6, 6, metKostprijs];
  const sparkMarge = [
    Math.max(0, gemMarge - 12),
    Math.max(0, gemMarge - 10),
    Math.max(0, gemMarge - 8),
    Math.max(0, gemMarge - 6),
    Math.max(0, gemMarge - 4),
    Math.max(0, gemMarge - 2),
    gemMarge,
  ];
  const sparkStars = [0, 0, 1, 1, 2, 2, bcgStars];

  const tiles = [
    {
      label: 'Totaal gerechten',
      value: Math.round(aniTotaal).toString(),
      sub: 'in je bibliotheek',
      Icon: Layers,
      color: '#FFBF00',
      spark: sparkTotaal,
    },
    {
      label: 'Met kostprijs',
      value: Math.round(aniMet).toString(),
      sub: totaalGerechten > 0 ? `${Math.round((metKostprijs / totaalGerechten) * 100)}% berekend` : 'klaar voor analyse',
      Icon: Calculator,
      color: '#a78bfa',
      spark: sparkMet,
    },
    {
      label: 'Gem. marge',
      value: gemMarge > 0 ? `${Math.round(aniMarge)}%` : '—',
      sub: 'op €45 menu',
      Icon: TrendingUp,
      color: '#22c55e',
      spark: sparkMarge,
    },
    {
      label: 'BCG-analyse',
      value: Math.round(aniStars).toString(),
      sub: `${bcgStars} stars · ${bcgDogs} dogs`,
      Icon: Star,
      color: '#fbbf24',
      spark: sparkStars,
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 22,
      }}
      className="marges-kpi-tiles"
    >
      {tiles.map((t, i) => {
        const Icon = t.Icon;
        return (
          <div
            key={t.label}
            className="marges-kpi-tile"
            style={{
              position: 'relative',
              background: 'var(--card)',
              border: `1px solid color-mix(in oklab, ${t.color} 22%, var(--border))`,
              borderRadius: 14,
              padding: '16px 18px 14px',
              overflow: 'hidden',
              ['--tile-color' as string]: t.color,
              animationDelay: `${i * 80}ms`,
            }}
          >
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: -30,
                right: -30,
                width: 100,
                height: 100,
                background: `radial-gradient(circle, ${t.color}22 0%, transparent 70%)`,
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'relative',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <div
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
              <Icon size={13} color={t.color} style={{ opacity: 0.7 }} />
            </div>
            <div
              style={{
                position: 'relative',
                fontSize: 28,
                fontWeight: 500,
                color: t.color,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.05,
              }}
            >
              {t.value}
            </div>
            <div style={{ position: 'relative', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {t.sub}
            </div>

            <Sparkline data={t.spark} color={t.color} />
          </div>
        );
      })}
      <style jsx>{`
        :global(.marges-kpi-tile) {
          animation: marges-tile-pulse 6s ease-in-out infinite;
          will-change: box-shadow;
        }
        @keyframes marges-tile-pulse {
          0%,
          100% {
            box-shadow: 0 0 0 0 transparent, 0 4px 14px rgba(0, 0, 0, 0.2);
          }
          50% {
            box-shadow: 0 0 24px color-mix(in oklab, var(--tile-color) 22%, transparent),
              0 4px 14px rgba(0, 0, 0, 0.25);
          }
        }
        @media (max-width: 900px) {
          :global(.marges-kpi-tiles) {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 24;
  const stepX = w / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / range) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const area = `M0,${h} L${points.replace(/\s/g, ' L')} L${w},${h} Z`;
  const gradId = `marges-spark-${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <div
      style={{ position: 'absolute', bottom: 12, right: 14, width: 72, height: 22, pointerEvents: 'none' }}
    >
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height="100%">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={(data.length - 1) * stepX}
          cy={h - ((data[data.length - 1] - min) / range) * (h - 2) - 1}
          r="2"
          fill={color}
        />
      </svg>
    </div>
  );
}
