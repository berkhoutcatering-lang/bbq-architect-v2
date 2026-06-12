'use client';

import { BarChart3, Receipt, BookOpen } from 'lucide-react';
import HubTabs, { type HubTab } from './HubTabs';

/* Operatie Overzicht (2026-06-12): Geld is puur geld — Uren/Ritten naar
   Team & Operatie, Bonnenkistje naar Inkoop & Voorraad. */
const TABS: HubTab[] = [
  { href: '/financien', label: 'Financiën', icon: BarChart3 },
  { href: '/facturen', label: 'Facturen', icon: Receipt },
  { href: '/geld/boekhouder', label: 'Boekhouder', icon: BookOpen },
];

export default function GeldTabs() {
  return <HubTabs tabs={TABS} ariaLabel="Geld modules" />;
}
