'use client';

import { Calendar, PartyPopper } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

const TABS: HubTab[] = [
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/events', label: 'Events', icon: PartyPopper },
];

export default function PlannenTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Plannen modules" />;
}
