import type { ReactNode } from 'react';
import '@/styles/menu-hub.css';
import '@/styles/winkel.css';

/**
 * De werkruimte Boekhouding winkel. Zelfde rustige lijsten als de werkruimte
 * Winkel (wk-* uit winkel.css, kf-* uit menu-hub.css). De tabbladen komen uit
 * src/lib/navigation.tsx; hier staat alleen het kader.
 */
export default function WinkelboekLayout({ children }: { children: ReactNode }) {
    return <div className="wk-pagina mobile-safe-bottom">{children}</div>;
}
