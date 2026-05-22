'use client';

import { BarChart3, Clock, ScanLine, Car } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

const TABS: HubTab[] = [
  { href: '/financien', label: 'Financiën', icon: BarChart3 },
  { href: '/uren', label: 'Uren', icon: Clock },
  { href: '/archief', label: 'Boekhoud-archief', icon: ScanLine },
  { href: '/geld/rittenregistratie', label: 'Ritten', icon: Car },
];

export default function GeldTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Geld modules" />;
}
