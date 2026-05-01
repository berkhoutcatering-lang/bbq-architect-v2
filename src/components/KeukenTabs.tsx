'use client';

import { ChefHat, BarChart3 } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

/* Keuken-hub: één plek voor gerechten + samenstelling, één plek voor analyse.
   - "Recepten" weg 2026-05-01 → receptuur leeft in de gerecht-modal op /gerechten.
   - "AI Pitmaster" weg 2026-05-01 → AI woont waar de actie is (slide-over op
     /gerechten + floating chat-bubble), niet als losse tab. /ai-chat blijft
     bestaan en is vindbaar via ⌘K. */
const TABS: HubTab[] = [
  { href: '/gerechten', label: 'Gerechten', icon: ChefHat },
  { href: '/marges', label: 'Marges', icon: BarChart3 },
];

export default function KeukenTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Keuken modules" />;
}
