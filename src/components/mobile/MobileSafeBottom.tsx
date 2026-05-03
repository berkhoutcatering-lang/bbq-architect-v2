'use client';

/**
 * MobileSafeBottom — wrapper that adds bottom padding on phones so content
 * doesn't sit underneath the BottomNav (60px) + safe-area-inset-bottom.
 *
 * Use as the outermost container of any authed page that scrolls.
 *
 *   <MobileSafeBottom>
 *     ...page content...
 *   </MobileSafeBottom>
 *
 * Desktop (≥768px): noop.
 * Phone: padding-bottom: calc(72px + env(safe-area-inset-bottom)).
 *
 * Use the `extra` prop when stacking with a StickyMobileCTA bar.
 */

import * as React from 'react';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  /** Extra px added on top of the BottomNav clearance. */
  extra?: number;
  /** Render as a different element. Default: div. */
  as?: 'div' | 'main' | 'section' | 'article';
}

export default function MobileSafeBottom({
  extra = 0,
  as: As = 'div',
  style,
  className = '',
  children,
  ...rest
}: Props) {
  const baseClass = extra > 0 ? 'mobile-safe-bottom' : 'mobile-safe-bottom';
  const inlineVar: React.CSSProperties = extra
    ? ({ ['--mobile-safe-bottom-extra' as string]: `${extra}px` } as React.CSSProperties)
    : {};
  return (
    <As
      className={[baseClass, className].filter(Boolean).join(' ')}
      style={{ ...inlineVar, ...style }}
      {...rest}
    >
      {children}
    </As>
  );
}
