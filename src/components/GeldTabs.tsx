'use client';

import { BarChart3, Clock } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

const TABS: HubTab[] = [
  { href: '/financien', label: 'Financiën', icon: BarChart3 },
  { href: '/uren', label: 'Uren', icon: Clock },
];

export default function GeldTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Geld & Boekhouding modules" />;
}
