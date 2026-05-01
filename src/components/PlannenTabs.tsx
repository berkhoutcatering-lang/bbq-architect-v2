'use client';

import { Calendar, PartyPopper, MessageSquare, ClipboardList, Bell, ShieldCheck } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

const TABS: HubTab[] = [
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/events', label: 'Events', icon: PartyPopper },
  { href: '/klantgesprek', label: 'Klantgesprek', icon: MessageSquare },
  { href: '/prep-counter', label: 'Prep', icon: ClipboardList },
  { href: '/service', label: 'Service', icon: Bell },
  { href: '/haccp', label: 'HACCP', icon: ShieldCheck },
];

export default function PlannenTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Plannen modules" />;
}
