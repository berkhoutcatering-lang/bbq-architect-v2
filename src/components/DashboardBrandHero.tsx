/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { useBrandLogo } from '@/lib/useBrandLogo';

/*
 * DashboardBrandHero — elegante editorial-style dashboard-header.
 * Logo als stijlvol crest/monogram rechts, asymmetrische layout,
 * typografie-gedreven. Niet een groot blok maar een refined accent.
 *
 * Logo transparant via mix-blend-mode: lighten + brightness filter —
 * werkt beter dan screen tegen olijf-groene achtergrond, want
 * lighten houdt ALLEEN pixels lichter dan de achtergrond zichtbaar.
 */

export default function DashboardBrandHero() {
    const brand = useBrandLogo();
    const logo = brand.logoDarkUrl || brand.logoUrl;
    const [now, setNow] = useState<Date | null>(null);

    useEffect(() => {
        setNow(new Date());
        const t = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(t);
    }, []);

    const hour = now?.getHours() ?? 12;
    const greeting = hour < 6 ? 'Goedemorgen' : hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond';
    const dayStr = now
        ? now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
        : '';
    const timeStr = now ? now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '';

    return (
        <header className="dash-hero" aria-label="Dashboard header">
            <div className="dash-hero-left">
                <div className="dash-hero-eyebrow">
                    <span className="deh-dot" />
                    <span className="deh-time">{timeStr}</span>
                    <span className="deh-sep">·</span>
                    <span className="deh-day">{dayStr || 'Vandaag'}</span>
                </div>
                <h1 className="dash-hero-title">
                    <span className="dht-grey">{greeting},</span>{' '}
                    <span className="dht-accent">{brand.bedrijfsnaam || 'Pitmaster'}</span>
                </h1>
                <p className="dash-hero-sub">
                    <span className="dhs-chip">Jouw command center</span>
                    <span className="dhs-text">Catering · BBQ · Events — alles in één plek.</span>
                </p>
            </div>

            {logo && (
                <div className="dash-hero-right">
                    <div className="dhc-crest">
                        <div className="dhc-ring" />
                        <img src={logo} alt="" className="dhc-logo" />
                    </div>
                    <div className="dhc-line" />
                </div>
            )}
        </header>
    );
}
