'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { getSectionBySlug, getSectionSlugByTitle } from '@/lib/navigation';

/* Sub-routes voor /gerechten/* worden onderaan in subRouteLabels gemapt
   zodat de breadcrumb-tail leesbaar is ("Allergenen" i.p.v. "Allergen queue"). */
const routeMap: Record<string, { label: string; section: string }> = {
    '/gerechten': { label: 'Gerechten', section: 'Menu' },
    '/recepten': { label: 'Recepten', section: 'Menu' },
    '/bedenker': { label: 'Bedenker', section: 'Menu' },
    '/ai-chat': { label: 'AI Pitmaster', section: 'Menu' },
    '/agenda': { label: 'Agenda', section: 'Plannen' },
    '/events': { label: 'Events', section: 'Plannen' },
    '/prep-counter': { label: 'Prep Counter', section: 'Plannen' },
    '/klantgesprek': { label: 'Klantgesprek', section: 'Plannen' },
    '/haccp': { label: 'HACCP', section: 'Plannen' },
    '/offertes': { label: 'Offertes', section: 'Verkoop' },
    '/facturen': { label: 'Facturen', section: 'Verkoop' },
    '/klanten': { label: 'Klanten', section: 'Verkoop' },
    '/financien': { label: 'Financiën', section: 'Geld' },
    '/uren': { label: 'Uren', section: 'Geld' },
    '/inkoop': { label: 'Inkoop', section: 'Voorraad' },
    '/voorraad': { label: 'Voorraad', section: 'Voorraad' },
    '/leveranciers': { label: 'Leveranciers', section: 'Voorraad' },
    '/logistiek': { label: 'Logistiek', section: 'Voorraad' },
    '/materieel': { label: 'Materieel', section: 'Voorraad' },
    '/price-intelligence': { label: 'Prijsintelligentie', section: 'Voorraad' },
    '/foto-archief': { label: 'Foto-archief', section: 'Systeem' },
    '/gebruikers': { label: 'Gebruikers', section: 'Systeem' },
    '/instellingen': { label: 'Instellingen', section: 'Systeem' },
    '/mailbox': { label: 'Mailbox', section: 'Systeem' },
    '/website': { label: 'Website Beheer', section: 'Systeem' },
    '/faq': { label: 'FAQ', section: 'Systeem' },
    '/contact': { label: 'Contact', section: 'Systeem' },
    '/hulp': { label: 'Help Center', section: 'Systeem' },
};

/* Expliciete labels voor sub-route segments — beter dan auto-format
   (zoals "Allergen queue") wanneer de tab/UI een andere naam hanteert. */
const subRouteLabels: Record<string, string> = {
    'componenten':      'Componenten',
    'ingredienten':     'Ingrediënten',
    'allergen-queue':   'Allergenen',
    'menu-analyse':     'Menu-analyse',
    'ai-pitmaster':     'AI Pitmaster',
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
                // Lookup explicit label, fallback op auto-formatted slug
                const label = subRouteLabels[seg]
                    ?? seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ');
                return (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ChevronRight size={11} style={{ opacity: 0.4 }} />
                        <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                            {label}
                        </span>
                    </span>
                );
            })}
        </nav>
    );
}
