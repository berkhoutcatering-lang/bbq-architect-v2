'use client';

import { ChefHat, UtensilsCrossed, BookOpen, Sparkles } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

const TABS: HubTab[] = [
  { href: '/gerechten', label: 'Gerechten', icon: ChefHat },
  { href: '/menu-engineering', label: 'Menu-analyse', icon: UtensilsCrossed },
  { href: '/recepten', label: 'Recepten', icon: BookOpen },
  { href: '/ai-chat', label: 'AI Pitmaster', icon: Sparkles },
];

export default function KeukenTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Menu & Recepten modules" />;
}
