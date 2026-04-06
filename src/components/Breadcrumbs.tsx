'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';

const routeMap: Record<string, { label: string; section: string }> = {
    '/menu-engineering': { label: 'Menu Engineering', section: 'De Keuken' },
    '/recepten': { label: 'Recepten', section: 'De Keuken' },
    '/gerechten': { label: 'Gerechten', section: 'De Keuken' },
    '/agenda': { label: 'Agenda', section: 'Operatie' },
    '/events': { label: 'Events', section: 'Operatie' },
    '/event-planner': { label: 'Event Planner', section: 'Operatie' },
    '/service': { label: 'Service', section: 'Operatie' },
    '/offertes': { label: 'Offertes', section: 'De Zaak' },
    '/offerte-editor': { label: 'Snel Aanmaken', section: 'De Zaak' },
    '/facturen': { label: 'Facturen', section: 'De Zaak' },
    '/klanten': { label: 'Klanten', section: 'De Zaak' },
    '/financien': { label: 'Analytics', section: 'De Zaak' },
    '/boekhouding': { label: 'Boekhouding', section: 'De Zaak' },
    '/inkoop': { label: 'Inkoop', section: 'Beheer & Logistiek' },
    '/voorraad': { label: 'Voorraad', section: 'Beheer & Logistiek' },
    '/logistiek': { label: 'Logistiek', section: 'Beheer & Logistiek' },
    '/materieel': { label: 'Materieel', section: 'Beheer & Logistiek' },
    '/uren': { label: 'Uren', section: 'Beheer & Logistiek' },
    '/haccp': { label: 'HACCP', section: 'Beheer & Logistiek' },
    '/ai-chat': { label: 'Pitmaster Studio', section: 'Digital Pitmaster' },
    '/price-intelligence': { label: 'Prijsintelligentie', section: 'Digital Pitmaster' },
    '/foto-archief': { label: 'Foto-archief', section: 'Systeem' },
    '/gebruikers': { label: 'Gebruikers', section: 'Systeem' },
    '/instellingen': { label: 'Instellingen', section: 'Systeem' },
    '/berichten': { label: 'Berichten', section: 'Communicatie' },
    '/mailbox': { label: 'Mailbox', section: 'Communicatie' },
    '/website': { label: 'Website Beheer', section: 'Website' },
    '/faq': { label: 'FAQ', section: 'Hulp & Support' },
    '/contact': { label: 'Contact', section: 'Hulp & Support' },
};

export default function Breadcrumbs() {
    const pathname = usePathname();

    if (pathname === '/') return null;

    const basePath = '/' + pathname.split('/').filter(Boolean)[0];
    const route = routeMap[basePath];

    if (!route) return null;

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
            <span style={{ color: 'var(--muted-light)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: 10 }}>
                {route.section}
            </span>
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
