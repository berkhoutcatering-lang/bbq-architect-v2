'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { VANDAAG, vindWerkruimte, werkruimteStart } from '@/lib/navigation';
import { useOnderdelen } from '@/lib/useOnderdelen';
import { useOrg } from '@/lib/OrgContext';
import { useApp } from '@/lib/AppContext';
import { openZoekvenster } from './events';

/**
 * Het tegelscherm (Odoo-startscherm): Vandaag en elk ingeschakeld onderdeel
 * als grote tegel. Openen met ⊞ in de balk of "Meer" in de onderbalk; dicht
 * met Esc, het kruisje, een tik ernaast of door een tegel te kiezen.
 *
 * Wordt pas geladen als iemand hem opent (TegelschermHost in AppShell).
 */
export default function Tegelscherm({ onClose }: { onClose: () => void }) {
    const pathname = usePathname();
    const { organization, isAdmin } = useOrg();
    const { badges } = useApp();
    const { werkruimtes, toonbank } = useOnderdelen();
    const huidige = vindWerkruimte(pathname)?.section.slug ?? (pathname === '/' ? 'vandaag' : null);
    const paneelRef = useRef<HTMLDivElement>(null);
    const startPad = useRef(pathname);

    /* Dicht zodra je ergens anders heen gaat. */
    useEffect(function () {
        if (pathname !== startPad.current) onClose();
    }, [pathname, onClose]);

    /* Esc sluit; focus op de tegel van waar je nu bent (of de eerste), en
       Tab blijft binnen het scherm. Bij sluiten gaat de focus terug. */
    useEffect(function () {
        const vorige = document.activeElement as HTMLElement | null;
        const paneel = paneelRef.current;
        const eerste = paneel?.querySelector<HTMLElement>('.wr-tegel[aria-current="page"]')
            ?? paneel?.querySelector<HTMLElement>('.wr-tegel');
        eerste?.focus();
        function opToets(e: KeyboardEvent) {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
            if (e.key !== 'Tab' || !paneel) return;
            const focusbaar = Array.from(paneel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
            if (focusbaar.length === 0) return;
            const eersteEl = focusbaar[0];
            const laatsteEl = focusbaar[focusbaar.length - 1];
            if (e.shiftKey && document.activeElement === eersteEl) { e.preventDefault(); laatsteEl.focus(); }
            else if (!e.shiftKey && document.activeElement === laatsteEl) { e.preventDefault(); eersteEl.focus(); }
        }
        window.addEventListener('keydown', opToets);
        const vorigOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return function () {
            window.removeEventListener('keydown', opToets);
            document.body.style.overflow = vorigOverflow;
            vorige?.focus?.();
        };
    }, [onClose]);

    /* Telling op een tegel = de som van de tellers van zijn tabbladen
       (bv. verlopen offertes, achterstallige facturen). */
    function tellingVoor(hrefs: string[]): number {
        return hrefs.reduce(function (som, h) { return som + (badges[h] || 0); }, 0);
    }

    const tegels = [
        {
            slug: 'vandaag',
            titel: VANDAAG.title,
            href: VANDAAG.href,
            icoon: VANDAAG.icon,
            uitleg: VANDAAG.description,
            kleur: VANDAAG.kleur,
            telling: 0,
        },
        ...werkruimtes.map(function (s) {
            return {
                slug: s.slug,
                titel: s.title,
                href: werkruimteStart(s),
                icoon: s.icon,
                uitleg: s.description,
                kleur: s.kleur,
                telling: tellingVoor(s.children.map(function (c) { return c.href; })),
            };
        }),
    ];

    return (
        <div className="wr-tegels-achtergrond" onClick={onClose}>
            <div
                ref={paneelRef}
                className="wr-tegels"
                role="dialog"
                aria-modal="true"
                aria-labelledby="wr-tegels-titel"
                onClick={function (e) { e.stopPropagation(); }}
            >
                <div className="wr-tegels-kop">
                    <div>
                        <h2 id="wr-tegels-titel" className="wr-tegels-titel">Waar wil je heen?</h2>
                        {organization?.name ? <div className="wr-tegels-sub">{organization.name}</div> : null}
                    </div>
                    <button type="button" className="wr-sluit" onClick={onClose} aria-label="Sluiten">
                        <X size={20} />
                    </button>
                </div>

                <nav className="wr-tegel-raster" aria-label="Onderdelen">
                    {tegels.map(function (t, i) {
                        return (
                            <Link
                                key={t.slug}
                                href={t.href}
                                className="wr-tegel"
                                aria-current={huidige === t.slug ? 'page' : undefined}
                                onClick={onClose}
                                style={{ ['--wr-kleur' as string]: t.kleur, animationDelay: (i * 25) + 'ms' }}
                            >
                                <span className="wr-tegel-icoon" aria-hidden="true">{t.icoon}</span>
                                <span className="wr-tegel-naam">{t.titel}</span>
                                <span className="wr-tegel-uitleg">{t.uitleg}</span>
                                {t.telling > 0 ? (
                                    <span className="wr-badge" aria-label={t.telling + ' vragen aandacht'}>{t.telling}</span>
                                ) : null}
                            </Link>
                        );
                    })}
                    {toonbank ? (
                        /* De Toonbank is een aparte app, ook onder /toonbank:
                           een gewone link die de pagina echt laadt, geen Link
                           (die blijft binnen de Next-app). Alleen een adres
                           buiten BBQ Architect opent in een nieuw tabblad. */
                        <a
                            key={toonbank.slug}
                            href={toonbank.href}
                            target={toonbank.nieuwTabblad ? '_blank' : undefined}
                            rel={toonbank.nieuwTabblad ? 'noopener noreferrer' : undefined}
                            className="wr-tegel"
                            onClick={onClose}
                            style={{ ['--wr-kleur' as string]: toonbank.kleur, animationDelay: (tegels.length * 25) + 'ms' }}
                        >
                            <span className="wr-tegel-icoon" aria-hidden="true">{toonbank.icon}</span>
                            <span className="wr-tegel-naam">{toonbank.title}</span>
                            <span className="wr-tegel-uitleg">{toonbank.description}</span>
                        </a>
                    ) : null}
                </nav>

                <div className="wr-tegels-voet">
                    <button type="button" onClick={function () { onClose(); openZoekvenster(); }}>
                        Iets specifieks zoeken? Zoek op naam (⌘K)
                    </button>
                    {isAdmin ? <Link href="/instellingen/onderdelen" onClick={onClose}>Onderdelen aan/uit</Link> : null}
                </div>
            </div>
        </div>
    );
}
