'use client';

import { Brain, BookmarkCheck, GitBranch, Zap } from 'lucide-react';
import { useAnimatedNumber } from './wow-hooks';

interface Props {
  conceptenBedacht: number;
  conceptenBewaard: number;
  inspiratiesUniek: number;
  gemConfidence: number; // 0-1
}

export default function BedenkerKpiTiles({
  conceptenBedacht,
  conceptenBewaard,
  inspiratiesUniek,
  gemConfidence,
}: Props) {
  const aniBedacht = useAnimatedNumber(conceptenBedacht, 700);
  const aniBewaard = useAnimatedNumber(conceptenBewaard, 700);
  const aniInspiraties = useAnimatedNumber(inspiratiesUniek, 700);
  const aniConfidence = useAnimatedNumber(gemConfidence * 100, 800);

  const successRate =
    conceptenBedacht > 0 ? Math.round((conceptenBewaard / conceptenBedacht) * 100) : 0;

  // Spark-data: pseudo-random uplift-curve voor visuele activity. Niet echte
  // historie — in v2 koppelen aan localStorage history-timeline.
  const sparkBedacht = [2, 4, 3, 5, 4, 7, 6, 9, 8];
  const sparkBewaard = [1, 1, 2, 1, 3, 2, 4, 3, 5];
  const sparkInspiraties = [3, 5, 4, 6, 8, 7, 9, 8, 10];
  const sparkConfidence = [0.62, 0.7, 0.74, 0.71, 0.78, 0.82, 0.85, 0.84, gemConfidence || 0.85];

  const tiles = [
    {
      label: 'Concepten bedacht',
      value: Math.round(aniBedacht).toString(),
      sub: 'jouw geschiedenis',
      Icon: Brain,
      color: '#a78bfa',
      spark: sparkBedacht,
    },
    {
      label: 'Bewaard in /gerechten',
      value: Math.round(aniBewaard).toString(),
      sub: conceptenBedacht > 0 ? `${successRate}% succesratio` : 'klaar voor activeren',
      Icon: BookmarkCheck,
      color: '#22c55e',
      spark: sparkBewaard,
    },
    {
      label: 'Inspiraties gebruikt',
      value: Math.round(aniInspiraties).toString(),
      sub: 'unieke recepten als bron',
      Icon: GitBranch,
      color: 'var(--brand)',
      spark: sparkInspiraties,
    },
    {
      label: 'Gem. AI-confidence',
      value: gemConfidence > 0 ? `${Math.round(aniConfidence)}%` : '—',
      sub: gemConfidence > 0.85 ? 'sterk gegrond' : gemConfidence > 0.7 ? 'redelijk' : 'experimenteel',
      Icon: Zap,
      color: '#fbbf24',
      spark: sparkConfidence,
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
      className="bedenker-kpi-tiles"
    >
      {tiles.map((t, i) => {
        const Icon = t.Icon;
        return (
          <div
            key={t.label}
            className="bedenker-kpi-tile"
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
            {/* Subtle glow corner */}
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

            {/* Sparkline */}
            <Sparkline data={t.spark} color={t.color} />
          </div>
        );
      })}
      <style jsx>{`
        :global(.bedenker-kpi-tile) {
          animation: bedenker-tile-pulse 6s ease-in-out infinite;
          will-change: box-shadow;
        }
        @keyframes bedenker-tile-pulse {
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
          :global(.bedenker-kpi-tiles) {
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

  return (
    <div style={{ position: 'absolute', bottom: 12, right: 14, width: 72, height: 22, pointerEvents: 'none' }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height="100%">
        <defs>
          <linearGradient id={`spark-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#spark-${color.replace(/[^a-z0-9]/gi, '')})`} />
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dot op laatste punt */}
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
