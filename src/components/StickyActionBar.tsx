'use client';

import type { ReactNode } from 'react';

interface StickyActionBarProps {
  primary: ReactNode;
  secondary?: ReactNode;
  /** Optionele context-tekst links (bv. "OFF-2026-006 · Geaccepteerd") */
  hint?: ReactNode;
}

/**
 * Sticky bar onderaan formulier-pagina's. Voorkomt dat operator helemaal
 * naar onder moet scrollen om op te slaan. Op mobile staat de bar boven
 * de bottom-nav (52px offset). Op desktop hangt 'ie aan de onderkant van
 * het scherm.
 */
export default function StickyActionBar({ primary, secondary, hint }: StickyActionBarProps) {
  return (
    <div className="sticky-action-bar" role="region" aria-label="Acties">
      <div className="sticky-action-bar__inner">
        {hint && <div className="sticky-action-bar__hint">{hint}</div>}
        <div className="sticky-action-bar__buttons">
          {secondary}
          {primary}
        </div>
      </div>
    </div>
  );
}
