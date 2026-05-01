'use client';

import { Package, ShoppingCart, Truck, Wrench, DollarSign } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

const TABS: HubTab[] = [
  { href: '/voorraad', label: 'Voorraad', icon: Package },
  { href: '/inkoop', label: 'Inkoop', icon: ShoppingCart },
  { href: '/logistiek', label: 'Logistiek', icon: Truck },
  { href: '/materieel', label: 'Materieel', icon: Wrench },
  { href: '/price-intelligence', label: 'Prijzen', icon: DollarSign },
];

export default function VoorraadTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Voorraad & Beheer modules" />;
}
