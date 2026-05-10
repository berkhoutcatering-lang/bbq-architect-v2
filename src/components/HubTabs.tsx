'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

export interface HubTab {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface Props {
  tabs: HubTab[];
  /** Voor screen-reader: bv. "Plannen modules" */
  ariaLabel: string;
}

/**
 * Generieke horizontale tab-bar voor hub-pages. Gebruikt door PlannenTabs/VerkoopTabs/etc.
 * Active-state: matcht pathname op href (of subpaden).
 */
export default function HubTabs({ tabs, ariaLabel }: Props) {
  const pathname = usePathname();

  const activeHref = tabs
    .filter(t => pathname === t.href || (t.href !== '/' && pathname?.startsWith(t.href + '/')))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="tab-bar" role="tablist" aria-label={ariaLabel} style={{ marginBottom: 'var(--space-4)' }}>
      {tabs.map(t => {
        const isActive = t.href === activeHref;
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? 'page' : undefined}
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
