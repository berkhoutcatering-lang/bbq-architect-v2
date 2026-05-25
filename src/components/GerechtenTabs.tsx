'use client';

import { ChefHat, Boxes, BarChart3 } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

/* Bucket C (2026-05-25) — Menu & Recepten IA opschonen, 5 tabs → 3:
   - /menu-analyse en /insights samengevoegd onder /analyse met view-toggle
     (?view=performance toont BCG, ?view=health toont insights-grid)
   - /allergen-queue → modal-flow via saveGerecht (banner blijft als fallback)
   - AI Bedenker + Pitmaster → modals (knop in library-header + gerecht-detail)
   - Kookbord blijft sidebar-child onder Menu (zoals in navigation.tsx)
   Alle oude URLs blijven werken via middleware-redirects. */
const TABS: HubTab[] = [
    { href: '/gerechten',                  label: 'Gerechten',     icon: ChefHat },
    { href: '/gerechten/componenten',      label: 'Componenten',   icon: Boxes },
    { href: '/gerechten/analyse',          label: 'Analyse',       icon: BarChart3 },
];

export default function GerechtenTabs() {
    return <HubTabs tabs={TABS} ariaLabel="Menu modules" />;
}
