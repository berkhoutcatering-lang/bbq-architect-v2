'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

export interface SubTab {
    /** Value voor de query-param (bijv. 'overzicht'). */
    value: string;
    label: string;
    icon?: LucideIcon;
    /** Optionele count-pill (bijv. queue-grootte). */
    badge?: number;
}

interface Props {
    /** Naam van de query-param die de actieve tab bepaalt (bijv. 'tab'). */
    paramName: string;
    /** Default tab-value als ?paramName ontbreekt. */
    defaultValue: string;
    tabs: SubTab[];
    ariaLabel: string;
}

/**
 * Horizontale sub-tab-bar gestuurd door een query-param i.p.v. pathname.
 * Bedoeld voor pagina's met meerdere views op één route — bijv. /gerechten/inzichten?tab=marge.
 *
 * Gebruikt prefetch=false zodat de hele tab-render server-side mag vernieuwen wanneer
 * de gebruiker tussen tabs schakelt (anders zou Next.js de tab-content cached houden
 * en data-fetches niet opnieuw doen).
 */
export default function SubTabs({ paramName, defaultValue, tabs, ariaLabel }: Props) {
    const pathname = usePathname() ?? '';
    const searchParams = useSearchParams();
    const current = searchParams?.get(paramName) ?? defaultValue;

    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            style={{
                display: 'flex',
                gap: 4,
                marginBottom: 'var(--space-4, 16px)',
                padding: 4,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
                flexWrap: 'wrap',
            }}
        >
            {tabs.map((t) => {
                const isActive = current === t.value;
                const Icon = t.icon;
                const href = `${pathname}?${paramName}=${t.value}`;
                return (
                    <Link
                        key={t.value}
                        href={href}
                        role="tab"
                        aria-selected={isActive}
                        aria-current={isActive ? 'page' : undefined}
                        prefetch={false}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '8px 14px',
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            textDecoration: 'none',
                            color: isActive ? 'var(--text)' : 'var(--muted)',
                            background: isActive ? 'var(--brand, #c4a35a)' : 'transparent',
                            minHeight: 36,
                            transition: 'background 0.12s, color 0.12s',
                        }}
                    >
                        {Icon && <Icon size={13} aria-hidden />}
                        {t.label}
                        {typeof t.badge === 'number' && t.badge > 0 && (
                            <span
                                style={{
                                    padding: '1px 6px',
                                    borderRadius: 999,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    background: isActive ? 'rgba(0,0,0,.2)' : 'rgba(245,158,11,.15)',
                                    color: isActive ? 'var(--text)' : '#f59e0b',
                                    minWidth: 16,
                                    textAlign: 'center',
                                }}
                                aria-label={`${t.badge} items`}
                            >
                                {t.badge > 99 ? '99+' : t.badge}
                            </span>
                        )}
                    </Link>
                );
            })}
        </div>
    );
}
