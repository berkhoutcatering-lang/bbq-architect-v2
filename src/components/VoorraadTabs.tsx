'use client';

import { Package, ShoppingCart, Store } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

const TABS: HubTab[] = [
  { href: '/voorraad', label: 'Voorraad', icon: Package },
  { href: '/inkoop', label: 'Inkoop', icon: ShoppingCart },
  { href: '/leveranciers', label: 'Leveranciers', icon: Store },
];

export default function VoorraadTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Voorraad modules" />;
}
