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

  const tiles = [
    {
      label: 'Concepten bedacht',
      value: Math.round(aniBedacht).toString(),
      sub: 'jouw geschiedenis',
      Icon: Brain,
      tone: 'purple' as const,
    },
    {
      label: 'Bewaard in /gerechten',
      value: Math.round(aniBewaard).toString(),
      sub: conceptenBedacht > 0 ? `${successRate}% succesratio` : 'klaar voor activeren',
      Icon: BookmarkCheck,
      tone: 'green' as const,
    },
    {
      label: 'Inspiraties gebruikt',
      value: Math.round(aniInspiraties).toString(),
      sub: 'unieke recepten als bron',
      Icon: GitBranch,
      tone: 'gold' as const,
    },
    {
      label: 'Gem. AI-confidence',
      value: gemConfidence > 0 ? `${Math.round(aniConfidence)}%` : '—',
      sub: gemConfidence > 0.85 ? 'sterk gegrond' : gemConfidence > 0.7 ? 'redelijk' : 'experimenteel',
      Icon: Zap,
      tone: 'default' as const,
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
      className="bedenker-kpi-tiles"
    >
      {tiles.map((t) => {
        const Icon = t.Icon;
        const valueColor =
          t.tone === 'green'
            ? 'var(--green)'
            : t.tone === 'gold'
            ? 'var(--brand)'
            : t.tone === 'purple'
            ? '#c4b5fd'
            : 'var(--text)';
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
          :global(.bedenker-kpi-tiles) {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}
