'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { vindWerkruimte } from '@/lib/navigation';
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

/* Labels voor routes zonder eigen tabblad (de `ook`-routes in navigation.tsx)
   en voor sub-segmenten waar een mooiere naam bij hoort dan de slug. */
const LABELS: Record<string, string> = {
    '/marges': 'Marges & analyse',
    '/ai-chat': 'AI Pitmaster',
    '/klantgesprek': 'Klantgesprek',
    '/prep-counter': 'Prep Counter',
    '/haccp': 'HACCP',
    '/labels': 'Labels',
    '/scan': 'Scan',
    '/systeem': 'Overzicht',
    '/administratie': 'Administratie',
    '/template-editor': 'Sjablonen',
    '/menu-templates': 'Menu-sjablonen',
};
const SEGMENT_LABELS: Record<string, string> = {
    componenten: 'Componenten',
    ingredienten: 'Ingrediënten',
    'allergen-queue': 'Allergenen',
    insights: 'Insights',
    'menu-analyse': 'Menu-analyse',
    'ai-pitmaster': 'AI Pitmaster',
    nieuw: 'Nieuw',
    bewerken: 'Bewerken',
    view: 'Bekijken',
    hub: 'Overzicht',
};

/* Detail-routes hebben niet altijd een geregistreerde active-resource, en dan
   viel het kruimelpad terug op de kale padsegmenten: "Gerechten › 8f2c1a4e-…"
   of "Facturen › 64 › View". Een UUID laten we weg, een nummer tonen we als
   "#64" zodat het als verwijzing leest en niet als woord. */
function segmentLabel(seg: string): string | null {
    if (SEGMENT_LABELS[seg]) return SEGMENT_LABELS[seg];
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return null;
    if (/^\d+$/.test(seg)) return '#' + seg;
    return seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ');
}

/**
 * Kruimelpad — sinds de werkruimtes (2026-10-20) alleen nog op pagina's
 * díeper dan een tabblad. Op een tabblad zelf zegt de werkruimtebalk al waar
 * je bent ("Verkoop", tab Offertes onderstreept); een tweede regel die
 * hetzelfde zegt kost alleen ruimte.
 *
 *   /events/11/hub        → Events › Bruiloft Veldhoven
 *   /voorraad/winkel/tellen → Winkel › Tellen
 *   /klantgesprek         → Klantgesprek   (hoort bij Plannen, geen eigen tab)
 */
export default function Breadcrumbs() {
    const pathname = usePathname();
    const { active } = useActiveResource();
    const match = vindWerkruimte(pathname);

    if (!match || !pathname) return null;
    /* Precies een tabblad: de balk zegt het al. */
    if (match.tab && pathname === match.tab.href) return null;

    const basis = match.tab ?? null;
    const basisLabel = basis ? basis.label : (LABELS[match.prefix] ?? segmentLabel(match.prefix.slice(1)) ?? '');
    const rest = pathname.slice(match.prefix.length).split('/').filter(Boolean);

    /* Entiteit-naam i.p.v. id-segmenten, als de actieve resource bij deze
       route hoort (bv. het event dat je open hebt). */
    const entiteit = active && rest.length > 0 && KIND_BASEPATH[active.kind] === match.prefix ? active.label : null;
    const kruimels = entiteit ? [entiteit] : rest.map(segmentLabel).filter(function (l): l is string { return l !== null; });

    /* Een ook-route zonder sub-pad (bv. /klantgesprek): één kruimel is
       genoeg om te zeggen waar je bent binnen de werkruimte. */
    return (
        <nav aria-label="Kruimelpad" className="wr-kruimels">
            {kruimels.length === 0 ? (
                <span aria-current="page">{basisLabel}</span>
            ) : (
                <>
                    {/* Alleen een tabblad is zeker een pagina; een ook-voorvoegsel
                        (/labels, /scan, /sectie) bestaat vaak niet los. */}
                    {basis ? <Link href={basis.href}>{basisLabel}</Link> : <span>{basisLabel}</span>}
                    {kruimels.map(function (k, i) {
                        const laatste = i === kruimels.length - 1;
                        return (
                            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <ChevronRight size={12} style={{ opacity: 0.5 }} aria-hidden="true" />
                                <span aria-current={laatste ? 'page' : undefined}>{k}</span>
                            </span>
                        );
                    })}
                </>
            )}
        </nav>
    );
}
