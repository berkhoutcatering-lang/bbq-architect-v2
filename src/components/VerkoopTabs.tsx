'use client';

import { FileText, Users, Inbox, Layers } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

const TABS: HubTab[] = [
  { href: '/verkoop/leads', label: 'Aanvragen', icon: Inbox },
  { href: '/verkoop/arrangementen', label: 'Arrangementen', icon: Layers },
  { href: '/offertes', label: 'Offertes', icon: FileText },
  { href: '/klanten', label: 'Klanten', icon: Users },
];

export default function VerkoopTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Verkoop & Klanten modules" />;
}
