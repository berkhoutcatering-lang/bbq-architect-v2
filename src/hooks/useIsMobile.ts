'use client';

import { useEffect, useState } from 'react';
import { MEDIA } from '@/lib/breakpoints';

/**
 * SSR-safe responsive hook. Returns one boolean per category.
 * Listener cleanup handled. Initial value on first render is `false`
 * (server has no viewport); first effect tick syncs to actual viewport.
 *
 * Usage:
 *   const { isPhone, isTablet, isDesktop } = useIsMobile();
 *   if (isPhone) return <Sheet>...</Sheet>;
 *
 * For pure phone-check shortcut:
 *   const isPhone = useIsPhone();
 */
export function useIsMobile() {
  const [isPhone, setIsPhone] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const phoneMQ = window.matchMedia(MEDIA.phone);
    const tabletMQ = window.matchMedia(MEDIA.tablet);

    const sync = () => {
      setIsPhone(phoneMQ.matches);
      setIsTablet(tabletMQ.matches);
    };

    sync();
    phoneMQ.addEventListener('change', sync);
    tabletMQ.addEventListener('change', sync);
    return () => {
      phoneMQ.removeEventListener('change', sync);
      tabletMQ.removeEventListener('change', sync);
    };
  }, []);

  return { isPhone, isTablet, isDesktop: !isPhone && !isTablet };
}

/** Shorthand for the most common case. */
export function useIsPhone(): boolean {
  return useIsMobile().isPhone;
}

/**
 * Generic matchMedia hook for arbitrary queries.
 * Prefer useIsMobile() for the canonical breakpoints.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);

  return matches;
}
