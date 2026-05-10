'use client';

import { Clock, Users } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

const TABS: HubTab[] = [
  { href: '/uren', label: 'Klok', icon: Clock },
  { href: '/uren/personeel', label: 'Personeel', icon: Users },
];

export default function UrenTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Uren modules" />;
}
