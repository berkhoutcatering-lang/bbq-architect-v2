/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useEffect } from 'react';
import { useSettings } from '@/lib/useSupabase';

/**
 * Leest brand_* kleuren uit settings en schrijft ze naar :root als CSS variabelen.
 * App-brede thema-wissel: background, tekst, kaarten, primair + tweede accent.
 *
 * Derived tokens (border, muted, deep/elevated bg, hover surfaces) worden niet
 * pre-flattened naar hex — ze worden geschreven als `color-mix(in oklch, …)`
 * expressies zodat de browser perceptuele math doet op render. Dit is wat
 * eerder ontbrak: linear-RGB shade/mix gaf op warme + lichte presets
 * onzichtbare borders en muted-text die "wegvalt".
 *
 * Tegelijk wordt `data-theme-mode="light|dark"` op <html> gezet zodat
 * globals.css per-mode overrides kan doen waar OKLCH-derivation alleen
 * niet genoeg is (status-tinted surfaces, sterke shadows, etc).
 *
 * Semantische kleuren (red/green/amber) worden NIET overschreven.
 */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
    const { settings } = useSettings();

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const s: any = settings || {};
        const bg = s.brand_background || '#121214';
        const text = s.brand_text || '#f8f8f8';
        const card = s.brand_card || '#1e1e22';
        const primary = s.brand_primary || '#c4a35a';
        const accent = s.brand_accent || primary;
        const secondary = s.brand_secondary || bg;

        const root = document.documentElement;

        // ── Source tokens (raw hex from settings) ─────────────────────────
        root.style.setProperty('--bg', bg);
        root.style.setProperty('--text', text);
        root.style.setProperty('--card', card);
        root.style.setProperty('--card-solid', card);
        root.style.setProperty('--brand', primary);
        root.style.setProperty('--brand-primary', primary);
        root.style.setProperty('--brand-accent', accent);
        root.style.setProperty('--brand-secondary', secondary);
        root.style.setProperty('--hb-gold', primary);
        root.style.setProperty('--color-accent-gold', primary);

        // ── Legacy semantic aliases (used by older components) ────────────
        root.style.setProperty('--color-bg-primary', bg);
        root.style.setProperty('--color-bg-card', card);
        root.style.setProperty('--color-text-primary', text);

        // ── Derived tokens via CSS color-mix(in oklch) ────────────────────
        // Mix-towards-text is direction-aware automatisch: op dark themes is
        // text licht → border/muted gaan lichter dan card/bg. Op light themes
        // is text donker → border/muted gaan donkerder dan card/bg. Eén regel,
        // werkt perceptueel correct op alle 6 presets.
        root.style.setProperty('--muted', `color-mix(in oklch, ${text} 55%, ${bg})`);
        root.style.setProperty('--muted-light', `color-mix(in oklch, ${text} 70%, ${bg})`);
        root.style.setProperty('--color-text-muted', `color-mix(in oklch, ${text} 55%, ${bg})`);
        root.style.setProperty('--color-text-ghost', `color-mix(in oklch, ${text} 35%, ${bg})`);

        // Borders/hovers/elevated tracken text-richting vanaf card.
        root.style.setProperty('--border', `color-mix(in oklch, ${card}, ${text} 12%)`);
        root.style.setProperty('--border-strong', `color-mix(in oklch, ${card}, ${text} 24%)`);
        root.style.setProperty('--color-border', `color-mix(in oklch, ${card}, ${text} 12%)`);
        root.style.setProperty('--color-border-hover', `color-mix(in oklch, ${card}, ${text} 20%)`);
        root.style.setProperty('--sidebar-bg-hover', `color-mix(in oklch, ${card}, ${text} 8%)`);
        root.style.setProperty('--color-bg-elevated', `color-mix(in oklch, ${card}, ${text} 4%)`);

        // Deep/darker bg gaan altijd absoluut donkerder (richting zwart), niet
        // text-direction. "Deep" betekent visueel "verder weg" — dat is donker
        // op dark themes én licht-themas (cream → iets diepere cream).
        root.style.setProperty('--color-bg-deep', `color-mix(in oklch, ${bg}, black 5%)`);
        root.style.setProperty('--color-bg-darker', `color-mix(in oklch, ${bg}, black 12%)`);

        // ── Theme mode flag voor globals.css selectors ────────────────────
        // [data-theme-mode="light"] overrides voor de paar tokens die niet
        // met simpele text-direction op te lossen zijn (shadows, status-tints).
        const themeMode = perceivedLightness(bg) > 0.5 ? 'light' : 'dark';
        root.setAttribute('data-theme-mode', themeMode);
    }, [settings]);

    return <>{children}</>;
}

/**
 * Schat perceptuele lightness uit een hex-string (sRGB → CIE Y → L*).
 * Alleen gebruikt voor het routeren van `data-theme-mode`. De werkelijke
 * kleur-math draait in de browser via `color-mix(in oklch, …)`.
 */
function perceivedLightness(hex: string): number {
    const h = hex.replace('#', '');
    if (h.length !== 6) return 0.5;
    const num = parseInt(h, 16);
    const r = ((num >> 16) & 0xff) / 255;
    const g = ((num >> 8) & 0xff) / 255;
    const b = (num & 0xff) / 255;
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return Math.cbrt(Y);
}
