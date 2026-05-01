'use client';

import { ChefHat, UtensilsCrossed, Sparkles } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

/* "Recepten" verwijderd 2026-05-01 — receptuur leeft nu in de gerecht-modal
   op /gerechten (bereidingswijze + porties + wijn-suggestie + Kitchen Mode).
   Eén plek voor wat-eet-je content; /recepten redirect naar /gerechten. */
const TABS: HubTab[] = [
  { href: '/gerechten', label: 'Gerechten', icon: ChefHat },
  { href: '/menu-engineering', label: 'Menu-analyse', icon: UtensilsCrossed },
  { href: '/ai-chat', label: 'AI Pitmaster', icon: Sparkles },
];

export default function KeukenTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Menu & Recepten modules" />;
}
