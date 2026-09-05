'use client';

import type { ReactNode } from 'react';

/**
 * Panel — de ene kaart van het pagina-chassis.
 *
 * Er stonden `MetallicCard`, de kale `.panel`-klasse en tientallen handgemaakte
 * varianten naast elkaar. Dit is de enige kaart, met vier verschijningsvormen:
 * statisch, klikbaar, met media en met een statusbadge in de kop. De styling
 * komt uit de bestaande `.panel`-klasse in globals.css — geen nieuwe kleuren.
 *
 * Klikbaar hoort een echte link te zijn: wikkel de Panel in een `<a>`/`<Link>`
 * en zet `interactive`. Dan werkt ⌘-klik en kom je er met het toetsenbord.
 */

interface PanelProps {
  /** Kop van de kaart. Weglaten voor een kaart die met media begint. */
  title?: string;
  /** Rechts in de kop: statusbadge, chevron, of een kleine actie. */
  actions?: ReactNode;
  /** Hover-lift en cursor. Zet dit alleen als de kaart echt ergens heen gaat. */
  interactive?: boolean;
  /**
   * Binnenruimte om de inhoud. Zet op `false` voor een kaart die begint met een
   * foto over de volle breedte; die regelt zijn eigen padding.
   */
  padded?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}

export default function Panel({
  title,
  actions,
  interactive = false,
  padded = true,
  className,
  style,
  children,
}: PanelProps) {
  const klassen = ['panel', interactive ? 'panel-interactive' : '', className || '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={klassen} style={style}>
      {(title || actions) && (
        <div className="panel-head">
          {title && (
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                fontSize: 15,
                letterSpacing: '-.005em',
                margin: 0,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </h3>
          )}
          {actions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {actions}
            </div>
          )}
        </div>
      )}
      <div style={padded ? { padding: title || actions ? '0 20px 18px' : '18px 20px' } : undefined}>
        {children}
      </div>
    </div>
  );
}

/**
 * Ladende inhoud voor in een Panel — drie balken, geen spinner. Een spinner
 * zegt "er gebeurt iets", balken zeggen "hier komt tekst te staan".
 */
export function PanelSkeleton({ regels = 3 }: { regels?: number }) {
  const breedtes = ['70%', '50%', '80%', '60%', '45%'];
  return (
    <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: regels }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 12,
            width: breedtes[i % breedtes.length],
            borderRadius: 4,
            background: `rgba(255,255,255,${i === 0 ? 0.06 : 0.05})`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Foutinhoud voor in een Panel: wat er mis is, waarom, en een weg terug.
 * Nooit alleen "er ging iets mis".
 */
export function PanelError({
  titel,
  uitleg,
  onOpnieuw,
}: {
  titel: string;
  uitleg?: string;
  onOpnieuw?: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span
        aria-hidden="true"
        style={{ color: 'var(--status-danger-text)', flexShrink: 0, marginTop: 1, lineHeight: 1 }}
      >
        ⚠
      </span>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>
        <div style={{ fontWeight: 600 }}>{titel}</div>
        {uitleg && <div style={{ color: 'var(--muted)' }}>{uitleg}</div>}
        {onOpnieuw && (
          <button
            type="button"
            onClick={onOpnieuw}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--brand)',
              font: '600 12px var(--font-sans)',
              cursor: 'pointer',
              padding: 0,
              marginTop: 6,
              minHeight: 24,
            }}
          >
            Opnieuw proberen
          </button>
        )}
      </div>
    </div>
  );
}
