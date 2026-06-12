'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { navSections, getSectionBySlug, getSectionSlugByTitle } from '@/lib/navigation';
import { useActiveResource, type ActiveResourceKind } from '@/lib/ActiveResourceContext';

/* Welke detail-route hoort bij welke active-resource-kind — zodat de breadcrumb
   de entiteit-naam ("Bruiloft Veldhoven") toont i.p.v. de kale id-segmenten
   ("11 > View"). Alleen op detail-routes (sub-pages), niet op de lijst. */
const KIND_BASEPATH: Record<ActiveResourceKind, string> = {
  event: '/events',
  offerte: '/offertes',
  klant: '/klanten',
  klantgesprek: '/klantgesprek',
};

/* Eén-bron-principe (Operatie Overzicht 2026-06-12): de hub per route komt
   uit navSections — het kruimelpad kan niet meer uit de pas lopen met de
   sidebar (zoals "GELD › Uren" terwijl Uren naar Team & Operatie verhuisde).
   fallbackRouteMap dekt alleen routes die bewust níet in de sidebar staan. */
const fallbackRouteMap: Record<string, { label: string; section: string }> = {
    '/marges': { label: 'Marges & analyse', section: 'Keuken' },
    '/recepten': { label: 'Recepten', section: 'Keuken' },
    '/bedenker': { label: 'Bedenker', section: 'Keuken' },
    '/ai-chat': { label: 'AI Pitmaster', section: 'Keuken' },
    '/prep-counter': { label: 'Prep Counter', section: 'Plannen' },
    '/klantgesprek': { label: 'Klantgesprek', section: 'Plannen' },
    '/haccp': { label: 'HACCP', section: 'Plannen' },
    '/foto-archief': { label: 'Foto-archief', section: 'Systeem' },
    '/faq': { label: 'FAQ', section: 'Systeem' },
    '/contact': { label: 'Contact', section: 'Systeem' },
};

const routeMap: Record<string, { label: string; section: string }> = { ...fallbackRouteMap };
for (const section of navSections) {
    for (const child of section.children) {
        routeMap[child.href] = { label: child.label, section: section.title };
    }
}

/* Expliciete labels voor sub-route segments — beter dan auto-format
   (zoals "Allergen queue") wanneer de tab/UI een andere naam hanteert. */
const subRouteLabels: Record<string, string> = {
    'componenten':      'Componenten',
    'ingredienten':     'Ingrediënten',
    'allergen-queue':   'Allergenen',
    'insights':         'Insights',
    'menu-analyse':     'Menu-analyse',
    'ai-pitmaster':     'AI Pitmaster',
};

export default function Breadcrumbs() {
    const pathname = usePathname();
    const { active } = useActiveResource();

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

    /* Entity-breadcrumb: op een detail-route waar de active-resource matcht met
       deze sectie, tonen we de entiteit-naam ("Bruiloft Veldhoven") als laatste
       crumb i.p.v. de kale id/segment-tail. Maakt detail-pagina's onderdeel van
       het ecosysteem-pad i.p.v. losse "11 > View"-eilanden. */
    const entityCrumb = (active && isSubPage && KIND_BASEPATH[active.kind] === basePath)
        ? active.label
        : null;

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
            {isSubPage && entityCrumb ? (
                /* Entiteit-naam i.p.v. id-segmenten ("11 > View" → "hopp") */
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ChevronRight size={11} style={{ opacity: 0.4 }} />
                    <span style={{ color: 'var(--text)', fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entityCrumb}
                    </span>
                </span>
            ) : isSubPage && subSegments.map(function (seg, i) {
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
