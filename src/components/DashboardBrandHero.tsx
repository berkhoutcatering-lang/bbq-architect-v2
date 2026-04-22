'use client';

import { useEffect, useState } from 'react';
import { useBrandLogo } from '@/lib/useBrandLogo';

/*
 * DashboardBrandHero — editorial-style header met bedrijfsnaam.
 * Geen logo — alleen typografie-gedreven met live tijd, greeting,
 * en bedrijfsnaam met gradient-shine.
 */

export default function DashboardBrandHero() {
    const brand = useBrandLogo();
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
        </header>
    );
}
