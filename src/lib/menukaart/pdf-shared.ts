/**
 * Gedeelde helpers voor de 10 menukaart-PDF-componenten.
 *
 * Custom fonts worden geregistreerd via `registerMenukaartFonts()` in
 * `/api/menukaart/pdf/[offerId]/route.ts` (server-side, runs once per
 * cold-start). TTF-bronnen staan in `public/fonts/menukaart/`.
 *
 * Beschikbare custom fonts (na registratie):
 *   - 'Cormorant Garamond' (serif) — restaurant, tasting, invite
 *   - 'Oswald'             (display sans) — smokehouse
 *   - 'Space Grotesk'      (modern sans) — modern
 *   - 'IBM Plex Mono'      (mono) — minimal
 *   - 'Bebas Neue'         (condensed display) — duotone
 *   - 'Caveat'             (script) — rustic
 *   - 'Playfair Display'   (display serif) — invite
 *   - 'Rubik'              (geometric sans) — square (foodtruck)
 *   - 'Inter'              (humanist body) — multiple
 *   - 'Lora'               (serif body) — rustic
 *
 * Fonts die NIET geregistreerd zijn (Courier Prime, Cormorant, EB Garamond,
 * Lato, etc.) vallen via `mapFontToPdf` terug op een van de bovenstaande
 * geregistreerde families of op de ingebouwde Helvetica/Times-Roman/Courier.
 */

import type { Overrides } from './registry';
import type { MenuData } from './menu-data';

/** Lijst van custom-fonts die geregistreerd zijn in de PDF-route. */
export const REGISTERED_PDF_FONTS = [
    'Cormorant Garamond',
    'Oswald',
    'Space Grotesk',
    'IBM Plex Mono',
    'Bebas Neue',
    'Caveat',
    'Playfair Display',
    'Rubik',
    'Inter',
    'Lora',
] as const;

export type RegisteredPdfFont = (typeof REGISTERED_PDF_FONTS)[number];

/** Props gedeeld door alle 10 PDF-components. */
export type PdfTemplateProps = {
    overrides: Overrides;
    data: MenuData;
};

/**
 * Map een Google-font naam naar een PDF-font naam.
 *
 * Probeer eerst exact-match met een geregistreerd custom-font (`REGISTERED_PDF_FONTS`).
 * Anders fuzzy-match op familie (Cormorant Garamond ≈ Cormorant) of fallback
 * naar een visueel verwante familie. Allerlaatste fallback: ingebouwde
 * Helvetica/Times-Roman/Courier.
 */
export function mapFontToPdf(font: string | undefined): string {
    if (!font) return 'Helvetica';

    // 1. Exacte match met geregistreerde custom-fonts
    if (REGISTERED_PDF_FONTS.includes(font as RegisteredPdfFont)) {
        return font;
    }

    const lower = font.toLowerCase();

    // 2. Familie-aliassen: niet-geregistreerde variant → geregistreerd zus
    if (lower === 'cormorant') return 'Cormorant Garamond';
    if (lower === 'cormorant sc') return 'Cormorant Garamond';
    if (lower === 'eb garamond') return 'Cormorant Garamond';
    if (lower === 'crimson pro') return 'Playfair Display';
    if (lower === 'antonio') return 'Oswald';
    if (lower === 'work sans') return 'Inter';
    if (lower === 'dm sans') return 'Inter';
    if (lower === 'ibm plex sans') return 'Inter';
    if (lower === 'dancing script') return 'Caveat';
    if (lower === 'sacramento') return 'Caveat';
    if (lower === 'courier prime') return 'IBM Plex Mono';
    if (lower === 'jetbrains mono') return 'IBM Plex Mono';
    if (lower === 'space mono') return 'IBM Plex Mono';

    // 3. Categorie-fallback naar built-in PDF-fonts
    if (lower.includes('mono') || lower.includes('courier')) return 'Courier';
    if (lower.includes('cursive') || lower.includes('script')) return 'Times-Italic';
    if (
        lower.includes('serif') ||
        lower.includes('garamond') ||
        lower.includes('lora') ||
        lower.includes('georgia')
    ) {
        return 'Times-Roman';
    }
    if (lower.includes('bebas') || lower.includes('oswald') || lower.includes('antonio')) {
        return 'Helvetica-Bold';
    }

    return 'Helvetica';
}

/** Initialen voor een logo-fallback (max 2 letters, hoofdletter). */
export function logoInitials(brandName: string): string {
    return brandName
        .split(/\s+/)
        .map(w => w[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

/** Page-size per paper-type. */
export function pageSize(paper: 'a4' | 'square'): { width: number; height: number } {
    if (paper === 'square') return { width: 595, height: 595 }; // 21×21cm @ 72dpi (approx)
    return { width: 595, height: 842 }; // A4 @ 72dpi
}

/** Veilige string-validatie zodat een Text geen null/undefined krijgt. */
export function safeStr(v: unknown): string {
    if (v === null || v === undefined) return '';
    return String(v);
}

/** Allergeen-array → inline string ("G E Sd M"). */
export function allergensInline(allergens: string[] | undefined): string {
    if (!allergens || allergens.length === 0) return '';
    return allergens.join(' ');
}

/** Allergeen-array → bracketed string ("[G E Sd M]") voor smokehouse-stijl. */
export function allergensBracket(allergens: string[] | undefined): string {
    if (!allergens || allergens.length === 0) return '';
    return `[${allergens.join(' ')}]`;
}

/** Gemiddelde contrast-keuze: '#1A1A1A' of '#FFFFFF' tegen hex-kleur. */
export function pdfContrastColor(hex: string): '#1A1A1A' | '#FFFFFF' {
    const h = hex.replace('#', '');
    if (h.length !== 6) return '#FFFFFF';
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.45 ? '#1A1A1A' : '#FFFFFF';
}

/** Eventblock data uit overrides (titel + boodschap + positie). */
export type EventBlock = { title: string; message: string; position: 'top' | 'bottom' };

export function readEventBlock(overrides: Overrides): EventBlock | null {
    const title = (overrides.eventTitle ?? '').trim();
    const message = (overrides.eventMessage ?? '').trim();
    if (!title && !message) return null;
    const position = overrides.eventMessagePosition === 'bottom' ? 'bottom' : 'top';
    return { title, message, position };
}

/** Tenant-info compileren voor footer-strings. */
export function footerLine(overrides: Overrides): string {
    if (overrides.footer && overrides.footer.trim()) return overrides.footer;
    const parts = [overrides.addressLine, overrides.email, overrides.website].filter(s => s && s.trim()) as string[];
    return parts.join(' · ');
}
