'use client';

/**
 * StickyMobileCTA — bottom-fixed action bar that sits above the BottomNav on
 * phones, and stays at the bottom of its container on desktop.
 *
 * Use for: wizard Vorige/Volgende, multi-step forms, /q/[id] Accept-button,
 * any flow where the primary CTA must be visible without scrolling.
 *
 * On phone: position fixed, full-width, padded for safe-area-inset-bottom and
 * stacked above the BottomNav (60px gap).
 * On desktop: position sticky inside the parent container.
 *
 * The sibling page content should be wrapped in <MobileSafeBottom extra={64}>
 * so its bottom padding clears both the BottomNav AND the StickyMobileCTA.
 */

import * as React from 'react';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual emphasis. "primary" = full-width brand CTA; "split" = 2-button row. */
  variant?: 'default';
  /** When true, hides on desktop (only shown on phone). */
  phoneOnly?: boolean;
}

export default function StickyMobileCTA({
  className = '',
  style,
  phoneOnly = false,
  children,
  ...rest
}: Props) {
  return (
    <div
      data-sticky-mobile-cta
      className={[
        'sticky-mobile-cta',
        phoneOnly ? 'sticky-mobile-cta--phone-only' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}
