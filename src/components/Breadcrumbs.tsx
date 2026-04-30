'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { getSectionBySlug, getSectionSlugByTitle } from '@/lib/navigation';

const routeMap: Record<string, { label: string; section: string }> = {
    '/menu-engineering': { label: 'Menu Engineering', section: 'Keuken' },
    '/gerechten': { label: 'Gerechten', section: 'Keuken' },
    '/recepten': { label: 'Recepten', section: 'Keuken' },
    '/ai-chat': { label: 'Pitmaster Studio', section: 'Keuken' },
    '/agenda': { label: 'Agenda', section: 'Operatie' },
    '/events': { label: 'Events', section: 'Operatie' },
    '/service': { label: 'Service', section: 'Operatie' },
    '/prep-counter': { label: 'Prep Counter', section: 'Operatie' },
    '/klantgesprek': { label: 'Klantgesprek', section: 'Operatie' },
    '/offertes': { label: 'Offertes', section: 'Verkoop' },
    '/facturen': { label: 'Facturen', section: 'Verkoop' },
    '/klanten': { label: 'Klanten', section: 'Verkoop' },
    '/financien': { label: 'Financiën', section: 'Verkoop' },
    '/inkoop': { label: 'Inkoop', section: 'Beheer' },
    '/voorraad': { label: 'Voorraad', section: 'Beheer' },
    '/logistiek': { label: 'Logistiek', section: 'Beheer' },
    '/materieel': { label: 'Materieel', section: 'Beheer' },
    '/uren': { label: 'Uren', section: 'Beheer' },
    '/haccp': { label: 'HACCP', section: 'Beheer' },
    '/price-intelligence': { label: 'Prijsintelligentie', section: 'Beheer' },
    '/foto-archief': { label: 'Foto-archief', section: 'Systeem' },
    '/gebruikers': { label: 'Gebruikers', section: 'Systeem' },
    '/instellingen': { label: 'Instellingen', section: 'Systeem' },
    '/mailbox': { label: 'Mailbox', section: 'Systeem' },
    '/website': { label: 'Website Beheer', section: 'Systeem' },
    '/faq': { label: 'FAQ', section: 'Systeem' },
    '/contact': { label: 'Contact', section: 'Systeem' },
    '/hulp': { label: 'Help Center', section: 'Systeem' },
};

export default function Breadcrumbs() {
    const pathname = usePathname();

    if (pathname === '/') return null;

    // Handle section overview pages (/sectie/[slug])
    if (pathname.startsWith('/sectie/')) {
        const slug = pathname.split('/')[2];
        const section = getSectionBySlug(slug);
        if (!section) return null;

        return (
            <nav
                aria-label="Breadcrumb"
                className="breadcrumb-nav"
                style={{
                    paddingBottom: 10,
                    paddingLeft: 16,
                    paddingRight: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    flexWrap: 'wrap' as const,
                    color: 'var(--muted)',
                    borderBottom: '1px solid var(--border)',
                    background: 'rgba(18,18,21,0.6)',
                    backdropFilter: 'blur(8px)',
                }}
            >
                <Link href="/" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                    <Home size={13} />
                </Link>
                <ChevronRight size={11} style={{ opacity: 0.4 }} />
                <span style={{ color: 'var(--text)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: 10 }}>
                    {section.title}
                </span>
            </nav>
        );
    }

    const basePath = '/' + pathname.split('/').filter(Boolean)[0];
    const route = routeMap[basePath];

    if (!route) return null;

    const sectionSlug = getSectionSlugByTitle(route.section);
    const isSubPage = pathname !== basePath;
    const subSegments = pathname.split('/').filter(Boolean).slice(1);

    return (
        <nav
            aria-label="Breadcrumb"
            className="breadcrumb-nav"
            style={{
                paddingBottom: 10,
                paddingLeft: 16,
                paddingRight: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                flexWrap: 'wrap' as const,
                color: 'var(--muted)',
                borderBottom: '1px solid var(--border)',
                background: 'rgba(18,18,21,0.6)',
                backdropFilter: 'blur(8px)',
            }}
        >
            <Link href="/" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                <Home size={13} />
            </Link>
            <ChevronRight size={11} style={{ opacity: 0.4 }} />
            <Link
                href={sectionSlug ? `/sectie/${sectionSlug}` : '/'}
                className="breadcrumb-section-link"
                style={{
                    color: 'var(--muted-light)',
                    fontWeight: 500,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    fontSize: 10,
                    textDecoration: 'none',
                    transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted-light)'; }}
            >
                {route.section}
            </Link>
            <ChevronRight size={11} style={{ opacity: 0.4 }} />
            {isSubPage ? (
                <Link href={basePath} style={{ color: 'var(--muted)', textDecoration: 'none' }}>
                    {route.label}
                </Link>
            ) : (
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{route.label}</span>
            )}
            {isSubPage && subSegments.map(function (seg, i) {
                return (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ChevronRight size={11} style={{ opacity: 0.4 }} />
                        <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                            {seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ')}
                        </span>
                    </span>
                );
            })}
        </nav>
    );
}
