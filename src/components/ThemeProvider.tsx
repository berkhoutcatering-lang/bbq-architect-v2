/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useEffect } from 'react';
import { useSettings } from '@/lib/useSupabase';

/**
 * Leest brand_* kleuren uit settings en schrijft ze naar :root als CSS variabelen.
 * App-brede thema-wissel: background, tekst, kaarten, primair + tweede accent.
 * Semantische kleuren (red/green/amber) worden NIET overschreven.
 */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
    const { settings } = useSettings();

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const s: any = settings || {};
        const bg = s.brand_background || '#0a0a0d';
        const text = s.brand_text || '#ffffff';
        const card = s.brand_card || '#15151a';
        const primary = s.brand_primary || '#c4a35a';
        const accent = s.brand_accent || primary;
        // brand_secondary (donker) wordt gebruikt als diepere-bg voor hero-kaart
        const secondary = s.brand_secondary || bg;

        const root = document.documentElement;
        // App-shell variabelen
        root.style.setProperty('--bg', bg);
        root.style.setProperty('--color-bg-primary', bg);
        root.style.setProperty('--color-bg-deep', shade(bg, -3));
        root.style.setProperty('--color-bg-elevated', shade(bg, 6));
        root.style.setProperty('--text', text);
        root.style.setProperty('--color-text-primary', text);
        root.style.setProperty('--muted', mix(text, bg, 0.55));
        root.style.setProperty('--muted-light', mix(text, bg, 0.35));
        root.style.setProperty('--color-text-muted', mix(text, bg, 0.55));
        root.style.setProperty('--color-text-ghost', mix(text, bg, 0.25));
        root.style.setProperty('--card', card);
        root.style.setProperty('--card-solid', shade(card, 8));
        root.style.setProperty('--sidebar-bg-hover', shade(card, 10));
        root.style.setProperty('--border', shade(card, 12));
        root.style.setProperty('--border-strong', shade(card, 22));
        root.style.setProperty('--color-border-hover', shade(card, 20));
        // Brand-accent variabelen
        root.style.setProperty('--brand', primary);
        root.style.setProperty('--brand-primary', primary);
        root.style.setProperty('--brand-accent', accent);
        root.style.setProperty('--brand-secondary', secondary);
        root.style.setProperty('--color-accent-gold', primary);
        root.style.setProperty('--hb-gold', primary);
    }, [settings]);

    return <>{children}</>;
}

// Verlicht/donker een hex met N procent
function shade(hex: string, percent: number): string {
    const h = hex.replace('#', '');
    if (h.length !== 6) return hex;
    const num = parseInt(h, 16);
    const r = (num >> 16) & 0xff;
    const g = (num >> 8) & 0xff;
    const b = num & 0xff;
    const p = percent / 100;
    const nr = Math.max(0, Math.min(255, Math.round(r + (p > 0 ? (255 - r) * p : r * p))));
    const ng = Math.max(0, Math.min(255, Math.round(g + (p > 0 ? (255 - g) * p : g * p))));
    const nb = Math.max(0, Math.min(255, Math.round(b + (p > 0 ? (255 - b) * p : b * p))));
    return '#' + [nr, ng, nb].map(n => n.toString(16).padStart(2, '0')).join('');
}

// Meng kleur A met kleur B met gegeven verhouding
function mix(hexA: string, hexB: string, ratio: number): string {
    const a = hexA.replace('#', '');
    const b = hexB.replace('#', '');
    if (a.length !== 6 || b.length !== 6) return hexA;
    const na = parseInt(a, 16);
    const nb = parseInt(b, 16);
    const ar = (na >> 16) & 0xff;
    const ag = (na >> 8) & 0xff;
    const ab = na & 0xff;
    const br = (nb >> 16) & 0xff;
    const bg = (nb >> 8) & 0xff;
    const bb = nb & 0xff;
    const r = Math.round(ar * ratio + br * (1 - ratio));
    const g = Math.round(ag * ratio + bg * (1 - ratio));
    const blue = Math.round(ab * ratio + bb * (1 - ratio));
    return '#' + [r, g, blue].map(n => n.toString(16).padStart(2, '0')).join('');
}
