/* eslint-disable @next/next/no-img-element */
'use client';

import { usePathname } from 'next/navigation';
import { useBrandLogo } from '@/lib/useBrandLogo';

/*
 * BrandPlaque — bedrijfslogo vast op elke pagina, linksboven in de content-area.
 * Transparant gemaakt via mix-blend-mode: screen (zwart wordt transparant).
 * Het sidebar-logo is de primaire brand-positie; de plaque geeft extra accent
 * op de pagina-content (binnen main-area, net voorbij de sidebar).
 */

const SUPPRESSED_PATHS = [
    '/login',
    '/signup',
    '/invite',
    '/q/',            // publieke offerte-view — eigen branding
];

export default function BrandWatermark() {
    const pathname = usePathname() || '';
    const brand = useBrandLogo();

    const suppressed = SUPPRESSED_PATHS.some(p => pathname.startsWith(p));
    if (suppressed) return null;

    const logo = brand.logoDarkUrl || brand.logoUrl;
    if (!logo) return null;

    return (
        <div className="brand-plaque" aria-hidden="true">
            <img src={logo} alt="" className="bp-logo-img" />
        </div>
    );
}
