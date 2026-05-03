/**
 * Single source of truth for responsive breakpoints across the app.
 * All inline media queries / matchMedia calls should reference these.
 *
 * Phone-first ladder:
 *   <  phone (768)   = phone (iPhone SE 375 baseline)
 *   >= phone (768)   = tablet
 *   >= tablet (1024) = desktop
 *   >= desktop (1280)= wide
 */
export const BREAKPOINTS = {
  phone: 768,
  tablet: 1024,
  desktop: 1280,
} as const;

export const MEDIA = {
  phone: `(max-width: ${BREAKPOINTS.phone - 1}px)`,
  tablet: `(min-width: ${BREAKPOINTS.phone}px) and (max-width: ${BREAKPOINTS.tablet - 1}px)`,
  desktop: `(min-width: ${BREAKPOINTS.tablet}px)`,
  wide: `(min-width: ${BREAKPOINTS.desktop}px)`,
  /** Convenience: anything that is NOT a phone */
  notPhone: `(min-width: ${BREAKPOINTS.phone}px)`,
} as const;
