'use client';

import { Settings, Users, Inbox, Globe, HelpCircle, Building2 } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

const TABS: HubTab[] = [
  { href: '/instellingen', label: 'Instellingen', icon: Settings },
  { href: '/gebruikers', label: 'Gebruikers', icon: Users },
  { href: '/mailbox', label: 'Mailbox', icon: Inbox },
  { href: '/website', label: 'Website', icon: Globe },
  { href: '/hulp', label: 'Hulp', icon: HelpCircle },
  { href: '/admin', label: 'Admin', icon: Building2 },
];

export default function SysteemTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Instellingen & Hulp modules" />;
}
