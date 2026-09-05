'use client';

import { Layers, Calculator, TrendingUp, Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatEurInt } from '@/lib/format';

interface Props {
  totaalGerechten: number;
  metKostprijs: number;
  gemMarge: number;
  bcgStars: number;
  bcgDogs: number;
  /** Gemiddelde verkoopprijs p.p. Nul of afwezig = nog niet te bepalen. */
  menuPrice?: number;
}

/**
 * Laat een getal optellen naar zijn eindwaarde.
 *
 * Begon op 0 en kwam alleen via requestAnimationFrame bij de echte waarde.
 * Loopt die animatie niet — een tabblad op de achtergrond knijpt rAF af, en
 * "beweging beperken" in het besturingssysteem hoort hem helemaal niet te
 * starten — dan bleef er 0 staan. Dat is geen ontbrekend getal maar een
 * verkeerd getal: de tegel zei "TOTAAL GERECHTEN 0" terwijl de regel eronder
 * "35% berekend" van diezelfde twintig gerechten meldde.
 *
 * Nu is de eindwaarde het startpunt en is de animatie puur versiering: valt
 * hij weg, dan staat het juiste getal er meteen.
 */
function useAnimatedNumber(value: number, duration = 700): number {
  const [v, setV] = useState(value);
  const vorigeRef = useRef(value);
  useEffect(() => {
    const van = vorigeRef.current;
    vorigeRef.current = value;
    if (van === value) { setV(value); return; }

    const beperkt = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (beperkt) { setV(value); return; }

    let raf = 0;
    let start: number | null = null;
    function step(ts: number) {
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(van + (value - van) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else setV(value);
    }
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); setV(value); };
  }, [value, duration]);
  return v;
}

export default function MargesKpiTiles({
  totaalGerechten,
  metKostprijs,
  gemMarge,
  bcgStars,
  bcgDogs,
  menuPrice = 0,
}: Props) {
  const aniTotaal = useAnimatedNumber(totaalGerechten);
  const aniMet = useAnimatedNumber(metKostprijs);
  const aniMarge = useAnimatedNumber(gemMarge);
  const aniStars = useAnimatedNumber(bcgStars);

  /* Hier stonden drie sparklines met verzonnen historie: een oplopend rijtje
     dat op de echte waarde eindigde, met in het commentaar "pseudo-trend voor
     visuele lift. Niet echte historie". Een lijn die stijging suggereert waar
     geen meting onder ligt, is erger dan geen lijn. Weg tot er echte historie
     is om op te halen. */

  // Marges = analyse-pagina. Alleen Gem. marge (de hero-metric) krijgt
  // de groene accent — andere tiles in neutrale kleur zodat je oog
  // direct naar wat ertoe doet wordt geleid.
  const NEUTRAL = 'var(--muted)';
  const ACCENT = '#22c55e';
  const tiles = [
    {
      label: 'Totaal gerechten',
      value: Math.round(aniTotaal).toString(),
      sub: 'in je bibliotheek',
      Icon: Layers,
      color: NEUTRAL,
      valueColor: 'var(--text)',
    },
    {
      label: 'Met kostprijs',
      value: Math.round(aniMet).toString(),
      sub: totaalGerechten > 0 ? `${Math.round((metKostprijs / totaalGerechten) * 100)}% berekend` : 'klaar voor analyse',
      Icon: Calculator,
      color: NEUTRAL,
      valueColor: 'var(--text)',
    },
    {
      label: 'Gem. marge',
      value: gemMarge > 0 ? `${Math.round(aniMarge)}%` : '—',
      /* Stond op een standaardwaarde van 38,50 als er geen prijs bekend was —
         een verzonnen bedrag waar de marge op zou zijn gerekend. */
      sub: menuPrice > 0 ? `op ${formatEurInt(menuPrice)} gemiddelde verkoopprijs` : 'nog geen verkoopprijs bekend',
      Icon: TrendingUp,
      color: ACCENT,
      valueColor: ACCENT,
    },
    {
      label: 'BCG-analyse',
      value: Math.round(aniStars).toString(),
      sub: `${bcgStars} ${bcgStars === 1 ? 'ster' : 'sterren'} · ${bcgDogs} ${bcgDogs === 1 ? 'hond' : 'honden'}`,
      Icon: Star,
      color: NEUTRAL,
      valueColor: 'var(--text)',
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
      {tiles.map((t) => {
        const Icon = t.Icon;
        const isAccent = t.color === ACCENT;
        return (
          <div
            key={t.label}
            className="marges-kpi-tile"
            style={{
              position: 'relative',
              background: 'var(--card)',
              border: isAccent
                ? `1px solid color-mix(in oklab, ${ACCENT} 28%, var(--border))`
                : '1px solid var(--border)',
              borderRadius: 14,
              padding: '16px 18px 14px',
              overflow: 'hidden',
            }}
          >
            {isAccent && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  top: -30,
                  right: -30,
                  width: 100,
                  height: 100,
                  background: `radial-gradient(circle, ${ACCENT}14 0%, transparent 70%)`,
                  pointerEvents: 'none',
                }}
              />
            )}
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
              <Icon size={13} color={isAccent ? ACCENT : 'var(--muted)'} style={{ opacity: 0.7 }} />
            </div>
            <div
              style={{
                position: 'relative',
                fontSize: 28,
                fontWeight: 500,
                color: t.valueColor,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.05,
              }}
            >
              {t.value}
            </div>
            <div style={{ position: 'relative', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {t.sub}
            </div>

          </div>
        );
      })}
      <style jsx>{`
        @media (max-width: 900px) {
          :global(.marges-kpi-tiles) {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}

