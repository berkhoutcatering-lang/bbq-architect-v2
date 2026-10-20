'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Flame, LayoutGrid, Search } from 'lucide-react';
import { VANDAAG, isTabZichtbaar, vindWerkruimte, werkruimteStart } from '@/lib/navigation';
import { useOnderdelen } from '@/lib/useOnderdelen';
import { useOrg } from '@/lib/OrgContext';
import { useApp } from '@/lib/AppContext';
import ActiveResourcePill from '@/components/ActiveResourcePill';
import GebruikerMenu from './GebruikerMenu';
import { openTegelscherm, openZoekvenster } from './events';

/* Nieuws-belletje: bijzaak, eigen stukje JavaScript dat na de pagina komt. */
const Changelog = dynamic(() => import('@/components/Changelog'), { ssr: false });

/**
 * De werkruimtebalk — vervangt de zijbalk (2026-10-20).
 *
 *   [⊞] [icoon Werkruimte] | tab tab tab …          [actief item] [Zoeken ⌘K] [🔔] [jij]
 *
 * Je ziet alléén de tabbladen van het onderdeel waar je bent, zoals in een
 * Odoo-app. Naar een ander onderdeel ga je via ⊞ (tegelscherm), de onderbalk
 * op de telefoon, of ⌘K. Op een telefoon schuiven de tabbladen naar een eigen
 * regel onder de titel (zie werkruimte.css).
 */
export default function WerkruimteBalk() {
    const pathname = usePathname();
    const { organization } = useOrg();
    const { badges } = useApp();
    const { opties } = useOnderdelen();
    const match = vindWerkruimte(pathname);
    const tabsRef = useRef<HTMLElement>(null);

    const section = match?.section ?? null;
    /* Een uitgezet tabblad blijft zichtbaar zolang je er via een directe link
       op staat — anders weet je niet waar je bent. */
    const tabs = section
        ? section.children.filter(function (c) { return isTabZichtbaar(c, opties) || c === match?.tab; })
        : [];

    /* Actieve tab in beeld schuiven (telefoon, of veel tabbladen). */
    useEffect(function () {
        const nav = tabsRef.current;
        if (!nav) return;
        const actief = nav.querySelector<HTMLElement>('[aria-current="page"]');
        if (actief) actief.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [pathname]);

    const titel = section ? section.title : pathname === '/' ? VANDAAG.title : 'BBQ Architect';
    const kleur = section ? section.kleur : VANDAAG.kleur;
    const icoon = section ? section.icon : pathname === '/' ? VANDAAG.icon : <Flame size={18} />;
    const start = section ? werkruimteStart({ ...section, children: tabs }) : '/';

    return (
        <header
            role="banner"
            className="wr-balk"
            style={{ ['--wr-kleur' as string]: kleur }}
        >
            <button
                type="button"
                className="wr-tegelknop"
                onClick={openTegelscherm}
                aria-label="Alle onderdelen"
                title="Alle onderdelen"
            >
                <LayoutGrid size={20} />
            </button>

            <Link href={start} className="wr-titel">
                <span className="wr-icoon" style={{ background: kleur }} aria-hidden="true">{icoon}</span>
                <span className="wr-titel-tekst">
                    {titel}
                    {organization?.name ? <span className="wr-org">{organization.name}</span> : null}
                </span>
            </Link>

            <nav ref={tabsRef} className="wr-tabs" aria-label={section ? 'Tabbladen ' + section.title : 'Tabbladen'}>
                {tabs.map(function (tab) {
                    const actief = match?.tab?.href === tab.href;
                    const badge = badges[tab.href];
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className="wr-tab"
                            aria-current={actief ? 'page' : undefined}
                            title={tab.description}
                        >
                            {tab.icon}
                            {tab.label}
                            {badge ? <span className="wr-badge" aria-label={badge + ' vragen aandacht'}>{badge}</span> : null}
                        </Link>
                    );
                })}
            </nav>

            <div className="wr-acties">
                <ActiveResourcePill />
                <button type="button" className="wr-zoek" onClick={openZoekvenster} aria-label="Zoeken">
                    <Search size={16} />
                    <span className="wr-zoek-tekst">Zoeken</span>
                    <kbd>⌘K</kbd>
                </button>
                <span className="wr-nieuws"><Changelog /></span>
                <GebruikerMenu />
            </div>
        </header>
    );
}
