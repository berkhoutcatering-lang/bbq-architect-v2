import type { ReactNode } from 'react';
import GerechtenTabs from '@/components/GerechtenTabs';
import AllergenQueueBanner from '@/components/AllergenQueueBanner';

/* /bedenker valt onder Menu & Recepten hub (zie GerechtenTabs.TABS, P0.22).
   Daarom dezelfde tab-bar + queue-banner als /gerechten — geeft de gebruiker
   visuele continuïteit en maakt navigatie tussen Bedenker, Pitmaster en
   Menu-analyse één klik. URL blijft `/bedenker` (geen breaking change). */
export default function BedenkerLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <GerechtenTabs />
            <AllergenQueueBanner />
            {children}
        </>
    );
}
