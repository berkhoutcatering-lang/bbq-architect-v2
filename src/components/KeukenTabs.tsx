'use client';

import { ChefHat, BarChart3, Sparkles } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

/* Keuken-hub:
   - Gerechten:    vaste bibliotheek — wat je écht kookt, klant-klaar
   - Bedenker:     AI-speeltuin — vrij brainstormen, opslaan als concept
   - Menu-analyse: BCG-kwadranten + menu-health in één plek (was /marges + /insights, gemerged 2026-05-22) */
const TABS: HubTab[] = [
  { href: '/gerechten', label: 'Gerechten', icon: ChefHat },
  { href: '/bedenker', label: 'Bedenker', icon: Sparkles },
  { href: '/gerechten/menu-analyse', label: 'Menu-analyse', icon: BarChart3 },
];

export default function KeukenTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Keuken modules" />;
}
