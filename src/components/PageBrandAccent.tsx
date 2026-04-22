/* eslint-disable @next/next/no-img-element */
'use client';

import { usePathname } from 'next/navigation';
import { useBrandLogo } from '@/lib/useBrandLogo';

/*
 * PageBrandAccent — bedrijfslogo geïntegreerd in de header van elke pagina.
 * Staat naast de breadcrumbs, niet als overlay maar als onderdeel van de
 * navigatie-bar. Transparant via mix-blend-mode: screen.
 *
 * Suppressed op auth / publieke / editor pagina's.
 */

const SUPPRESSED_PATHS = [
    '/login',
    '/signup',
    '/invite',
    '/q/',
];

export default function PageBrandAccent() {
    const pathname = usePathname() || '';
    const brand = useBrandLogo();

    const suppressed = SUPPRESSED_PATHS.some(p => pathname.startsWith(p));
    if (suppressed) return null;

    const logo = brand.logoDarkUrl || brand.logoUrl;
    if (!logo) return null;

    return (
        <div className="page-brand-accent" aria-hidden="true">
            <div className="pba-divider" />
            <img src={logo} alt="" className="pba-logo" />
            {brand.bedrijfsnaam && (
                <span className="pba-name">{brand.bedrijfsnaam}</span>
            )}
        </div>
    );
}
