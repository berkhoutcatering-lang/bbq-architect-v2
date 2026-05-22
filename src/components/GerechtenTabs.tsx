'use client';

import { ChefHat, Boxes, BarChart3 } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

/* Sprint 3 A7 — 5 tabs zijn gemerged naar 3 hub-tabs:
   - Menu-analyse → Inzichten?tab=marge
   - Insights → Inzichten?tab=overzicht
   - Allergen-queue → Inzichten?tab=allergenen (page killed via redirect)
   Sub-tab strip op /gerechten/inzichten zelf, niet in de hub-tab-bar. */
const TABS: HubTab[] = [
    { href: '/gerechten', label: 'Gerechten', icon: ChefHat },
    { href: '/gerechten/componenten', label: 'Componenten', icon: Boxes },
    { href: '/gerechten/inzichten', label: 'Inzichten', icon: BarChart3 },
];

export default function GerechtenTabs() {
    return <HubTabs tabs={TABS} ariaLabel="Menu modules" />;
}
