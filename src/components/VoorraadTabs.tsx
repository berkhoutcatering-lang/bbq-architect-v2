'use client';

import { Package, ShoppingCart, Store, ScanLine, Archive, TrendingUp } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

/* Operatie Overzicht (2026-06-12): hub Inkoop & Voorraad — Bonnen en
   Bonnenkistje wonen hier (verhuisd uit Geld); Materieel/Logistiek
   verhuisden naar Team & Operatie. */
const TABS: HubTab[] = [
  { href: '/voorraad', label: 'Voorraad', icon: Package },
  { href: '/inkoop', label: 'Inkoop', icon: ShoppingCart },
  { href: '/leveranciers', label: 'Leveranciers', icon: Store },
  { href: '/bonnen', label: 'Bonnen', icon: ScanLine },
  { href: '/archief', label: 'Bonnenkistje', icon: Archive },
  { href: '/price-intelligence', label: 'Inkoopprijzen', icon: TrendingUp },
];

export default function VoorraadTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Inkoop & Voorraad modules" />;
}
