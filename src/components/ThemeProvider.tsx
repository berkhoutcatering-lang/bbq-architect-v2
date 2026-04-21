/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useEffect } from 'react';
import { useSettings } from '@/lib/useSupabase';

/**
 * Leest brand_primary / brand_accent / brand_secondary uit settings
 * en schrijft ze naar :root als CSS custom properties.
 * Wordt live bijgewerkt bij wijziging (voor instellingen-pagina preview).
 */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
    const { settings } = useSettings();

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const s: any = settings || {};
        const primary = s.brand_primary || '#c4a35a';
        const accent = s.brand_accent || primary;
        const secondary = s.brand_secondary || '#1a1a1a';

        const root = document.documentElement;
        root.style.setProperty('--brand', primary);
        root.style.setProperty('--brand-primary', primary);
        root.style.setProperty('--brand-accent', accent);
        root.style.setProperty('--brand-secondary', secondary);
        root.style.setProperty('--color-accent-gold', primary);
        root.style.setProperty('--hb-gold', primary);
    }, [settings]);

    return <>{children}</>;
}
