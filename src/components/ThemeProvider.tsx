/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useEffect } from 'react';
import { useSettings } from '@/lib/useSupabase';
import { perceivedLightness } from '@/lib/colorMath';
import { themeCssVars } from '@/lib/themeTokens';
import { findPresetBySignature } from '@/lib/themes';

/**
 * Hydrates :root CSS variables from the tenant's saved brand_* settings.
 *
 * - Source tokens (--bg, --text, --card, --brand*) come straight from settings.
 * - Derived tokens (--muted*, --border*, --color-bg-*) are written as
 *   `color-mix(in oklch, ...)` expressions so the browser does perceptual
 *   math at paint time.
 * - Muted weights are mode-aware (65/78% on light, 55/70% on dark) — fixes
 *   the "letters vallen weg" bug where a fixed 55% mix on light themes
 *   produced muted-text below WCAG AA.
 * - `data-theme-mode="light|dark"` on <html> drives the per-mode overrides
 *   in globals.css (status-tinted surfaces, shadows).
 * - Cookies `theme-mode` + `theme-preset-id` persist across reloads so
 *   layout.tsx can inject the correct :root on first paint (no FOUC).
 *
 * The actual mode/preset/var construction lives in @/lib/themeTokens so
 * the server-side FOUC path and the client-side runtime stay in sync.
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

        const mode: 'light' | 'dark' = perceivedLightness(bg) > 0.5 ? 'light' : 'dark';

        const root = document.documentElement;
        for (const [name, value] of themeCssVars({ bg, text, card, primary, accent, secondary, mode })) {
            root.style.setProperty(name, value);
        }
        root.setAttribute('data-theme-mode', mode);

        // Persist for SSR first-paint. Preset id is only written when the
        // tenant's hex signature exact-matches a curated preset; custom-hex
        // tenants leave the existing cookie (or none) alone and accept a
        // brief flash of the default preset before hydration.
        const matched = findPresetBySignature(bg, primary);
        const oneYear = 60 * 60 * 24 * 365;
        document.cookie = `theme-mode=${mode}; max-age=${oneYear}; path=/; SameSite=Lax`;
        if (matched) {
            document.cookie = `theme-preset-id=${matched.id}; max-age=${oneYear}; path=/; SameSite=Lax`;
        }
    }, [settings]);

    return <>{children}</>;
}
