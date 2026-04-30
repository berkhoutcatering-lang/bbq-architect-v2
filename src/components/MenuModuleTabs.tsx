'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChefHat, BookOpen, UtensilsCrossed } from 'lucide-react';

const TABS = [
  { href: '/gerechten', label: 'Gerechten', icon: ChefHat },
  { href: '/menu-engineering', label: 'Menu Engineering', icon: UtensilsCrossed },
  { href: '/recepten', label: 'Recepten', icon: BookOpen },
];

/**
 * Tab-bar die op /gerechten, /menu-engineering en /recepten getoond wordt.
 * Visueel gedragen ze als één samengesteld 'Menu' geheel zonder dat we
 * 3 grote pagina's daadwerkelijk mergen — Sam ziet één rij tabs en springt
 * tussen catalog / BCG-analyse / receptenbibliotheek.
 */
export default function MenuModuleTabs() {
  const pathname = usePathname();

  return (
    <div className="tab-bar" role="tablist" aria-label="Menu modules" style={{ marginBottom: 16 }}>
      {TABS.map(t => {
        const isActive = pathname === t.href || (t.href !== '/' && pathname?.startsWith(t.href));
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={isActive}
            className={'tab-btn' + (isActive ? ' active' : '')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
          >
            <Icon size={13} />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
