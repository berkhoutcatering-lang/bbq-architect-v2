'use client';

import { Clock, Hammer, Car, Truck } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

/* Operatie Overzicht (2026-06-12): hub Team & Operatie — uren, materieel,
   ritten en logistiek wonen hier (verhuisd uit Geld en Voorraad). */
const TABS: HubTab[] = [
  { href: '/uren', label: 'Uren', icon: Clock },
  { href: '/materieel', label: 'Materieel', icon: Hammer },
  { href: '/administratie/rittenregistratie', label: 'Ritten', icon: Car },
  { href: '/logistiek', label: 'Logistiek', icon: Truck },
];

export default function TeamTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Team & Operatie modules" />;
}
