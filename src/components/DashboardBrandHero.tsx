/* eslint-disable @next/next/no-img-element */
'use client';

import { useBrandLogo } from '@/lib/useBrandLogo';

/*
 * DashboardBrandHero — grote prominente header met het bedrijfslogo
 * centraal bovenin, ALLEEN zichtbaar op de dashboard-pagina.
 *
 * Subtiel gedetailleerd met olijfgoud-glow achter het logo,
 * eyebrow-label met horizontale lijntjes (zoals een wapen/crest),
 * en optionele tagline onder het logo.
 *
 * Transparant via mix-blend-mode: screen — zwart in het logo-bestand
 * wordt wegge-masked zodat alleen het artwork overblijft.
 */

export default function DashboardBrandHero() {
    const brand = useBrandLogo();
    const logo = brand.logoDarkUrl || brand.logoUrl;

    if (!logo) return null;

    return (
        <section className="dashboard-brand-hero" aria-label="Bedrijfs-branding">
            <p className="dbh-eyebrow">{brand.bedrijfsnaam || 'Welkom'}</p>
            <div className="dbh-logo-wrap">
                <img src={logo} alt={brand.bedrijfsnaam || 'Bedrijfslogo'} className="dbh-logo" />
            </div>
            <p className="dbh-tagline">Catering, BBQ & Events — jouw command center</p>
        </section>
    );
}
