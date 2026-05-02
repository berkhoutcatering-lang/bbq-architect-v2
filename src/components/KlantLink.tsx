'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

interface Props {
  klantNaam: string | null | undefined;
  klantId?: number | string | null;
  /** Optioneel — render fallback wanneer er geen naam is. Default: "—" */
  fallback?: ReactNode;
  style?: CSSProperties;
  className?: string;
}

/**
 * KlantLink — klikbare klant-naam die naar de Klanten-pagina navigeert met
 * de klant gefilterd. Werkt overal waar een klant-naam wordt getoond
 * (events-card, offertes-list, facturen-list, factuur-lezer-archief).
 *
 * Gebruikt de bestaande ?zoek= query-string die /klanten ondersteunt
 * (zoals CommandPalette ook doet). Geen routing-breaking changes.
 */
export default function KlantLink({ klantNaam, klantId, fallback = '—', style, className }: Props) {
  if (!klantNaam) return <>{fallback}</>;

  const href = klantId ? `/klanten?id=${klantId}` : `/klanten?zoek=${encodeURIComponent(klantNaam)}`;

  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className={className}
      style={{
        color: 'inherit',
        textDecoration: 'none',
        borderBottom: '1px dashed color-mix(in srgb, var(--brand) 40%, transparent)',
        transition: 'color 120ms ease, border-color 120ms ease',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--brand)';
        e.currentTarget.style.borderBottomColor = 'var(--brand)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'inherit';
        e.currentTarget.style.borderBottomColor = 'color-mix(in srgb, var(--brand) 40%, transparent)';
      }}
    >
      {klantNaam}
    </Link>
  );
}
