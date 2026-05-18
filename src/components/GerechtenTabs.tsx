'use client';

import { ChefHat, Boxes, Library, ShieldCheck, BarChart3, Flame, Activity } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

const TABS: HubTab[] = [
    { href: '/gerechten',                  label: 'Gerechten',     icon: ChefHat },
    { href: '/gerechten/componenten',      label: 'Componenten',   icon: Boxes },
    { href: '/gerechten/ingredienten',     label: 'Ingrediënten',  icon: Library },
    { href: '/gerechten/allergen-queue',   label: 'Allergenen',    icon: ShieldCheck },
    { href: '/gerechten/insights',         label: 'Insights',      icon: Activity },
    { href: '/gerechten/menu-analyse',     label: 'Menu-analyse',  icon: BarChart3 },
    { href: '/gerechten/ai-pitmaster',     label: 'AI Pitmaster',  icon: Flame },
];

export default function GerechtenTabs() {
    return <HubTabs tabs={TABS} ariaLabel="Menu & Recepten modules" />;
}
