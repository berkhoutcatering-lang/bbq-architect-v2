import type { ReactNode } from 'react';
import GerechtenTabs from '@/components/GerechtenTabs';
import AllergenQueueBanner from '@/components/AllergenQueueBanner';
import MenuHubModalMounts from '@/components/menu/MenuHubModalMounts';
import '@/styles/menu-hub.css';

/* Server-component layout: rendert de client-side tab-bar + de queue-banner
   als children. LucideIcon-refs mogen niet door de RSC-boundary gepasseerd
   worden, dus de TABS-array leeft in GerechtenTabs ('use client').

   AllergenQueueBanner is een server component — telt unconfirmed
   AI-suggested allergens en rendert alleen iets als count > 0.

   Bucket C (2026-05-25):
   - menu-hub.css importeert alle `mr-*` classes uit Claude Design.
   - MenuHubModalMounts vangt ?modal=bedenker en ?modal=pitmaster op
     (deeplinks vanuit middleware-redirects) en mount de juiste modal. */
export default function GerechtenLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <GerechtenTabs />
            <AllergenQueueBanner />
            {children}
            <MenuHubModalMounts />
        </>
    );
}
