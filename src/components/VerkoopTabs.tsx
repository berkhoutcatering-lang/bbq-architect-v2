'use client';

import { FileText, Receipt, Users } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

const TABS: HubTab[] = [
  { href: '/offertes', label: 'Offertes', icon: FileText },
  { href: '/facturen', label: 'Facturen', icon: Receipt },
  { href: '/klanten', label: 'Klanten', icon: Users },
];

export default function VerkoopTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Verkoop & Klanten modules" />;
}
