'use client';

import { Calendar, PartyPopper, MessageSquare, ClipboardList, ShieldCheck } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

const TABS: HubTab[] = [
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/events', label: 'Events', icon: PartyPopper },
  { href: '/klantgesprek', label: 'Klantgesprek', icon: MessageSquare },
  { href: '/prep-counter', label: 'Prep', icon: ClipboardList },
  { href: '/haccp', label: 'HACCP', icon: ShieldCheck },
];

export default function PlannenTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Plannen modules" />;
}
