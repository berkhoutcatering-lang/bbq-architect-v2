import type { ReactNode } from 'react';

/**
 * KDS layout — bypass de normale app-shell.
 * Geen sidebar, geen breadcrumb, geen bottom-nav.
 * De page zelf rendert in een fixed-positioned full-screen container.
 */
export default function KdsServiceLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
