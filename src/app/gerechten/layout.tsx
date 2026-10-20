import type { ReactNode } from 'react';
import AllergenQueueBanner from '@/components/AllergenQueueBanner';
import MenuHubModalMounts from '@/components/menu/MenuHubModalMounts';
import '@/styles/menu-hub.css';

/* Server-component layout: rendert de queue-banner en de modal-mounts. De
   tabbladen van Keuken staan sinds 2026-10-20 in de werkruimtebalk.

   AllergenQueueBanner is een server component — telt unconfirmed
   AI-suggested allergens en rendert alleen iets als count > 0.

   Bucket C (2026-05-25):
   - menu-hub.css importeert alle `mr-*` classes uit Claude Design.
   - MenuHubModalMounts vangt ?modal=bedenker en ?modal=pitmaster op
     (deeplinks vanuit middleware-redirects) en mount de juiste modal. */
export default function GerechtenLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <AllergenQueueBanner />
            {children}
            <MenuHubModalMounts />
        </>
    );
}
