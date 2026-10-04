'use client';

import { AlertTriangle, Receipt } from 'lucide-react';
import HubTabs, { type HubTab } from '@/components/HubTabs';

const TABS: HubTab[] = [
    { href: '/verkoop/toonbank', label: 'Bonnen', icon: Receipt },
    { href: '/verkoop/toonbank/te-controleren', label: 'Te controleren', icon: AlertTriangle },
];

export default function ToonbankTabs() {
    return <HubTabs tabs={TABS} ariaLabel="Toonbank" />;
}
