'use client';

import { ChefHat, Boxes, ShieldCheck, BarChart3, Activity } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

/* S2-deel-2 — AI Bedenker en AI Pitmaster zijn uit de hoofdtabs gehaald:
   - Bedenker → entry via prominente knop op /gerechten/componenten (URL blijft)
   - Pitmaster → "Vraag Pitmaster" knop op event-hub (in-context)
   Beide URLs blijven werken voor bookmarks.

   S2.7 — Ingrediënten weg: pagina was gateway naar /voorraad, KPI's in insights. */
const TABS: HubTab[] = [
    { href: '/gerechten',                  label: 'Gerechten',     icon: ChefHat },
    { href: '/gerechten/componenten',      label: 'Componenten',   icon: Boxes },
    { href: '/gerechten/menu-analyse',     label: 'Menu-analyse',  icon: BarChart3 },
    { href: '/gerechten/insights',         label: 'Insights',      icon: Activity },
    { href: '/gerechten/allergen-queue',   label: 'Allergenen',    icon: ShieldCheck },
];

export default function GerechtenTabs() {
    return <HubTabs tabs={TABS} ariaLabel="Menu modules" />;
}
