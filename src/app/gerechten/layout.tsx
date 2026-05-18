import type { ReactNode } from 'react';
import GerechtenTabs from '@/components/GerechtenTabs';
import AllergenQueueBanner from '@/components/AllergenQueueBanner';

/* Server-component layout: rendert de client-side tab-bar + de queue-banner
   als children. LucideIcon-refs mogen niet door de RSC-boundary gepasseerd
   worden, dus de TABS-array leeft in GerechtenTabs ('use client').

   AllergenQueueBanner is een server component — telt unconfirmed
   AI-suggested allergens en rendert alleen iets als count > 0. */
export default function GerechtenLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <GerechtenTabs />
            <AllergenQueueBanner />
            {children}
        </>
    );
}
