'use client';

import { ChefHat, Boxes, Library, ShieldCheck, BarChart3, Flame, Activity, Sparkles } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

/* P0.22 — /bedenker als sub-tab onder Menu & Recepten. URL blijft `/bedenker`
   (geen breaking-change voor bookmarks); de tab toont actief als pathname
   met `/bedenker` start. */
const TABS: HubTab[] = [
    { href: '/gerechten',                  label: 'Gerechten',     icon: ChefHat },
    { href: '/gerechten/componenten',      label: 'Componenten',   icon: Boxes },
    { href: '/gerechten/ingredienten',     label: 'Ingrediënten',  icon: Library },
    { href: '/bedenker',                   label: 'AI Bedenker',   icon: Sparkles },
    { href: '/gerechten/ai-pitmaster',     label: 'AI Pitmaster',  icon: Flame },
    { href: '/gerechten/menu-analyse',     label: 'Menu-analyse',  icon: BarChart3 },
    { href: '/gerechten/insights',         label: 'Insights',      icon: Activity },
    { href: '/gerechten/allergen-queue',   label: 'Allergenen',    icon: ShieldCheck },
];

export default function GerechtenTabs() {
    return <HubTabs tabs={TABS} ariaLabel="Menu & Recepten modules" />;
}
