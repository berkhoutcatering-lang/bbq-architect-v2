/* Inline SVG icons — minimal JS, no icon-library dependency.
   Strijdige met onze main app die Lucide gebruikt, maar de portal is
   een aparte surface (klant-facing, mobile-first, performance-kritiek)
   waar elke kB telt. Lucide-react = ~50kB import-chain.
   24×24 viewBox; strokeLinecap+Join + currentColor. */

import * as React from 'react';

const ICON_PATHS: Record<string, React.ReactNode> = {
  calendar: (<><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>),
  clock: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  pin: (<><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></>),
  users: (<><path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" /><circle cx="10" cy="8" r="3.2" /><path d="M20 19v-1.4a3.5 3.5 0 0 0-2.6-3.4M15.6 5.2a3.2 3.2 0 0 1 0 5.6" /></>),
  leaf: <path d="M5 19c0-7 5-13 14-13 0 9-6 14-13 14M5 19c2-3.5 4.5-5.5 8-7" />,
  download: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />,
  pen: (<><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="M13.5 6.5l4 4" /></>),
  edit: (<><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /><path d="M18.5 3.5a2 2 0 0 1 3 3L12 16l-4 1 1-4 9.5-9.5Z" /></>),
  chevDown: <path d="M6 9.5 12 15l6-5.5" />,
  chevRight: <path d="M9 6l6 6-6 6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="M5 12.5 10 17.5 19 7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  phone: <path d="M6.5 3.5h-.9A2 2 0 0 0 3.6 6 16 16 0 0 0 18 20.4a2 2 0 0 0 2.5-2v-.9a1.4 1.4 0 0 0-1-1.3l-2.7-.8a1.4 1.4 0 0 0-1.4.4l-.9.9a12 12 0 0 1-5-5l.9-.9a1.4 1.4 0 0 0 .4-1.4l-.8-2.7a1.4 1.4 0 0 0-1.3-1Z" />,
  mail: (<><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7.5 8 5.5 8-5.5" /></>),
  calPlus: (<><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4M12 13v4M10 15h4" /></>),
  fileCheck: (<><path d="M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5L14 3Z" /><path d="M14 3v4.5h4.5M9 14.5l2 2 4-4" /></>),
  info: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 7.8h.01" /></>),
  alert: (<><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4.5M12 17.5h.01" /></>),
  searchX: (<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.6-3.6M9 9l4 4M13 9l-4 4" /></>),
  external: <path d="M14 4h6v6M20 4l-8.5 8.5M18 13.5v5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H11" />,
  shield: (<><path d="M12 3 5 6v5c0 4.2 3 7.4 7 9 4-1.6 7-4.8 7-9V6l-7-3Z" /><path d="M9 12l2 2 4-4" /></>),
  spark: <path d="M12 4l1.7 4.6L18 10l-4.3 1.4L12 16l-1.7-4.6L6 10l4.3-1.4L12 4Z" />,
  wallet: (<><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v1.5" /><rect x="3" y="7.5" width="18" height="12" rx="2.5" /><path d="M16 13.5h2" /></>),
  lock: (<><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>),
  car: (<><path d="M4 13l1.3-3.7A2 2 0 0 1 7.2 8h9.6a2 2 0 0 1 1.9 1.3L20 13M4 13h16v4a.5.5 0 0 1-.5.5h-2A.5.5 0 0 1 17 17v-1H7v1a.5.5 0 0 1-.5.5h-2A.5.5 0 0 1 4 17v-4Z" /><path d="M7 16h.01M17 16h.01" /></>),
  image: (<><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><circle cx="8.5" cy="10" r="1.7" /><path d="m4 17.5 5-4.5 4 3 3-2.2 5 3.7" /></>),
  receipt: (<><path d="M5 3.5h14v17l-2.3-1.4-2.3 1.4-2.4-1.4-2.3 1.4-2.4-1.4L5 20.5V3.5Z" /><path d="M9 8h6M9 11.5h6M9 15h3" /></>),
};

export interface IconProps {
  name: keyof typeof ICON_PATHS | string;
  size?: number;
  stroke?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, size = 18, stroke = 1.7, className, style }: IconProps) {
  const body = ICON_PATHS[name];
  if (!body) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
         style={{ flex: 'none', display: 'block', ...style }} className={className} aria-hidden="true">
      {body}
    </svg>
  );
}

/* Brand flame-dome mark (BBQ Architect, default if no tenant logo). */
export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }} aria-hidden="true">
      <path d="M4.5 13.5C4.5 7.5 19.5 7.5 19.5 13.5" />
      <path d="M6 13.5h12" />
      <path d="M7.2 13.5 6 18M16.8 13.5 18 18" />
      <path d="M9.4 6.6c0-1 .8-1 .8-2M12 6c0-1 .8-1 .8-2M14.6 6.6c0-1 .8-1 .8-2" />
    </svg>
  );
}

import type { AllergenDef } from './allergens';

export function AllergenGlyph({ a, size = 14 }: { a: AllergenDef; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
         strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={a.paths} />
    </svg>
  );
}

export function AllergenChip({ a }: { a: AllergenDef }) {
  return (
    <span className="allergen" title={a.label}>
      <AllergenGlyph a={a} />
      <span>{a.label}</span>
    </span>
  );
}
