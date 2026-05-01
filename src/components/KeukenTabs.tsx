'use client';

import { ChefHat, BarChart3, Sparkles } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

/* Keuken-hub:
   - Gerechten: vaste bibliotheek — wat je écht kookt, klant-klaar
   - Bedenker: AI-speeltuin — vrij brainstormen, opslaan als concept
   - Marges:   analyse — BCG-matrix + foodcost-trends

   "Recepten" weg 2026-05-01 (receptuur in gerecht-modal). "AI Pitmaster" tab
   weg (chat blijft bestaan via ⌘K). De Bedenker is een gerichte AI-tool,
   niet een losse chat — daarom verdient hij wel een tab. */
const TABS: HubTab[] = [
  { href: '/gerechten', label: 'Gerechten', icon: ChefHat },
  { href: '/bedenker', label: 'Bedenker', icon: Sparkles },
  { href: '/marges', label: 'Marges', icon: BarChart3 },
];

export default function KeukenTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Keuken modules" />;
}
